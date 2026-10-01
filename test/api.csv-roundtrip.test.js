/**
 * CSV export -> import: an ndi export can be re-imported (French headers, ';'
 * delimiter, BOM, BAC+N, Oui/Non), the official export too, and the English
 * import format keeps working.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { createRouter } from '../src/routes.js';
import { verifyPassword } from '../src/shared/crypto.js';
import { setupSchema, clearAllTables, seedTeam, adminFetch, countRows, uniq, BASE } from './helpers.js';

beforeAll(setupSchema);
beforeEach(clearAllTables);

const json = (response) => response.json();
const importCsv = (csv) => adminFetch('/api/admin/import', { method: 'POST', body: { csv } });

async function addMember(teamId, columns) {
  const tag = uniq('r');
  const row = { first_name: `First${tag}`, last_name: `Last${tag}`, email: `${tag}@example.com`, ...columns };
  const names = Object.keys(row);
  await env.DB.prepare(`INSERT INTO members (team_id, ${names.join(', ')}) VALUES (?, ${names.map(() => '?').join(', ')})`)
    .bind(teamId, ...Object.values(row)).run();
}

/** Every member with its team name, in a stable order, without ids and dates. */
async function snapshot() {
  const { results } = await env.DB.prepare(`
    SELECT t.name AS team, m.first_name, m.last_name, m.email, m.bac_level, m.is_leader, m.food_diet
    FROM members m JOIN teams t ON t.id = m.team_id
    ORDER BY t.name, m.first_name, m.last_name
  `).all();
  return results;
}

async function wipe() {
  await env.DB.exec('DELETE FROM members');
  await env.DB.exec('DELETE FROM teams');
}

async function seedHostileMembers() {
  const alpha = await seedTeam({ name: 'Alpha', members: 0 });
  const odd = await seedTeam({ name: 'Semi;colon, "quoted" team', members: 0 });
  const organisation = await seedTeam({ name: 'Organisation', password: '', members: 0 });

  await addMember(alpha.id, { first_name: 'Zoë', last_name: "O'Brien", email: 'zoe@example.com', bac_level: 3, is_leader: 1, food_diet: 'reine' });
  await addMember(alpha.id, { first_name: 'Ann', last_name: 'Plain', email: 'ann@example.com', bac_level: 0, is_leader: 0, food_diet: '' });
  await addMember(alpha.id, { first_name: 'Bob', last_name: 'None', email: 'bob@example.com', bac_level: 5, is_leader: 0, food_diet: 'none' });
  await addMember(alpha.id, { first_name: '=SUM(1+1)', last_name: '+49 123', email: 'inject@example.com', bac_level: 2, food_diet: 'margherita' });
  await addMember(alpha.id, { first_name: '@cmd', last_name: '-Cmd|x', email: 'inject2@example.com', bac_level: 1 });
  await addMember(odd.id, { first_name: 'Semi;Colon', last_name: 'Dou"ble', email: 'semi@example.com', bac_level: 4, is_leader: 1 });
  await addMember(odd.id, { first_name: 'Line\nBreak', last_name: 'Multi', email: 'line@example.com' });
  await addMember(organisation.id, { first_name: 'Org', last_name: 'Anizer', email: 'org@example.com', bac_level: 8, is_leader: 1, food_diet: '0-rien' });
}

describe('export -> import round trip', () => {
  it('re-imports an export into an empty database and gets the same members back', async () => {
    await seedHostileMembers();
    const before = await snapshot();
    expect(before).toHaveLength(8);

    const exported = await adminFetch('/api/admin/export');
    expect(exported.status).toBe(200);
    const csv = await exported.text();
    await wipe();

    const response = await importCsv(csv);
    expect(response.status).toBe(200);
    const { stats, passwords } = await json(response);
    expect(stats).toMatchObject({ membersImported: 8, membersSkipped: 0, teamsCreated: 3, errorCount: 0 });
    expect(passwords).toHaveLength(3);

    expect(await snapshot()).toEqual(before);
  });

  it('also works when the file still carries its UTF-8 BOM (what a browser sends)', async () => {
    await seedHostileMembers();
    const before = await snapshot();
    const raw = new Uint8Array(await (await adminFetch('/api/admin/export')).arrayBuffer());
    expect(raw.slice(0, 3)).toEqual(new Uint8Array([0xEF, 0xBB, 0xBF]));
    const csvWithBom = new TextDecoder('utf-8', { ignoreBOM: true }).decode(raw);
    expect(csvWithBom.startsWith('﻿')).toBe(true);
    await wipe();

    expect((await importCsv(csvWithBom)).status).toBe(200);
    expect(await snapshot()).toEqual(before);
  });

  it('a team export round-trips as well and the generated team passwords verify', async () => {
    const team = await seedTeam({ name: 'Solo', members: 0 });
    await addMember(team.id, { first_name: 'Solo', last_name: 'Player', email: 'solo@example.com', bac_level: 2, is_leader: 1, food_diet: 'reine' });
    const before = await snapshot();
    const csv = await (await adminFetch(`/api/admin/export/${team.id}`)).text();
    await wipe();

    const { passwords } = await json(await importCsv(csv));
    expect(await snapshot()).toEqual(before);
    const stored = await env.DB.prepare('SELECT password_hash FROM teams WHERE name = ?').bind('Solo').first();
    expect(await verifyPassword(passwords[0].password, stored.password_hash)).toBe(true);
  });

  it('importing the same export again changes nothing (every member is skipped, not an error)', async () => {
    await seedHostileMembers();
    const csv = await (await adminFetch('/api/admin/export')).text();

    const { stats } = await json(await importCsv(csv));
    expect(stats).toMatchObject({ membersImported: 0, membersSkipped: 8, teamsCreated: 0, errorCount: 0 });
    expect(await countRows('members')).toBe(8);
  });

  it(String.raw`re-imports the official export (prenom;nom;mail;niveauBac;equipe;estLeader (0\1);ecole)`, async () => {
    const team = await seedTeam({ name: 'Official', members: 0 });
    await addMember(team.id, { first_name: 'Off', last_name: 'Icial', email: 'off@example.com', bac_level: 3, is_leader: 1, food_diet: 'reine' });
    const csv = await (await adminFetch('/api/admin/export-official')).text();
    expect(csv.split('\n')[1]).toContain('ICIAL');
    await wipe();

    const response = await importCsv(csv);
    expect((await json(response)).stats.membersImported).toBe(1);
    expect(await snapshot()).toEqual([
      { team: 'Official', first_name: 'Off', last_name: 'ICIAL', email: 'off@example.com', bac_level: 3, is_leader: 1, food_diet: 'none' }
    ]);
  });
});

describe('import: accepted spellings', () => {
  const team = () => uniq('Fmt');

  it('accepts the English headers with "," and the French headers with ";" or ","', async () => {
    const [a, b, c] = [team(), team(), team()];
    const english = `firstname,lastname,email,teamname,baclevel,fooddiet,ismanager\nEn,${uniq('L')},en@example.com,${a},2,reine,yes`;
    const frenchSemi = `Prénom;Nom;Email;Équipe;Niveau BAC;Chef d'équipe;Pizza\nFr;${uniq('L')};fr@example.com;${b};BAC+4;Oui;margherita`;
    const frenchComma = `Prénom,Nom,Email,Équipe,Niveau BAC,Chef d'équipe,Pizza\nVirgule,${uniq('L')},virgule@example.com,${c},BAC+1,Non,Aucune`;

    for (const csv of [english, frenchSemi, frenchComma]) {
      expect((await importCsv(csv)).status).toBe(200);
    }
    const rows = await snapshot();
    expect(rows.find(r => r.first_name === 'En')).toMatchObject({ bac_level: 2, is_leader: 1, food_diet: 'reine' });
    expect(rows.find(r => r.first_name === 'Fr')).toMatchObject({ bac_level: 4, is_leader: 1, food_diet: 'margherita' });
    expect(rows.find(r => r.first_name === 'Virgule')).toMatchObject({ bac_level: 1, is_leader: 0, food_diet: '' });
  });

  it.each([['Oui', 1], ['oui', 1], ['Yes', 1], ['1', 1], ['true', 1], ['TRUE', 1], ['Non', 0], ['No', 0], ['0', 0], ['', 0], ['peut-être', 0]])(
    'reads the leader cell %j as %i', async (cell, expected) => {
      const last = uniq('L');
      await importCsv(`firstName,lastName,email,teamName,isManager\nLead,${last},lead@example.com,${team()},${cell}`);
      expect((await env.DB.prepare('SELECT is_leader FROM members WHERE last_name = ?').bind(last).first()).is_leader).toBe(expected);
    }
  );

  it.each([['3', 3], ['BAC+3', 3], ['bac+5', 5], ['BAC +2', 2], ['bac 4', 4], ['', 0]])('reads the BAC level cell %j as %i', async (cell, expected) => {
    const last = uniq('L');
    await importCsv(`firstName,lastName,email,teamName,bacLevel\nBac,${last},bac@example.com,${team()},${cell}`);
    expect((await env.DB.prepare('SELECT bac_level FROM members WHERE last_name = ?').bind(last).first()).bac_level).toBe(expected);
  });

  it('strips the injection guard of an exported cell and lower-cases the email', async () => {
    const last = uniq('L');
    await importCsv(`firstName,lastName,email,teamName\n'=cmd,${last},CMD@Example.com,${team()}`);
    expect(await env.DB.prepare('SELECT first_name, email FROM members WHERE last_name = ?').bind(last).first())
      .toEqual({ first_name: '=cmd', email: 'cmd@example.com' });
  });
});

describe('import: row errors and limits', () => {
  const header = 'firstName,lastName,email,teamName,bacLevel,foodDiet';

  it('reports invalid rows one by one, imports the valid ones and counts every error', async () => {
    const t = uniq('Err');
    const lines = [
      header,
      `Good,${uniq('L')},good@example.com,${t},2,reine`,
      `BadMail,${uniq('L')},not-an-email,${t},2,reine`,
      `BadBac,${uniq('L')},bac@example.com,${t},BAC+abc,reine`,
      `BadPizza,${uniq('L')},pizza@example.com,${t},2,not-a-pizza`,
      `,NoFirst,nofirst@example.com,${t},2,reine`,
      `ShortTeam,${uniq('L')},short@example.com,x,2,reine`
    ];

    const { stats } = await json(await importCsv(lines.join('\n')));
    expect(stats).toMatchObject({ membersImported: 1, membersSkipped: 5, errorCount: 5, totalRows: 6 });
    expect(stats.errors).toHaveLength(5);
    expect(stats.errors[0]).toMatch(/^Ligne 3 : L'adresse e-mail est invalide/);
    expect(stats.errors[1]).toMatch(/^Ligne 4 : Le niveau d'études est invalide/);
    expect(stats.errors[2]).toMatch(/^Ligne 5 : Le choix de pizza est invalide/);
    expect(stats.errors[3]).toMatch(/^Ligne 6 : Le prénom est requis/);
    expect(stats.errors[4]).toMatch(/^Ligne 7 : Le nom d'équipe doit contenir entre 2 et 128 caractères/);
    // the team of the rejected rows is not created for nothing
    expect(await countRows('teams')).toBe(1);
  });

  it('shows at most 10 errors but counts them all', async () => {
    const lines = [header, ...Array.from({ length: 25 }, () => `Bad,${uniq('L')},nope,${uniq('Cap')},0,`)];
    const { stats } = await json(await importCsv(lines.join('\n')));
    expect(stats.errors).toHaveLength(10);
    expect(stats.errorCount).toBe(25);
    expect(stats.membersSkipped).toBe(25);
  });

  it('answers 400 too_many_rows above 2000 data rows, importing nothing', async () => {
    const lines = [header, ...Array.from({ length: 2001 }, (_, i) => `A${i},B,a${i}@e.fr,T,0,`)];
    const response = await importCsv(lines.join('\n'));
    expect(response.status).toBe(400);
    expect((await json(response)).code).toBe('too_many_rows');
    expect(await countRows('members')).toBe(0);
  });

  it('inserts a large file in several batches', async () => {
    const t = uniq('Big');
    const lines = [header, ...Array.from({ length: 120 }, (_, i) => `Big${i},${uniq('L')},big${i}@example.com,${t},1,`)];
    const { stats } = await json(await importCsv(lines.join('\n')));
    expect(stats).toMatchObject({ membersImported: 120, teamsCreated: 1 });
    expect(await countRows('members')).toBe(120);
  });

  it('answers 400 with a code for every structural problem', async () => {
    const cases = [
      [{}, 'csv_required'], [{ csv: 12 }, 'csv_required'], [{ csv: '   ' }, 'csv_required'],
      [{ csv: header }, 'empty_csv'], [{ csv: 'only;a;header\n' }, 'empty_csv'],
      [{ csv: 'a,b\n1,2' }, 'missing_columns'], [{ csv: `${header}\nonly,two` }, 'no_valid_rows']
    ];
    for (const [body, code] of cases) {
      const response = await adminFetch('/api/admin/import', { method: 'POST', body });
      expect(response.status, code).toBe(400);
      expect((await json(response)).code).toBe(code);
    }
  });

  it('never leaks the cause of a database failure (500 uses the generic body)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const brokenEnv = {
      ADMIN_TOKEN: 'import-token',
      DB: { prepare() { throw new Error('SECRET: no such table members'); }, batch() { throw new Error('SECRET'); } }
    };
    const request = new Request(`${BASE}/nuit-de-linfo/api/admin/import`, {
      method: 'POST',
      headers: { Authorization: 'Bearer import-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: `${header}\nA,B,a@b.fr,T,0,` })
    });

    const response = await createRouter().handle(request, brokenEnv);
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(JSON.parse(text).code).toBe('internal_error');
    expect(text).not.toContain('SECRET');
  });
});
