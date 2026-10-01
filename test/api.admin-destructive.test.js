/**
 * Admin destructive operations: team/member deletion, batch operations and
 * the reset / archive safety flow.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import {
  setupSchema, clearAllTables, seedTeam, seedManyMembers, adminFetch, countRows, uniq, BASE, JSON_HEADERS
} from './helpers.js';

beforeAll(setupSchema);
beforeEach(clearAllTables);

async function memberExists(id) {
  return (await env.DB.prepare('SELECT id FROM members WHERE id = ?').bind(id).first()) !== null;
}

describe('DELETE /api/admin/teams/:id', () => {
  it('requires a valid admin token and deletes nothing without one', async () => {
    const team = await seedTeam({ members: 2 });

    const anonymous = await SELF.fetch(`${BASE}/api/admin/teams/${team.id}`, { method: 'DELETE', headers: JSON_HEADERS });
    expect(anonymous.status).toBe(401);

    const wrong = await SELF.fetch(`${BASE}/api/admin/teams/${team.id}`, {
      method: 'DELETE',
      headers: { ...JSON_HEADERS, Authorization: 'Bearer nope' }
    });
    expect(wrong.status).toBe(401);

    expect(await countRows('teams', 'WHERE id = ?', team.id)).toBe(1);
    expect(await countRows('members', 'WHERE team_id = ?', team.id)).toBe(2);
  });

  it('removes the team and all of its members but leaves other teams alone', async () => {
    const doomed = await seedTeam({ members: 3 });
    const survivor = await seedTeam({ members: 2 });

    const response = await adminFetch(`/api/admin/teams/${doomed.id}`, { method: 'DELETE' });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.message).toContain(doomed.name);
    expect(data.message).toContain('3 member(s)');

    expect(await countRows('teams', 'WHERE id = ?', doomed.id)).toBe(0);
    expect(await countRows('members', 'WHERE team_id = ?', doomed.id)).toBe(0);
    expect(await countRows('teams', 'WHERE id = ?', survivor.id)).toBe(1);
    expect(await countRows('members', 'WHERE team_id = ?', survivor.id)).toBe(2);
  });

  it('deletes a team whose members have payment events', async () => {
    const team = await seedTeam({ members: 1 });
    await env.DB.prepare(
      "INSERT INTO payment_events (member_id, event_type, amount, tier) VALUES (?, 'payment_delayed', 0, 'tier1')"
    ).bind(team.memberIds[0]).run();

    const response = await adminFetch(`/api/admin/teams/${team.id}`, { method: 'DELETE' });
    expect(response.status).toBe(200);
    expect(await countRows('payment_events', 'WHERE member_id = ?', team.memberIds[0])).toBe(0);
  });

  it('refuses to delete the Organisation team and keeps its members', async () => {
    const org = await seedTeam({ name: 'Organisation', password: '', members: 2 });

    const response = await adminFetch(`/api/admin/teams/${org.id}`, { method: 'DELETE' });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toContain('Organisation');

    expect(await countRows('teams', 'WHERE id = ?', org.id)).toBe(1);
    expect(await countRows('members', 'WHERE team_id = ?', org.id)).toBe(2);
  });

  it.each(['987654321', 'abc', '-3'])('answers 404 for the unknown id %s', async (id) => {
    const response = await adminFetch(`/api/admin/teams/${id}`, { method: 'DELETE' });
    expect(response.status).toBe(404);
  });
});

describe('DELETE /api/admin/members/:id', () => {
  it('requires admin authorization', async () => {
    const team = await seedTeam();
    const response = await SELF.fetch(`${BASE}/api/admin/members/${team.memberIds[0]}`, { method: 'DELETE', headers: JSON_HEADERS });
    expect(response.status).toBe(401);
    expect(await memberExists(team.memberIds[0])).toBe(true);
  });

  it('deletes exactly one member', async () => {
    const team = await seedTeam({ members: 2 });
    const [target, other] = team.memberIds;

    const response = await adminFetch(`/api/admin/members/${target}`, { method: 'DELETE' });
    expect(response.status).toBe(200);
    expect(await memberExists(target)).toBe(false);
    expect(await memberExists(other)).toBe(true);
    expect(await countRows('teams', 'WHERE id = ?', team.id)).toBe(1);
  });

  it('answers 404 for an unknown member and 400 for a non-numeric id', async () => {
    expect((await adminFetch('/api/admin/members/987654321', { method: 'DELETE' })).status).toBe(404);
    expect((await adminFetch('/api/admin/members/abc', { method: 'DELETE' })).status).toBe(400);
  });

  it('answers 404 the second time the same member is deleted', async () => {
    const team = await seedTeam();
    expect((await adminFetch(`/api/admin/members/${team.memberIds[0]}`, { method: 'DELETE' })).status).toBe(200);
    expect((await adminFetch(`/api/admin/members/${team.memberIds[0]}`, { method: 'DELETE' })).status).toBe(404);
  });
});

describe('POST /api/admin/members/delete-batch', () => {
  const post = (body) => adminFetch('/api/admin/members/delete-batch', { method: 'POST', body });

  it('requires admin authorization', async () => {
    const team = await seedTeam();
    const response = await SELF.fetch(`${BASE}/api/admin/members/delete-batch`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ memberIds: team.memberIds })
    });
    expect(response.status).toBe(401);
    expect(await memberExists(team.memberIds[0])).toBe(true);
  });

  it('rejects an empty array and non-array values', async () => {
    for (const memberIds of [[], 'abc', 5, null, { 0: 1 }]) {
      const response = await post({ memberIds });
      expect(response.status).toBe(400);
    }
    expect((await post({})).status).toBe(400);
  });

  it('rejects arrays containing non-numeric ids without deleting anything', async () => {
    const team = await seedTeam({ members: 2 });
    const response = await post({ memberIds: [team.memberIds[0], 'abc'] });
    expect(response.status).toBe(400);
    expect(await memberExists(team.memberIds[0])).toBe(true);
  });

  it('deletes the listed members only and reports the count', async () => {
    const team = await seedTeam({ members: 4 });
    const [a, b, keepA, keepB] = team.memberIds;

    const response = await post({ memberIds: [a, String(b)] });
    expect(await response.json()).toEqual({ success: true, deleted: 2 });
    expect(await memberExists(a)).toBe(false);
    expect(await memberExists(b)).toBe(false);
    expect(await memberExists(keepA)).toBe(true);
    expect(await memberExists(keepB)).toBe(true);
  });

  it('reports 0 for nonexistent ids and only counts existing ones in a mixed list', async () => {
    const team = await seedTeam({ members: 1 });

    expect(await (await post({ memberIds: [987_654_321, 987_654_322] })).json()).toEqual({ success: true, deleted: 0 });
    expect(await (await post({ memberIds: [987_654_321, team.memberIds[0], team.memberIds[0]] })).json())
      .toEqual({ success: true, deleted: 1 });
  });

  it('deletes more members than D1 allows bound parameters in one statement', async () => {
    const team = await seedTeam({ members: 0 });
    const ids = await seedManyMembers(team.id, 150);
    const keeper = (await seedTeam({ members: 1 })).memberIds[0];

    const response = await post({ memberIds: ids });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, deleted: 150 });
    expect(await countRows('members', 'WHERE team_id = ?', team.id)).toBe(0);
    expect(await memberExists(keeper)).toBe(true);
  });
});

describe('Batch attendance and pizza operations beyond the D1 parameter limit', () => {
  it.each([
    ['/api/admin/attendance/check-in-batch', 'checked_in', "checked_in = 1"],
    ['/api/admin/pizza/give-batch', 'given', "pizza_received = 1"]
  ])('%s updates 150 members', async (path, key, condition) => {
    const team = await seedTeam({ members: 0 });
    const ids = await seedManyMembers(team.id, 150);

    const response = await adminFetch(path, { method: 'POST', body: { memberIds: ids } });
    expect(response.status).toBe(200);
    expect((await response.json())[key]).toBe(150);
    expect(await countRows('members', `WHERE team_id = ? AND ${condition}`, team.id)).toBe(150);
  });

  it.each([
    ['/api/admin/attendance/check-out-batch', 'checked_out', 'checked_in', 'checked_in = 0'],
    ['/api/admin/pizza/revoke-batch', 'revoked', 'pizza_received', 'pizza_received = 0']
  ])('%s reverts 150 members', async (path, key, column, condition) => {
    const team = await seedTeam({ members: 0 });
    const ids = await seedManyMembers(team.id, 150);
    await env.DB.prepare(`UPDATE members SET ${column} = 1 WHERE team_id = ?`).bind(team.id).run();

    const response = await adminFetch(path, { method: 'POST', body: { memberIds: ids } });
    expect(response.status).toBe(200);
    expect((await response.json())[key]).toBe(150);
    expect(await countRows('members', `WHERE team_id = ? AND ${condition}`, team.id)).toBe(150);
  });
});

describe('Reset flow', () => {
  const YEAR = 2031;

  beforeEach(async () => {
    await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('event_year', ?)").bind(String(YEAR)).run();
  });

  const reset = (body) => adminFetch('/api/admin/reset', { method: 'POST', body });

  async function seedEvent() {
    const team = await seedTeam({ members: 3, name: uniq('Reset') });
    await env.DB.prepare(
      "INSERT INTO payment_events (member_id, event_type, amount, tier) VALUES (?, 'payment_delayed', 0, 'tier1')"
    ).bind(team.memberIds[0]).run();
    return team;
  }

  it('requires admin authorization', async () => {
    await seedEvent();
    const response = await SELF.fetch(`${BASE}/api/admin/reset`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ confirmation: 'SUPPRIMER', force: true })
    });
    expect(response.status).toBe(401);
    expect(await countRows('members')).toBe(3);
  });

  it.each([
    [{}],
    [{ confirmation: 'supprimer', force: true }],
    [{ confirmation: 'SUPPRIMER ', force: true }],
    [{ confirmation: true, force: true }],
    [{ confirmation: null, force: true }]
  ])('refuses %j (confirmation must be exactly "SUPPRIMER") and deletes nothing', async (body) => {
    await seedEvent();
    const response = await reset(body);
    expect(response.status).toBe(400);
    expect(await countRows('members')).toBe(3);
    expect(await countRows('teams')).toBe(1);
  });

  it('treats a malformed body as a missing confirmation', async () => {
    await seedEvent();
    const response = await reset('{not json');
    expect(response.status).toBe(400);
    expect(await countRows('members')).toBe(3);
  });

  it('warns and deletes nothing when no archive exists and force is not set', async () => {
    await seedEvent();

    const response = await reset({ confirmation: 'SUPPRIMER' });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.warning).toBe('no_archive');
    expect(data.year).toBe(YEAR);
    expect(data.counts).toEqual({ teams: 1, members: 3, payments: 1 });
    expect(data.success).toBeUndefined();

    expect(await countRows('members')).toBe(3);
    expect(await countRows('archives')).toBe(0);
  });

  it('createArchiveFirst alone does not bypass the archive-first warning', async () => {
    await seedEvent();

    const data = await (await reset({ confirmation: 'SUPPRIMER', createArchiveFirst: true })).json();
    expect(data.warning).toBe('no_archive');
    expect(await countRows('members')).toBe(3);
    expect(await countRows('archives')).toBe(0);
  });

  it('force deletes everything without creating an archive', async () => {
    await seedEvent();

    const response = await reset({ confirmation: 'SUPPRIMER', force: true });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.deleted).toEqual({ teams: 1, members: 3, payments: 1 });
    expect(data.archiveCreated).toBeFalsy();

    expect(await countRows('members')).toBe(0);
    expect(await countRows('teams')).toBe(0);
    expect(await countRows('payment_events')).toBe(0);
    expect(await countRows('archives')).toBe(0);
  });

  it('createArchiveFirst + force archives the event, then wipes it; the archive survives', async () => {
    const team = await seedEvent();

    const response = await reset({ confirmation: 'SUPPRIMER', force: true, createArchiveFirst: true });
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.archiveCreated).toBe(true);

    expect(await countRows('members')).toBe(0);
    expect(await countRows('teams')).toBe(0);

    const archiveResponse = await adminFetch(`/api/admin/archives/${YEAR}`);
    expect(archiveResponse.status).toBe(200);
    const { archive } = await archiveResponse.json();
    expect(archive.total_participants).toBe(3);
    expect(archive.total_teams).toBe(1);
    expect(archive.teams.map(t => t.name)).toEqual([team.name]);
    expect(archive.members).toHaveLength(3);
    expect(archive.payment_events).toHaveLength(1);
    // never archive the team password hash
    expect(JSON.stringify(archive)).not.toMatch(/password/i);
  });

  it('an existing archive lets the reset proceed without force and survives it', async () => {
    await seedEvent();
    expect((await adminFetch('/api/admin/archives', { method: 'POST', body: { year: YEAR } })).status).toBe(201);

    const response = await reset({ confirmation: 'SUPPRIMER' });
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.archiveCreated).toBeFalsy();
    expect(await countRows('members')).toBe(0);
    expect(await countRows('archives')).toBe(1);

    const list = await (await adminFetch('/api/admin/archives')).json();
    expect(list.archives.map(a => a.event_year)).toEqual([YEAR]);
    expect(list.archives[0].total_participants).toBe(3);
  });

  it('resetting an empty database succeeds with zero counts when forced', async () => {
    const response = await reset({ confirmation: 'SUPPRIMER', force: true });
    expect((await response.json()).deleted).toEqual({ teams: 0, members: 0, payments: 0 });
  });
});

describe('GET /api/admin/reset/check', () => {
  const YEAR = 2032;

  beforeEach(async () => {
    await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('event_year', ?)").bind(String(YEAR)).run();
  });

  it('is safe on an empty database', async () => {
    const data = await (await adminFetch('/api/admin/reset/check')).json();
    expect(data).toMatchObject({ year: YEAR, archiveExists: false, has_data: false, safe: true });
  });

  it('is unsafe when there is unarchived data', async () => {
    await seedTeam({ members: 2 });
    const data = await (await adminFetch('/api/admin/reset/check')).json();
    expect(data).toMatchObject({ archiveExists: false, has_data: true, safe: false });
    expect(data.counts).toMatchObject({ teams: 1, members: 2 });
  });

  it('becomes safe once the year is archived', async () => {
    await seedTeam({ members: 2 });
    await adminFetch('/api/admin/archives', { method: 'POST', body: { year: YEAR } });

    const data = await (await adminFetch('/api/admin/reset/check')).json();
    expect(data).toMatchObject({ archiveExists: true, has_data: true, safe: true });
  });

  it('requires admin authorization', async () => {
    const response = await SELF.fetch(`${BASE}/api/admin/reset/check`);
    expect(response.status).toBe(401);
  });
});

describe('Archive creation', () => {
  it('refuses to archive an empty database', async () => {
    const response = await adminFetch('/api/admin/archives', { method: 'POST', body: { year: 2033 } });
    expect(response.status).toBe(400);
    expect(await countRows('archives')).toBe(0);
  });

  it('answers 409 for a second archive of the same year', async () => {
    await seedTeam({ members: 1 });
    expect((await adminFetch('/api/admin/archives', { method: 'POST', body: { year: 2034 } })).status).toBe(201);
    expect((await adminFetch('/api/admin/archives', { method: 'POST', body: { year: 2034 } })).status).toBe(409);
    expect(await countRows('archives')).toBe(1);
  });

  it.each([1999, 2101, 'abc'])('rejects the year %s', async (year) => {
    await seedTeam({ members: 1 });
    const response = await adminFetch('/api/admin/archives', { method: 'POST', body: { year } });
    expect(response.status).toBe(400);
  });

  it('is not affected by later deletions in the live tables', async () => {
    const team = await seedTeam({ members: 2 });
    await adminFetch('/api/admin/archives', { method: 'POST', body: { year: 2035 } });

    await adminFetch(`/api/admin/teams/${team.id}`, { method: 'DELETE' });

    const { archive } = await (await adminFetch('/api/admin/archives/2035')).json();
    expect(archive.members).toHaveLength(2);
  });
});
