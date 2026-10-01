/**
 * Input validation of the admin and public APIs: check-in payment info, the
 * member / team admin CRUD (email, lengths, duplicates -> 409, unknown team ->
 * 404), the single team-password policy, the configured pizza list, batch
 * endpoints (cap, ids), room assignments and corrupt archive rows.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { verifyPassword } from '../src/shared/crypto.js';
import {
  setupSchema, clearAllTables, seedTeam, adminFetch, postJson, register, memberPayload, countRows, uniq
} from './helpers.js';

beforeAll(setupSchema);
beforeEach(clearAllTables);

const json = async (response) => response.json();
const memberRow = (id) => env.DB.prepare('SELECT * FROM members WHERE id = ?').bind(id).first();
const teamRow = (id) => env.DB.prepare('SELECT * FROM teams WHERE id = ?').bind(id).first();

describe('check-in: payment info', () => {
  let team;
  let memberId;

  beforeEach(async () => {
    team = await seedTeam({ members: 1 });
    memberId = team.memberIds[0];
  });

  const checkIn = (body) => adminFetch(`/api/admin/attendance/check-in/${memberId}`, { method: 'POST', body });

  it.each([
    ['unknown tier', { paymentTier: 'vip', paymentAmount: 500 }, 'invalid_payment_tier'],
    ['tier of the wrong type', { paymentTier: ['late'], paymentAmount: 500 }, 'invalid_payment_tier'],
    ['amount without a tier', { paymentAmount: 500 }, 'invalid_payment_tier'],
    ['tier without an amount', { paymentTier: 'late' }, 'invalid_payment_amount'],
    ['negative amount', { paymentTier: 'late', paymentAmount: -1 }, 'invalid_payment_amount'],
    ['fractional amount', { paymentTier: 'late', paymentAmount: 1.5 }, 'invalid_payment_amount'],
    ['text amount', { paymentTier: 'late', paymentAmount: '12abc' }, 'invalid_payment_amount'],
    ['amount above the cap', { paymentTier: 'late', paymentAmount: 100_001 }, 'invalid_payment_amount'],
    ['astronomic amount', { paymentTier: 'late', paymentAmount: 1e30 }, 'invalid_payment_amount'],
    ['null amount', { paymentTier: 'late', paymentAmount: null }, 'invalid_payment_amount']
  ])('rejects %s and checks nobody in', async (_label, body, code) => {
    const response = await checkIn(body);
    expect(response.status).toBe(400);
    expect((await json(response)).code).toBe(code);
    expect((await memberRow(memberId)).checked_in).toBe(0);
  });

  it.each(['asso_member', 'non_member', 'late', 'organisation', 'online_tier1', 'online_tier2', 'tier1', 'tier2'])(
    'accepts the tier %s with a valid amount',
    async (paymentTier) => {
      const response = await checkIn({ paymentTier, paymentAmount: 0 });
      expect(response.status).toBe(200);
      expect(await memberRow(memberId)).toMatchObject({ checked_in: 1, payment_tier: paymentTier, payment_amount: 0 });
    }
  );

  it('accepts the cap itself and an amount written as digits', async () => {
    expect((await checkIn({ paymentTier: 'late', paymentAmount: 100_000 })).status).toBe(200);
    expect((await checkIn({ paymentTier: 'late', paymentAmount: '700' })).status).toBe(200);
    expect((await memberRow(memberId)).payment_amount).toBe(700);
  });

  it.each(['{not json', 'null', '[]', '"text"', '7', '{"paymentTier":'])(
    'a body that is present but malformed (%s) is a 400, not a silent plain check-in',
    async (body) => {
      const response = await checkIn(body);
      expect(response.status).toBe(400);
      expect((await json(response)).code).toBe('invalid_body');
      expect((await memberRow(memberId)).checked_in).toBe(0);
    }
  );

  it('an absent or empty body is a plain check-in', async () => {
    for (const body of [undefined, '', '  \n']) {
      await adminFetch(`/api/admin/attendance/check-out/${memberId}`, { method: 'POST' });
      const response = await checkIn(body);
      expect(response.status, JSON.stringify(body)).toBe(200);
      expect(await memberRow(memberId)).toMatchObject({ checked_in: 1, payment_tier: null, payment_amount: null });
    }
  });

  it('an unknown member is a 404 and a malformed id a 400', async () => {
    expect((await adminFetch('/api/admin/attendance/check-in/987654', { method: 'POST' })).status).toBe(404);
    const malformed = await adminFetch('/api/admin/attendance/check-in/abc', { method: 'POST' });
    expect(malformed.status).toBe(400);
    expect((await json(malformed)).code).toBe('invalid_id');
  });
});

describe('batch endpoints', () => {
  const ENDPOINTS = [
    '/api/admin/members/delete-batch',
    '/api/admin/attendance/check-in-batch',
    '/api/admin/attendance/check-out-batch',
    '/api/admin/pizza/give-batch',
    '/api/admin/pizza/revoke-batch'
  ];

  it.each(ENDPOINTS)('%s caps the list at 1000 ids and validates every id', async (path) => {
    const tooMany = await adminFetch(path, { method: 'POST', body: { memberIds: Array.from({ length: 1001 }, (_, i) => i + 1) } });
    expect(tooMany.status).toBe(400);
    expect((await json(tooMany)).code).toBe('too_many_ids');

    for (const memberIds of [[1, 'x'], [0], [-1], [1.5], [null], ['1e3'], ['99999999999999999999']]) {
      const response = await adminFetch(path, { method: 'POST', body: { memberIds } });
      expect(response.status, JSON.stringify(memberIds)).toBe(400);
      expect((await json(response)).code).toBe('invalid_id');
    }

    for (const memberIds of [undefined, [], 'abc', 5, {}, null]) {
      const response = await adminFetch(path, { method: 'POST', body: { memberIds } });
      expect(response.status, JSON.stringify(memberIds)).toBe(400);
      expect((await json(response)).code).toBe('invalid_body');
    }
  });

  it('accepts exactly 1000 ids, ids written as digits and duplicates', async () => {
    const team = await seedTeam({ members: 3 });
    const [a, b] = team.memberIds;

    const response = await adminFetch('/api/admin/attendance/check-in-batch', {
      method: 'POST',
      body: { memberIds: [String(a), a, b, ...Array.from({ length: 997 }, (_, i) => 5_000_000 + i)] }
    });
    expect(response.status).toBe(200);
    expect((await json(response)).checked_in).toBe(2);
  });

  it('deletes more members than fit in one D1 statement, atomically', async () => {
    const team = await seedTeam({ members: 0 });
    const ids = [];
    for (let batch = 0; batch < 4; batch++) {
      const statements = Array.from({ length: 50 }, (_, i) => {
        const tag = `${uniq('d')}${batch}${i}`;
        return env.DB.prepare('INSERT INTO members (team_id, first_name, last_name, email) VALUES (?, ?, ?, ?)')
          .bind(team.id, `F${tag}`, `L${tag}`, `${tag}@example.com`);
      });
      for (const result of await env.DB.batch(statements)) ids.push(result.meta.last_row_id);
    }

    const response = await adminFetch('/api/admin/members/delete-batch', { method: 'POST', body: { memberIds: ids } });
    expect((await json(response)).deleted).toBe(200);
    expect(await countRows('members', 'WHERE team_id = ?', team.id)).toBe(0);
  });
});

describe('admin: add and update a member', () => {
  let team;
  beforeEach(async () => {
    team = await seedTeam({ members: 1 });
  });

  const add = (overrides = {}) => adminFetch('/api/admin/members', {
    method: 'POST',
    body: { teamId: team.id, firstName: uniq('A'), lastName: uniq('B'), email: 'ok@example.com', bacLevel: 2, ...overrides }
  });

  it('validates the email format, the lengths and the BAC level like the registration', async () => {
    for (const overrides of [
      { email: 'not-an-email' }, { email: 'a b@c.fr' }, { email: `${'e'.repeat(250)}@example.com` }, { email: 42 },
      { firstName: '   ' }, { lastName: '' }, { bacLevel: 11 }, { bacLevel: -1 }, { bacLevel: 'abc' }, { bacLevel: 1.5 }
    ]) {
      const response = await add(overrides);
      expect(response.status, JSON.stringify(overrides)).toBe(400);
      expect((await json(response)).code).toBe('validation_error');
    }
    expect(await countRows('members', 'WHERE team_id = ?', team.id)).toBe(1);
  });

  it('truncates names to 100 characters and lower-cases the email', async () => {
    const response = await add({ firstName: 'F'.repeat(300), email: 'Mixed.Case@Example.COM' });
    const { member } = await json(response);
    expect(member.firstName).toHaveLength(100);
    expect((await memberRow(member.id)).email).toBe('mixed.case@example.com');
  });

  it('answers 409 for a duplicate name (it used to be a 400)', async () => {
    const existing = await env.DB.prepare('SELECT first_name, last_name FROM members WHERE team_id = ?').bind(team.id).first();
    const response = await add({ firstName: existing.first_name, lastName: existing.last_name });
    expect(response.status).toBe(409);
    expect((await json(response)).code).toBe('conflict');
  });

  it('answers 404 for an unknown team and 400 for a malformed team id', async () => {
    const unknown = await add({ teamId: 987_654 });
    expect(unknown.status).toBe(404);
    expect((await json(unknown)).code).toBe('not_found');

    for (const teamId of [undefined, null, 'abc', 0, -1, 1.5]) {
      const response = await add({ teamId });
      expect(response.status).toBe(400);
      expect((await json(response)).code).toBe('invalid_id');
    }
  });

  it('PUT validates only the fields it receives', async () => {
    const memberId = team.memberIds[0];
    const ok = await adminFetch(`/api/admin/members/${memberId}`, { method: 'PUT', body: { email: 'New@Example.com', isLeader: true } });
    expect(ok.status).toBe(200);
    expect(await memberRow(memberId)).toMatchObject({ email: 'new@example.com', is_leader: 1 });

    for (const body of [{ email: 'nope' }, { firstName: '' }, { bacLevel: 99 }, { foodDiet: 'nope' }, { teamId: 'abc' }]) {
      const response = await adminFetch(`/api/admin/members/${memberId}`, { method: 'PUT', body });
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    expect((await memberRow(memberId)).email).toBe('new@example.com');
  });

  it('PUT with an unknown teamId is a 404 (no foreign-key 500) and leaves the member alone', async () => {
    const memberId = team.memberIds[0];
    const response = await adminFetch(`/api/admin/members/${memberId}`, { method: 'PUT', body: { teamId: 987_654, firstName: 'Moved' } });
    expect(response.status).toBe(404);
    expect((await json(response)).code).toBe('not_found');
    expect(await memberRow(memberId)).toMatchObject({ team_id: team.id });
    expect((await memberRow(memberId)).first_name).not.toBe('Moved');
  });

  it('PUT moves a member to an existing team and answers 409 on a duplicate name', async () => {
    const other = await seedTeam({ members: 1 });
    const memberId = team.memberIds[0];
    expect((await adminFetch(`/api/admin/members/${memberId}`, { method: 'PUT', body: { teamId: other.id } })).status).toBe(200);
    expect((await memberRow(memberId)).team_id).toBe(other.id);

    const taken = await memberRow(other.memberIds[0]);
    const clash = await adminFetch(`/api/admin/members/${memberId}`, {
      method: 'PUT', body: { firstName: taken.first_name, lastName: taken.last_name }
    });
    expect(clash.status).toBe(409);
  });

  it.each(['null', '[]', '"x"', '{not json'])('PUT with the body %s is a 400 invalid_body', async (body) => {
    const response = await adminFetch(`/api/admin/members/${team.memberIds[0]}`, { method: 'PUT', body });
    expect(response.status).toBe(400);
    expect((await json(response)).code).toBe('invalid_body');
  });
});

describe('admin: create and update a team', () => {
  const create = (body) => adminFetch('/api/admin/teams', { method: 'POST', body });

  it('rejects a short or blank name, a non-string description or password', async () => {
    for (const body of [{ name: 'a' }, { name: '   ' }, {}, { name: 5 }, { name: 'okay', description: {} }, { name: 'okay', password: 12_345 }, { name: 'okay', password: '   ' }]) {
      const response = await create(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect((await json(response)).code).toBe('validation_error');
    }
    expect(await countRows('teams')).toBe(0);
  });

  it('answers 409 for a duplicate name, trimmed (it used to be a 400)', async () => {
    const name = uniq('Dup');
    expect((await create({ name })).status).toBe(200);
    const again = await create({ name: `  ${name}  ` });
    expect(again.status).toBe(409);
    expect((await json(again)).code).toBe('conflict');
  });

  it('truncates the name to 128 and the description to 256 characters', async () => {
    const response = await create({ name: 'N'.repeat(300), description: 'D'.repeat(600) });
    const { team } = await json(response);
    const row = await teamRow(team.id);
    expect(row.name).toHaveLength(128);
    expect(row.description).toHaveLength(256);
  });

  it('PUT validates the name, answers 409 on a duplicate and keeps the Organisation team name', async () => {
    const [a, b] = [await seedTeam(), await seedTeam()];
    const org = await seedTeam({ name: 'Organisation', password: '' });

    expect((await adminFetch(`/api/admin/teams/${a.id}`, { method: 'PUT', body: { name: 'x' } })).status).toBe(400);
    const clash = await adminFetch(`/api/admin/teams/${a.id}`, { method: 'PUT', body: { name: b.name } });
    expect(clash.status).toBe(409);
    const rename = await adminFetch(`/api/admin/teams/${org.id}`, { method: 'PUT', body: { name: 'Staff' } });
    expect(rename.status).toBe(403);
    expect((await teamRow(org.id)).name).toBe('Organisation');

    // keeping its own name is fine, a new free name too
    expect((await adminFetch(`/api/admin/teams/${a.id}`, { method: 'PUT', body: { name: a.name, description: 'same name' } })).status).toBe(200);
    expect((await adminFetch(`/api/admin/teams/${a.id}`, { method: 'PUT', body: { name: uniq('Free') } })).status).toBe(200);
  });

  it.each(['null', '[]', '7', '"x"', '{nope'])('PUT with the body %s is a 400 invalid_body', async (body) => {
    const team = await seedTeam();
    const response = await adminFetch(`/api/admin/teams/${team.id}`, { method: 'PUT', body });
    expect(response.status).toBe(400);
    expect((await json(response)).code).toBe('invalid_body');
  });

  it('PUT answers 404 for an unknown team and 400 for a malformed id', async () => {
    expect((await adminFetch('/api/admin/teams/987654', { method: 'PUT', body: {} })).status).toBe(404);
    expect((await adminFetch('/api/admin/teams/abc', { method: 'PUT', body: {} })).status).toBe(400);
  });
});

describe('team password policy: one normalisation everywhere (trim, 64 characters)', () => {
  const longPassword = 'p'.repeat(100);

  it('a password set by the admin works when typed trimmed, padded or in full length', async () => {
    const { team } = await json(await adminFetch('/api/admin/teams', { method: 'POST', body: { name: uniq('Policy'), password: `  ${longPassword}  ` } }));
    expect(await verifyPassword('p'.repeat(64), (await teamRow(team.id)).password_hash)).toBe(true);

    for (const typed of [longPassword, `  ${longPassword}`, 'p'.repeat(64), `${longPassword}   `]) {
      const view = await postJson(`/api/teams/${team.id}/view`, { password: typed });
      expect(view.status, typed.length).toBe(200);
    }
    expect((await postJson(`/api/teams/${team.id}/view`, { password: 'p'.repeat(63) })).status).toBe(403);
  });

  it('team view matches a password registered with surrounding spaces or more than 64 characters', async () => {
    const { team } = await json(await register({
      createNewTeam: true, teamName: uniq('Reg'), teamPassword: `  ${longPassword} `, members: [memberPayload({ isLeader: true })]
    }));

    expect((await postJson(`/api/teams/${team.id}/view`, { password: longPassword })).status).toBe(200);
    expect((await postJson(`/api/teams/${team.id}/view`, { password: ` ${longPassword}` })).status).toBe(200);
    expect((await postJson(`/api/teams/${team.id}/view`, { password: 'wrong' })).status).toBe(403);
  });

  it('an admin password change is normalised too, and a blank one is refused', async () => {
    const team = await seedTeam({ password: 'old-password' });
    const changed = await adminFetch(`/api/admin/teams/${team.id}`, { method: 'PUT', body: { password: `   ${longPassword}` } });
    expect(changed.status).toBe(200);
    expect((await postJson(`/api/teams/${team.id}/view`, { password: longPassword })).status).toBe(200);
    expect((await postJson(`/api/teams/${team.id}/view`, { password: 'old-password' })).status).toBe(403);

    expect((await adminFetch(`/api/admin/teams/${team.id}`, { method: 'PUT', body: { password: '   ' } })).status).toBe(400);
    // an empty password means "unchanged"
    expect((await adminFetch(`/api/admin/teams/${team.id}`, { method: 'PUT', body: { password: '', description: 'x' } })).status).toBe(200);
    expect((await postJson(`/api/teams/${team.id}/view`, { password: longPassword })).status).toBe(200);
  });

  it('the payment endpoints accept the team password in its normalised form', async () => {
    await env.DB.exec(`INSERT OR REPLACE INTO settings (key, value) VALUES ('payment_enabled', 'true')`);
    const { team } = await json(await adminFetch('/api/admin/teams', { method: 'POST', body: { name: uniq('Pay'), password: longPassword } }));
    const { member } = await json(await adminFetch('/api/admin/members', {
      method: 'POST', body: { teamId: team.id, firstName: uniq('P'), lastName: uniq('Q'), email: 'pay@example.com' }
    }));

    const response = await postJson('/api/payment/delayed', { memberId: member.id, teamPassword: `  ${longPassword}  ` });
    expect(response.status).toBe(200);
    expect((await postJson('/api/payment/delayed', { memberId: member.id, teamPassword: 'nope' })).status).toBe(403);
  });
});

describe('food choice: validated against the configured pizzas', () => {
  const addWithFood = (teamId, foodDiet) => adminFetch('/api/admin/members', {
    method: 'POST', body: { teamId, firstName: uniq('F'), lastName: uniq('L'), email: 'f@example.com', foodDiet }
  });

  it('admin add / update accept a configured pizza id and "no pizza" values, nothing else', async () => {
    const team = await seedTeam({ members: 1 });
    const add = (foodDiet) => addWithFood(team.id, foodDiet);

    for (const foodDiet of ['reine', 'none', '0-rien', '', undefined]) {
      expect((await add(foodDiet)).status, String(foodDiet)).toBe(200);
    }
    for (const foodDiet of ['regina', 'x'.repeat(65), 5, ['reine'], {}]) {
      const response = await add(foodDiet);
      expect(response.status, JSON.stringify(foodDiet)).toBe(400);
      expect((await json(response)).error).toContain('Invalid food choice');
    }
  });

  it('follows the pizza list edited in the settings', async () => {
    const team = await seedTeam({ members: 1 });
    expect((await adminFetch('/api/admin/settings', {
      method: 'PUT', body: { pizzas: [{ id: '0-rien', name: 'Aucune' }, { id: 'custom', name: 'Custom' }] }
    })).status).toBe(200);

    const add = (foodDiet) => addWithFood(team.id, foodDiet);
    expect((await add('custom')).status).toBe(200);
    expect((await add('0-rien')).status).toBe(200);
    expect((await add('reine')).status).toBe(400);
  });
});

describe('room assignments', () => {
  const batch = (assignments) => adminFetch('/api/admin/rooms/batch', { method: 'POST', body: { assignments } });

  it('validates each assignment object', async () => {
    const team = await seedTeam();
    for (const assignments of [[null], [5], ['x'], [[]], [{ teamId: team.id, room: 5 }], [{ teamId: team.id, room: 'x'.repeat(51) }], [{ teamId: team.id, room: {} }]]) {
      const response = await batch(assignments);
      expect(response.status, JSON.stringify(assignments)).toBe(400);
    }
    for (const assignments of [[{ room: 'A' }], [{ teamId: 'abc' }], [{ teamId: 0 }], [{ teamId: 1.5 }], [{ teamId: '1e3' }]]) {
      const response = await batch(assignments);
      expect(response.status, JSON.stringify(assignments)).toBe(400);
      expect((await json(response)).code).toBe('invalid_id');
    }
  });

  it('caps the list at 1000 assignments', async () => {
    const response = await batch(Array.from({ length: 1001 }, (_, i) => ({ teamId: i + 1, room: 'A' })));
    expect(response.status).toBe(400);
    expect((await json(response)).code).toBe('too_many_assignments');
  });

  it('reports the teams that do not exist, applies the others and lets the last entry of a team win', async () => {
    const [a, b] = [await seedTeam(), await seedTeam()];

    const response = await batch([
      { teamId: a.id, room: 'Salle 1' }, { teamId: 987_654, room: 'Salle 2' }, { teamId: b.id, room: 'Salle 3' }, { teamId: a.id, room: 'Salle 4' }
    ]);
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ success: true, updated: 2, skipped: [987_654] });
    expect((await teamRow(a.id)).room).toBe('Salle 4');
    expect((await teamRow(b.id)).room).toBe('Salle 3');
  });

  it('trims the room name and a blank one clears the room', async () => {
    const team = await seedTeam();
    await batch([{ teamId: team.id, room: '  Salle 9  ' }]);
    expect((await teamRow(team.id)).room).toBe('Salle 9');
    await batch([{ teamId: String(team.id), room: '   ' }]);
    expect((await teamRow(team.id)).room).toBeNull();
  });

  it('PUT requires a room key and answers 404 / 400 for the team id', async () => {
    const team = await seedTeam();
    expect((await adminFetch(`/api/admin/rooms/${team.id}`, { method: 'PUT', body: {} })).status).toBe(400);
    expect((await adminFetch(`/api/admin/rooms/${team.id}`, { method: 'PUT', body: { room: null } })).status).toBe(200);
    expect((await adminFetch('/api/admin/rooms/987654', { method: 'PUT', body: { room: 'A' } })).status).toBe(404);
    expect((await adminFetch('/api/admin/rooms/abc', { method: 'PUT', body: { room: 'A' } })).status).toBe(400);
  });
});

describe('archives: corrupt rows do not take the endpoints down', () => {
  async function insertArchive(year, overrides = {}) {
    const row = {
      event_year: year, expiration_date: new Date(Date.now() + 86_400_000).toISOString(), teams_json: '[]',
      members_json: '[]', payment_events_json: '[]', stats_json: '{"total_teams":0}', total_teams: 0,
      total_participants: 0, total_revenue: 0, data_hash: 'abc', ...overrides
    };
    const names = Object.keys(row);
    await env.DB.prepare(`INSERT INTO archives (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`).bind(...Object.values(row)).run();
  }

  it('GET /archives lists a row whose stats_json is not JSON, with stats null', async () => {
    await insertArchive(2023, { stats_json: '{corrupt' });
    await insertArchive(2024);

    const response = await adminFetch('/api/admin/archives');
    expect(response.status).toBe(200);
    const { archives } = await json(response);
    expect(archives.map(a => [a.event_year, a.stats])).toEqual([[2024, { total_teams: 0 }], [2023, null]]);
  });

  it('GET and export of an archive with corrupt JSON columns answer 200 with empty values', async () => {
    await insertArchive(2022, { teams_json: 'nope', members_json: '{', payment_events_json: '[', stats_json: '' });

    for (const path of ['/api/admin/archives/2022', '/api/admin/archives/2022/export']) {
      const response = await adminFetch(path);
      expect(response.status, path).toBe(200);
    }
    const { archive } = await json(await adminFetch('/api/admin/archives/2022'));
    expect(archive).toMatchObject({ teams: [], members: [], payment_events: [], stats: null });
  });

  it('an expired archive with a corrupt members column is emptied, not kept with personal data', async () => {
    await insertArchive(2021, { expiration_date: new Date(Date.now() - 86_400_000).toISOString(), members_json: '{corrupt' });

    const response = await adminFetch('/api/admin/archives/2021');
    expect(response.status).toBe(200);
    expect((await json(response)).archive).toMatchObject({ is_expired: 1, members: [] });
  });
});
