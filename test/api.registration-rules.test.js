/**
 * Registration rules: password hashing and legacy upgrade, capacity limits,
 * duplicates, joining teams, field length caps and hostile text.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { verifyPassword } from '../src/shared/crypto.js';
import {
  setupSchema, clearAllTables, seedTeam, seedManyMembers, register, postJson, adminFetch, memberPayload, countRows, uniq, BASE
} from './helpers.js';

beforeAll(setupSchema);
beforeEach(clearAllTables);

const PBKDF2_FORMAT = /^[0-9a-f]{32}:[0-9a-f]{64}$/;

const newTeamBody = (overrides = {}) => ({
  createNewTeam: true,
  teamName: uniq('Team'),
  teamPassword: 'registration-pw',
  members: [memberPayload({ isLeader: true })],
  ...overrides
});

const storedHash = async (teamId) =>
  (await env.DB.prepare('SELECT password_hash FROM teams WHERE id = ?').bind(teamId).first()).password_hash;

const sha256Hex = async (text) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
};

const viewTeam = (id, password, headers) => postJson(`/api/teams/${id}/view`, { password }, headers);

describe('Team password storage', () => {
  it('stores a salted PBKDF2 hash ("salt:hash"), never the password', async () => {
    const response = await register(newTeamBody({ teamPassword: 'my-secret-password' }));
    const { team } = await response.json();

    const hash = await storedHash(team.id);
    expect(hash).toMatch(PBKDF2_FORMAT);
    expect(hash).not.toContain('my-secret-password');
    expect(hash).not.toContain(await sha256Hex('my-secret-password'));
    expect(await verifyPassword('my-secret-password', hash)).toBe(true);
    expect(await verifyPassword('My-secret-password', hash)).toBe(false);
  });

  it('uses a fresh salt for every team, even with the same password', async () => {
    const first = await (await register(newTeamBody({ teamPassword: 'same-password' }))).json();
    const second = await (await register(newTeamBody({ teamPassword: 'same-password' }))).json();

    const [hashA, hashB] = [await storedHash(first.team.id), await storedHash(second.team.id)];
    expect(hashA.split(':')[0]).not.toBe(hashB.split(':')[0]);
    expect(hashA.split(':')[1]).not.toBe(hashB.split(':')[1]);
  });

  it('trims the password and caps it at 64 characters consistently when joining', async () => {
    const longPassword = 'p'.repeat(100);
    const { team } = await (await register(newTeamBody({ teamPassword: `  ${longPassword}  ` }))).json();

    expect(await verifyPassword('p'.repeat(64), await storedHash(team.id))).toBe(true);

    const join = await register({
      createNewTeam: false, teamId: team.id, teamPassword: longPassword, members: [memberPayload()]
    });
    expect(join.status).toBe(200);
  });

  it('rejects registrations without a usable password', async () => {
    for (const teamPassword of [undefined, '', '   ', 12_345, null, ['a'], { a: 1 }]) {
      const response = await register(newTeamBody({ teamPassword }));
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe('Team password is required');
    }
    expect(await countRows('teams')).toBe(0);
  });
});

describe('Legacy SHA-256 hash upgrade', () => {
  it('keeps a legacy hash on a wrong password and upgrades it after a correct view', async () => {
    const legacy = await sha256Hex('old-password');
    const team = await seedTeam({ passwordHash: legacy, members: 1 });

    expect((await viewTeam(team.id, 'not-it')).status).toBe(403);
    expect(await storedHash(team.id)).toBe(legacy);

    const ok = await viewTeam(team.id, 'old-password');
    expect(ok.status).toBe(200);

    const upgraded = await storedHash(team.id);
    expect(upgraded).toMatch(PBKDF2_FORMAT);
    expect(await verifyPassword('old-password', upgraded)).toBe(true);
    expect(await verifyPassword('not-it', upgraded)).toBe(false);

    // the same password keeps working after the upgrade
    expect((await viewTeam(team.id, 'old-password')).status).toBe(200);
    expect(await storedHash(team.id)).toBe(upgraded);
  });

  it('also upgrades the hash when the legacy password is used to join the team', async () => {
    const team = await seedTeam({ passwordHash: await sha256Hex('join-old'), members: 1 });

    const response = await register({
      createNewTeam: false, teamId: team.id, teamPassword: 'join-old', members: [memberPayload()]
    });
    expect(response.status).toBe(200);
    expect(await storedHash(team.id)).toMatch(PBKDF2_FORMAT);
  });

  it('does not rewrite hashes that are already PBKDF2', async () => {
    const team = await seedTeam({ password: 'modern-pw' });
    const before = await storedHash(team.id);

    expect((await viewTeam(team.id, 'modern-pw')).status).toBe(200);
    expect(await storedHash(team.id)).toBe(before);
  });

  it('never accepts a plain-text value stored in password_hash, nor upgrades it', async () => {
    const team = await seedTeam({ passwordHash: 'plain-text-password' });

    expect((await viewTeam(team.id, 'plain-text-password')).status).toBe(403);
    expect(await storedHash(team.id)).toBe('plain-text-password');
  });

  it('rejects every password for a team without one (Organisation)', async () => {
    const org = await seedTeam({ name: 'Organisation', password: '', members: 0 });

    expect((await viewTeam(org.id, 'anything')).status).toBe(403);
    const join = await register({ createNewTeam: false, teamId: org.id, teamPassword: 'anything', members: [memberPayload()] });
    expect(join.status).toBe(403);
    expect(await countRows('members', 'WHERE team_id = ?', org.id)).toBe(0);
  });
});

describe('Joining an existing team', () => {
  it('adds members with the right password', async () => {
    const team = await seedTeam({ password: 'join-pw', members: 1 });
    const newcomer = memberPayload();

    const response = await register({ createNewTeam: false, teamId: team.id, teamPassword: 'join-pw', members: [newcomer] });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.team).toEqual({ id: team.id, name: team.name, isNew: false });
    expect(data.members).toHaveLength(1);
    expect(await countRows('members', 'WHERE team_id = ?', team.id)).toBe(2);
  });

  it("answers 403 for another team's password and adds nobody", async () => {
    const team = await seedTeam({ password: 'team-a-pw' });
    await seedTeam({ password: 'team-b-pw' });

    const response = await register({ createNewTeam: false, teamId: team.id, teamPassword: 'team-b-pw', members: [memberPayload()] });
    expect(response.status).toBe(403);
    expect(await countRows('members', 'WHERE team_id = ?', team.id)).toBe(1);
  });

  it('answers 404 for an unknown team and 400 when no team is selected', async () => {
    const unknown = await register({ createNewTeam: false, teamId: 987_654, teamPassword: 'pw', members: [memberPayload()] });
    expect(unknown.status).toBe(404);

    const missing = await register({ createNewTeam: false, teamPassword: 'pw', members: [memberPayload()] });
    expect(missing.status).toBe(400);
  });

  it('does not reveal whether a team exists through the error for non-numeric ids', async () => {
    const response = await register({ createNewTeam: false, teamId: 'abc', teamPassword: 'pw', members: [memberPayload()] });
    expect(response.status).toBe(404);
  });

  it('is all-or-nothing: one already registered member rejects the whole batch', async () => {
    const team = await seedTeam({ password: 'join-pw', members: 1 });
    const taken = await env.DB.prepare('SELECT first_name, last_name FROM members WHERE team_id = ?').bind(team.id).first();
    const fresh = memberPayload();

    const response = await register({
      createNewTeam: false,
      teamId: team.id,
      teamPassword: 'join-pw',
      members: [fresh, memberPayload({ firstName: taken.first_name, lastName: taken.last_name })]
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('already registered');
    expect(await countRows('members', 'WHERE first_name = ?', fresh.firstName)).toBe(0);
  });
});

describe('Capacity limits', () => {
  it('accepts a full team of 15 and rejects 16 members in one request', async () => {
    const fifteen = Array.from({ length: 15 }, (_, i) => memberPayload({ isLeader: i === 0 }));
    const accepted = await register(newTeamBody({ members: fifteen }));
    expect(accepted.status).toBe(200);

    const sixteen = Array.from({ length: 16 }, (_, i) => memberPayload({ isLeader: i === 0 }));
    const rejected = await register(newTeamBody({ members: sixteen }));
    expect(rejected.status).toBe(400);
    expect((await rejected.json()).error).toContain('Maximum 15');
  });

  it('refuses to join a full team and says how many spots are left', async () => {
    const team = await seedTeam({ password: 'full-pw', members: 14 });

    const overflow = await register({
      createNewTeam: false, teamId: team.id, teamPassword: 'full-pw', members: [memberPayload(), memberPayload()]
    });
    expect(overflow.status).toBe(400);
    expect((await overflow.json()).error).toContain('Only 1 spots available');

    const fits = await register({ createNewTeam: false, teamId: team.id, teamPassword: 'full-pw', members: [memberPayload()] });
    expect(fits.status).toBe(200);

    const full = await register({ createNewTeam: false, teamId: team.id, teamPassword: 'full-pw', members: [memberPayload()] });
    expect(full.status).toBe(400);
    expect(await countRows('members', 'WHERE team_id = ?', team.id)).toBe(15);
  });

  it('enforces the total participant capacity', async () => {
    const bulk = await seedTeam({ members: 0 });
    await seedManyMembers(bulk.id, 199);

    const overflow = await register(newTeamBody({ members: [memberPayload({ isLeader: true }), memberPayload()] }));
    expect(overflow.status).toBe(400);
    expect((await overflow.json()).error).toContain('Only 1 spots available');
    expect(await countRows('teams')).toBe(1);

    const last = await register(newTeamBody());
    expect(last.status).toBe(200);

    const none = await register(newTeamBody());
    expect(none.status).toBe(400);
  });

  it('honours max_team_size edited by an admin in the settings', async () => {
    expect((await adminFetch('/api/admin/settings', { method: 'PUT', body: { max_team_size: 2 } })).status).toBe(200);

    const three = Array.from({ length: 3 }, (_, i) => memberPayload({ isLeader: i === 0 }));
    const rejected = await register(newTeamBody({ members: three }));
    expect(rejected.status).toBe(400);
    expect((await rejected.json()).error).toContain('Maximum 2');

    const two = await register(newTeamBody({ members: three.slice(0, 2) }));
    expect(two.status).toBe(200);
  });

  it('honours max_total_participants edited by an admin in the settings', async () => {
    const team = await seedTeam({ members: 3 });
    expect(team.memberIds).toHaveLength(3);
    await adminFetch('/api/admin/settings', { method: 'PUT', body: { max_total_participants: 4 } });

    const overflow = await register(newTeamBody({ members: [memberPayload({ isLeader: true }), memberPayload()] }));
    expect(overflow.status).toBe(400);
    expect((await overflow.json()).error).toContain('Only 1 spots available');

    expect((await register(newTeamBody())).status).toBe(200);
  });

  it('lets an admin raise the limit above the environment default', async () => {
    await adminFetch('/api/admin/settings', { method: 'PUT', body: { max_team_size: 20 } });

    const twenty = Array.from({ length: 20 }, (_, i) => memberPayload({ isLeader: i === 0 }));
    expect((await register(newTeamBody({ members: twenty }))).status).toBe(200);
  });
});

describe('Duplicates', () => {
  it('rejects a repeated member inside one request (case-insensitively)', async () => {
    const member = memberPayload({ isLeader: true });
    const response = await register(newTeamBody({
      members: [member, { ...member, email: 'other@example.com', firstName: member.firstName.toUpperCase() }]
    }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('Duplicate member');
  });

  it('rejects a member name that is already registered and leaves no empty team behind', async () => {
    const existing = await seedTeam({ members: 1 });
    const taken = await env.DB.prepare('SELECT first_name, last_name FROM members WHERE team_id = ?').bind(existing.id).first();
    const teamName = uniq('Orphan');

    const response = await register(newTeamBody({
      teamName,
      members: [memberPayload({ firstName: taken.first_name, lastName: taken.last_name, isLeader: true })]
    }));

    expect(response.status).toBe(400);
    expect(await countRows('teams', 'WHERE name = ?', teamName)).toBe(0);

    // the same team name can be used for a corrected retry
    const retry = await register(newTeamBody({ teamName }));
    expect(retry.status).toBe(200);
  });

  it('rejects a team name that already exists', async () => {
    const existing = await seedTeam();
    const response = await register(newTeamBody({ teamName: existing.name }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Team name already exists');
  });
});

describe('Field length caps', () => {
  it('truncates team name (128), description (256) and member names (128)', async () => {
    const response = await register(newTeamBody({
      teamName: 'N'.repeat(300),
      teamDescription: 'D'.repeat(600),
      members: [memberPayload({ isLeader: true, firstName: 'F'.repeat(300), lastName: 'L'.repeat(300) })]
    }));
    expect(response.status).toBe(200);
    const { team } = await response.json();

    const row = await env.DB.prepare('SELECT name, description FROM teams WHERE id = ?').bind(team.id).first();
    expect(row.name).toHaveLength(128);
    expect(row.description).toHaveLength(256);

    const member = await env.DB.prepare('SELECT first_name, last_name FROM members WHERE team_id = ?').bind(team.id).first();
    expect(member.first_name).toHaveLength(128);
    expect(member.last_name).toHaveLength(128);
  });

  it('truncates the food choice to 64 characters', async () => {
    const response = await register(newTeamBody({ members: [memberPayload({ isLeader: true, foodDiet: 'f'.repeat(200) })] }));
    const { team } = await response.json();
    const member = await env.DB.prepare('SELECT food_diet FROM members WHERE team_id = ?').bind(team.id).first();
    expect(member.food_diet).toHaveLength(64);
  });

  it('rejects emails over 254 characters and out-of-range BAC levels', async () => {
    const longEmail = `${'e'.repeat(250)}@example.com`;
    expect((await register(newTeamBody({ members: [memberPayload({ isLeader: true, email: longEmail })] }))).status).toBe(400);
    expect((await register(newTeamBody({ members: [memberPayload({ isLeader: true, bacLevel: 11 })] }))).status).toBe(400);
    expect((await register(newTeamBody({ members: [memberPayload({ isLeader: true, bacLevel: -1 })] }))).status).toBe(400);
    expect(await countRows('teams')).toBe(0);
  });

  it('rejects names that are only whitespace', async () => {
    expect((await register(newTeamBody({ teamName: '   ' }))).status).toBe(400);
    expect((await register(newTeamBody({ members: [memberPayload({ isLeader: true, firstName: '  ' })] }))).status).toBe(400);
  });
});

describe('Hostile text is stored as text and returned as JSON', () => {
  const payloads = [
    '<script>alert(1)</script>',
    '"><img src=x onerror=alert(1)>',
    "'; DROP TABLE members; --",
    '{{7*7}}',
    '</td><td onclick="x()">'
  ];

  it.each(payloads)('round-trips %s unchanged through the API', async (payload) => {
    const member = memberPayload({ isLeader: true, firstName: `A${payload}`.slice(0, 100), lastName: uniq('L') });
    const response = await register(newTeamBody({ teamName: `T${uniq('')}${payload}`.slice(0, 120), teamDescription: payload, members: [member] }));
    expect(response.status).toBe(200);
    const { team } = await response.json();

    const row = await env.DB.prepare('SELECT name, description FROM teams WHERE id = ?').bind(team.id).first();
    expect(row.description).toBe(payload);
    expect(await countRows('members')).toBe(1);

    const view = await viewTeam(team.id, 'registration-pw');
    expect(view.headers.get('Content-Type')).toContain('application/json');
    const body = await view.json();
    expect(body.team.description).toBe(payload);
    expect(body.team.members[0].firstName).toBe(member.firstName);

    const listing = await SELF.fetch(`${BASE}/api/teams`);
    expect(listing.headers.get('Content-Type')).toContain('application/json');
    expect((await listing.json()).teams[0].description).toBe(payload);
  });

  it('does not let a hostile team name break the CSV export row', async () => {
    const payload = '=HYPERLINK("http://evil.example","x")';
    await register(newTeamBody({ teamName: payload }));

    const response = await adminFetch('/api/admin/export');
    expect(response.headers.get('Content-Type')).toContain('text/csv');
    const text = await response.text();
    expect(text).toContain("\"'=HYPERLINK(\"\"http://evil.example\"\",\"\"x\"\")\"");
  });
});

describe('Registration responses', () => {
  it('only reports ids and names, never emails or hashes', async () => {
    const response = await register(newTeamBody());
    const text = await response.text();
    expect(text).not.toMatch(/@example\.com|password|[0-9a-f]{32}:[0-9a-f]{64}/i);

    const body = JSON.parse(text);
    expect(Object.keys(body.members[0]).sort()).toEqual(['firstName', 'id', 'lastName']);
  });

  it('stores emails lower-cased and accepts a numeric-string BAC level', async () => {
    const member = memberPayload({ isLeader: true, email: 'MiXeD.Case@Example.COM', bacLevel: '3' });
    const { team } = await (await register(newTeamBody({ members: [member] }))).json();

    const row = await env.DB.prepare('SELECT email, bac_level, is_leader FROM members WHERE team_id = ?').bind(team.id).first();
    expect(row).toEqual({ email: 'mixed.case@example.com', bac_level: 3, is_leader: 1 });
  });
});
