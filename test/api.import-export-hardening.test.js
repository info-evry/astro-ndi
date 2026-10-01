/**
 * CSV import / export hardening: generated passwords, duplicates, CSV
 * injection, delimiters, BOM, size limits and malformed rows.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { verifyPassword } from '../src/shared/crypto.js';
import {
  setupSchema, clearAllTables, seedTeam, adminFetch, postJson, countRows, uniq, BASE, JSON_HEADERS
} from './helpers.js';

beforeAll(setupSchema);
beforeEach(clearAllTables);

const importCsv = (csv) => adminFetch('/api/admin/import', { method: 'POST', body: { csv } });

/** Minimal parser for the semicolon-delimited, quote-escaped export format. */
function parseExport(text) {
  const records = [];
  let field = '';
  let record = [];
  let quoted = false;
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    const escapedQuote = quoted && char === '"' && text[i + 1] === '"';
    if (escapedQuote) {
      field += '"';
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ';') {
      record.push(field);
      field = '';
    } else if (!quoted && char === '\r') {
      // CRLF line endings: the \n that follows ends the record
    } else if (!quoted && char === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += char;
    }
    i += escapedQuote ? 2 : 1;
  }
  record.push(field);
  records.push(record);
  return records;
}

describe('CSV import - generated team passwords', () => {
  it('returns one random password per new team, and each verifies against the stored hash', async () => {
    const [teamA, teamB] = [uniq('ImpA'), uniq('ImpB')];
    const csv = [
      'firstName,lastName,email,teamName',
      `Ann,${uniq('L')},ann@example.com,${teamA}`,
      `Bob,${uniq('L')},bob@example.com,${teamA}`,
      `Cid,${uniq('L')},cid@example.com,${teamB}`
    ].join('\n');

    const response = await importCsv(csv);
    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.stats).toMatchObject({ teamsCreated: 2, membersImported: 3, membersSkipped: 0, totalRows: 3 });
    expect(data.passwords.map(p => p.team).sort()).toEqual([teamA, teamB].sort());

    const passwords = data.passwords.map(p => p.password);
    expect(new Set(passwords).size).toBe(2);
    for (const { team, password } of data.passwords) {
      expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]{16}$/);

      const row = await env.DB.prepare('SELECT password_hash FROM teams WHERE name = ?').bind(team).first();
      expect(row.password_hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
      expect(row.password_hash).not.toContain(password);
      expect(await verifyPassword(password, row.password_hash)).toBe(true);
      expect(await verifyPassword(`${password}x`, row.password_hash)).toBe(false);
    }
  });

  it('gives passwords that actually open the team view', async () => {
    const team = uniq('ViewImp');
    const last = uniq('L');
    const data = await (await importCsv(`firstName,lastName,email,teamName\nVia,${last},via@example.com,${team}`)).json();
    const teamId = (await env.DB.prepare('SELECT id FROM teams WHERE name = ?').bind(team).first()).id;

    const ok = await postJson(`/api/teams/${teamId}/view`, { password: data.passwords[0].password });
    expect(ok.status).toBe(200);
    expect((await ok.json()).team.members.map(m => m.lastName)).toEqual([last]);
  });

  it('shows a password only once: re-importing into an existing team returns none', async () => {
    const team = uniq('Once');
    const csv = (n) => `firstName,lastName,email,teamName\nOnce${n},${uniq('L')},once${n}@example.com,${team}`;

    const first = await (await importCsv(csv(1))).json();
    expect(first.passwords).toHaveLength(1);

    const second = await (await importCsv(csv(2))).json();
    expect(second.passwords).toEqual([]);
    expect(second.stats.teamsCreated).toBe(0);
    expect(await countRows('teams', 'WHERE name = ?', team)).toBe(1);
  });

  it('matches existing team names case-insensitively and does not touch their password', async () => {
    const team = await seedTeam({ name: `Mixed${uniq('')}Case` });
    const before = (await env.DB.prepare('SELECT password_hash FROM teams WHERE id = ?').bind(team.id).first()).password_hash;

    const data = await (await importCsv(
      `firstName,lastName,email,teamName\nCase,${uniq('L')},case@example.com,${team.name.toUpperCase()}`
    )).json();

    expect(data.stats.teamsCreated).toBe(0);
    expect(data.passwords).toEqual([]);
    expect(await countRows('members', 'WHERE team_id = ?', team.id)).toBe(2);
    const after = (await env.DB.prepare('SELECT password_hash FROM teams WHERE id = ?').bind(team.id).first()).password_hash;
    expect(after).toBe(before);
  });
});

describe('CSV import - duplicates and invalid rows', () => {
  it('skips members already registered (even in another team) without moving them', async () => {
    const existing = await seedTeam({ members: 1 });
    const { first_name: first, last_name: last } = await env.DB.prepare('SELECT first_name, last_name FROM members WHERE id = ?')
      .bind(existing.memberIds[0]).first();

    const other = uniq('Other');
    const data = await (await importCsv(
      `firstName,lastName,email,teamName\n${first},${last},dup@example.com,${other}`
    )).json();

    expect(data.stats).toMatchObject({ membersImported: 0, membersSkipped: 1 });
    const row = await env.DB.prepare('SELECT team_id FROM members WHERE first_name = ? AND last_name = ?').bind(first, last).first();
    expect(row.team_id).toBe(existing.id);
  });

  it('skips a name repeated inside the same file', async () => {
    const last = uniq('L');
    const team = uniq('Rep');
    const data = await (await importCsv([
      'firstName,lastName,email,teamName',
      `Same,${last},a@example.com,${team}`,
      `Same,${last},b@example.com,${team}`
    ].join('\n'))).json();

    expect(data.stats).toMatchObject({ membersImported: 1, membersSkipped: 1 });
    expect(await countRows('members', 'WHERE last_name = ?', last)).toBe(1);
  });

  it('reports rows with a wrong column count in errors instead of dropping them silently', async () => {
    const team = uniq('Mal');
    const data = await (await importCsv([
      'firstName,lastName,email,teamName',
      `Good,${uniq('L')},good@example.com,${team}`,
      'Too,Few,columns',
      `Way,Too,Many,${team},extra,cells`
    ].join('\n'))).json();

    expect(data.stats).toMatchObject({ membersImported: 1, membersSkipped: 2, totalRows: 3 });
    expect(data.stats.errors).toHaveLength(2);
    expect(data.stats.errors[0]).toContain('Ligne 3');
    expect(data.stats.errors[1]).toContain('Ligne 4');
  });

  it('reports members without a name or email', async () => {
    const team = uniq('Miss');
    const data = await (await importCsv([
      'firstName,lastName,email,teamName',
      `NoMail,${uniq('L')},,${team}`,
      `,NoFirst,nofirst@example.com,${team}`
    ].join('\n'))).json();

    expect(data.stats.membersImported).toBe(0);
    expect(data.stats.membersSkipped).toBe(2);
    expect(data.stats.errors).toHaveLength(2);
    expect(data.stats.errors[0]).toMatch(/^Ligne 2 : .*L'adresse e-mail est requise/);
    expect(data.stats.errors[1]).toMatch(/^Ligne 3 : .*Le prénom est requis/);
  });

  it('caps the reported errors at 10', async () => {
    const lines = ['firstName,lastName,email,teamName', ...Array.from({ length: 15 }, () => 'bad,row')];
    lines.push(`Ok,${uniq('L')},ok@example.com,${uniq('Cap')}`);

    const data = await (await importCsv(lines.join('\n'))).json();
    expect(data.stats.membersSkipped).toBe(15);
    expect(data.stats.errors).toHaveLength(10);
    expect(data.stats.errorCount).toBe(15);
  });

  it('answers 400 no_valid_rows when every row has the wrong number of cells', async () => {
    const response = await importCsv('firstName,lastName,email,teamName\nonly,two');
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('no_valid_rows');
  });

  it('answers 400 for a header-only file and for a missing / non-string csv', async () => {
    expect((await importCsv('firstName,lastName,email,teamName')).status).toBe(400);
    expect((await adminFetch('/api/admin/import', { method: 'POST', body: {} })).status).toBe(400);
    expect((await adminFetch('/api/admin/import', { method: 'POST', body: { csv: 123 } })).status).toBe(400);
  });

  it('answers 400 for malformed JSON', async () => {
    const response = await adminFetch('/api/admin/import', { method: 'POST', body: '{not json' });
    expect(response.status).toBe(400);
  });

  it('stores formula-looking values verbatim', async () => {
    const team = '=HYPERLINK("http://evil.example")';
    const response = await importCsv(`firstName,lastName,email,teamName\n=cmd,+plus,inj@example.com,"${team.replaceAll('"', '')}"`);
    expect(response.status).toBe(200);
    expect(await countRows('members', "WHERE first_name = '=cmd' AND last_name = '+plus'")).toBe(1);
  });
});

describe('CSV import - formats', () => {
  it('accepts a UTF-8 BOM and Windows line endings', async () => {
    const team = uniq('Bom');
    const csv = `\uFEFFfirstName,lastName,email,teamName\r\nBom,${uniq('L')},bom@example.com,${team}\r\n`;

    const data = await (await importCsv(csv)).json();
    expect(data.stats).toMatchObject({ teamsCreated: 1, membersImported: 1 });
    expect(await countRows('teams', 'WHERE name = ?', team)).toBe(1);
  });

  it('handles quoted values containing commas', async () => {
    const team = uniq('Quoted');
    const data = await (await importCsv(
      `firstName,lastName,email,teamName\nQuo,${uniq('L')},quo@example.com,"${team}, the second"`
    )).json();

    expect(data.passwords[0].team).toBe(`${team}, the second`);
  });

  it('accepts a semicolon-delimited file (the delimiter is detected)', async () => {
    const team = uniq('Semi');
    const response = await importCsv(`firstName;lastName;email;teamName\nSemi;${uniq('L')};semi@example.com;${team}`);
    expect(response.status).toBe(200);
    expect((await response.json()).stats).toMatchObject({ membersImported: 1, teamsCreated: 1 });
    expect(await countRows('teams', 'WHERE name = ?', team)).toBe(1);
  });

  it('answers 400 missing_columns when a required column is absent', async () => {
    const response = await importCsv(`firstName;email;teamName\nSemi;semi@example.com;${uniq('Semi')}`);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.code).toBe('missing_columns');
    expect(data.error).toContain('lastname');
    expect(await countRows('members')).toBe(0);
  });

  it('lower-cases emails and treats ismanager Yes/1 as leader', async () => {
    const team = uniq('Lead');
    const lead = uniq('L');
    await importCsv(`firstName,lastName,email,teamName,isManager\nLead,${lead},LEAD@Example.COM,${team},Yes`);

    const row = await env.DB.prepare('SELECT email, is_leader, bac_level, food_diet FROM members WHERE last_name = ?').bind(lead).first();
    expect(row).toEqual({ email: 'lead@example.com', is_leader: 1, bac_level: 0, food_diet: 'none' });
  });
});

describe('CSV import - size limit and auth', () => {
  it('answers 413 for a body above 1 MB and imports nothing', async () => {
    const filler = 'x'.repeat(1_100_000);
    const response = await importCsv(`firstName,lastName,email,teamName\nBig,${filler},big@example.com,${uniq('Big')}`);

    expect(response.status).toBe(413);
    expect((await response.json()).code).toBe('payload_too_large');
    expect(await countRows('members')).toBe(0);
  });

  it('accepts a large but legal body', async () => {
    const lines = ['firstName,lastName,email,teamName'];
    const team = uniq('Many');
    for (let i = 0; i < 40; i++) lines.push(`Many${i},${uniq('L')},many${i}@example.com,${team}`);

    const data = await (await importCsv(lines.join('\n'))).json();
    expect(data.stats.membersImported).toBe(40);
  });

  it('rejects unauthenticated imports without side effects', async () => {
    const response = await SELF.fetch(`${BASE}/api/admin/import`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ csv: `firstName,lastName,email,teamName\nNo,Auth,noauth@example.com,${uniq('NoAuth')}` })
    });
    expect(response.status).toBe(401);
    expect(await countRows('members')).toBe(0);
  });

  it('answers 413 for oversized registrations too', async () => {
    const response = await postJson('/api/register', JSON.stringify({ filler: 'x'.repeat(1_100_000) }));
    expect(response.status).toBe(413);
  });
});

describe('CSV export - injection protection and format', () => {
  async function seedInjection() {
    const team = await seedTeam({ name: '-Cmd|team', members: 0 });
    const payloads = [
      ['=SUM(1+1)', '+49 123', '-2+3', '@cmd'],
      ['\tTabbed', 'normal', 'Plain', 'x']
    ];
    for (const [i, [first, last, email, diet]] of payloads.entries()) {
      await env.DB.prepare('INSERT INTO members (team_id, first_name, last_name, email, bac_level, food_diet) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(team.id, first, last, `${i}${email}`, 3, diet).run();
    }
    return team;
  }

  it('prefixes dangerous leading characters (= + - @ tab) so spreadsheets do not run them', async () => {
    await seedInjection();

    const response = await adminFetch('/api/admin/export');
    expect(response.status).toBe(200);
    const records = parseExport(await response.text());
    const cells = records.flat();

    expect(cells).toContain("'=SUM(1+1)");
    // a phone number is not a formula: it is written as is
    expect(cells).toContain('+49 123');
    expect(cells).toContain("'-Cmd|team");
    expect(cells).toContain("'\tTabbed");
    expect(cells).toContain("'@cmd");
    // no cell may still start with a formula trigger (apart from the phone number)
    for (const cell of cells) {
      if (/^[=+\-@\t\r]/.test(cell)) expect(cell).toMatch(/^\+?[\d ().-]+$/);
    }
  });

  it('applies the same protection to the team and official exports', async () => {
    const team = await seedInjection();

    for (const path of [`/api/admin/export/${team.id}`, '/api/admin/export-official', `/api/admin/export-official/${team.id}`]) {
      const cells = parseExport(await (await adminFetch(path)).text()).flat();
      expect(cells).toContain("'=SUM(1+1)");
      for (const cell of cells) {
        if (/^[=+\-@\t\r]/.test(cell)) expect(cell).toMatch(/^\+?[\d ().-]+$/);
      }
    }
  });

  it('keeps the database values untouched', async () => {
    await seedInjection();
    await adminFetch('/api/admin/export');
    expect(await countRows('members', "WHERE first_name = '=SUM(1+1)'")).toBe(1);
  });

  it('quotes delimiters, quotes and newlines so a row never splits', async () => {
    const team = await seedTeam({ name: 'Semi;colon "team"', members: 0 });
    await env.DB.prepare('INSERT INTO members (team_id, first_name, last_name, email) VALUES (?, ?, ?, ?)')
      .bind(team.id, 'Li\nne', 'Or;der', 'quote"d@example.com').run();

    const records = parseExport(await (await adminFetch('/api/admin/export')).text());
    const row = records.find(r => r[1] === 'Li\nne');

    expect(row).toBeDefined();
    expect(row).toHaveLength(9);
    expect(row[2]).toBe('Or;der');
    expect(row[3]).toBe('quote"d@example.com');
    expect(row[4]).toBe('Semi;colon "team"');
  });

  it('uses a BOM, semicolons and an attachment disposition', async () => {
    await seedTeam({ members: 1 });
    const response = await adminFetch('/api/admin/export');

    // fetch's text() strips the BOM, so inspect the raw bytes
    const bytes = new Uint8Array(await response.clone().arrayBuffer());
    expect(bytes.slice(0, 3)).toEqual(new Uint8Array([0xEF, 0xBB, 0xBF]));
    expect((await response.text()).split('\n')[0].split(';')).toHaveLength(9);
    expect(response.headers.get('Content-Type')).toContain('text/csv');
    expect(response.headers.get('Content-Disposition')).toContain('attachment');
  });

  it('sanitizes the team name used in the download filename', async () => {
    const team = await seedTeam({ name: 'a"b/../c d;e', members: 1 });
    const response = await adminFetch(`/api/admin/export/${team.id}`);

    const disposition = response.headers.get('Content-Disposition');
    expect(disposition).toBe('attachment; filename="participants_a_b____c_d_e.csv"');
  });

  it('requires authorization for every export route', async () => {
    const team = await seedTeam();
    for (const path of ['/api/admin/export', `/api/admin/export/${team.id}`, '/api/admin/export-official', `/api/admin/export-official/${team.id}`]) {
      expect((await SELF.fetch(`${BASE}${path}`)).status).toBe(401);
      expect((await SELF.fetch(`${BASE}${path}`, { headers: { Authorization: 'Bearer nope' } })).status).toBe(401);
    }
  });

  it('exposes only the expected columns (never the team password hash)', async () => {
    await seedTeam({ members: 1 });
    const text = await (await adminFetch('/api/admin/export')).text();
    expect(text).not.toMatch(/password|[0-9a-f]{32}:[0-9a-f]{64}/i);
  });
});
