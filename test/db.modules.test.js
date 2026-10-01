/**
 * Direct tests of the database modules under src/database
 * (teams, members, settings, payments) against the D1 binding.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import * as teamsDb from '../src/database/db.teams.js';
import * as membersDb from '../src/database/db.members.js';
import * as settingsDb from '../src/database/db.settings.js';
import * as paymentsDb from '../src/database/db.payments.js';
import { setupSchema, clearAllTables, uniq } from './helpers.js';

beforeAll(setupSchema);
beforeEach(clearAllTables);

const person = (overrides = {}) => {
  const id = uniq('p');
  return { firstName: `F${id}`, lastName: `L${id}`, email: `${id}@example.com`, ...overrides };
};

async function newTeam(name = uniq('Team'), description = 'desc', hash = 'salt:hash') {
  return teamsDb.createTeam(env.DB, name, description, hash);
}

const throwingDb = {
  prepare() {
    throw new Error('D1 unavailable');
  }
};

describe('db.teams', () => {
  it('createTeam returns the new id and stores the password hash', async () => {
    const team = await teamsDb.createTeam(env.DB, 'Alpha', 'First', 'salt:abc');
    expect(team).toEqual({ id: expect.any(Number), name: 'Alpha', description: 'First' });

    const row = await teamsDb.getTeamByName(env.DB, 'Alpha');
    expect(row).toMatchObject({ id: team.id, description: 'First', password_hash: 'salt:abc' });
  });

  it('createTeam defaults description and hash to empty strings', async () => {
    const team = await teamsDb.createTeam(env.DB, 'Bare');
    const row = await teamsDb.getTeamById(env.DB, team.id);
    expect(row).toMatchObject({ description: '', password_hash: '' });
  });

  it('createTeam enforces unique team names', async () => {
    await teamsDb.createTeam(env.DB, 'Unique');
    await expect(teamsDb.createTeam(env.DB, 'Unique')).rejects.toThrow(/UNIQUE/i);
  });

  it('getTeamById returns the team with its members, and null for an unknown id', async () => {
    const team = await newTeam();
    const first = await membersDb.addMember(env.DB, team.id, person());
    const second = await membersDb.addMember(env.DB, team.id, person());

    const found = await teamsDb.getTeamById(env.DB, team.id);
    expect(found.name).toBe(team.name);
    expect(found.members.map(m => m.id).sort()).toEqual([first.id, second.id].sort());

    expect(await teamsDb.getTeamById(env.DB, 987_654)).toBeNull();
    expect(await teamsDb.getTeamById(env.DB, 'not-a-number')).toBeNull();
  });

  it('getTeamByName is exact and returns null when missing', async () => {
    await teamsDb.createTeam(env.DB, 'Exact Name');
    expect(await teamsDb.getTeamByName(env.DB, 'Exact Name')).not.toBeNull();
    expect(await teamsDb.getTeamByName(env.DB, 'exact name')).toBeNull();
    expect(await teamsDb.getTeamByName(env.DB, 'Missing')).toBeNull();
  });

  it('getTeams lists every team with its member_count, including empty ones', async () => {
    const empty = await newTeam();
    const busy = await newTeam();
    await membersDb.addMember(env.DB, busy.id, person());
    await membersDb.addMember(env.DB, busy.id, person());

    const teams = await teamsDb.getTeams(env.DB);
    expect(teams.find(t => t.id === empty.id).member_count).toBe(0);
    expect(teams.find(t => t.id === busy.id).member_count).toBe(2);
    expect(teams[0]).not.toHaveProperty('password_hash');
  });

  describe('updateTeam', () => {
    it('updates only the provided fields', async () => {
      const team = await newTeam('Before', 'old description', 'salt:old');

      expect(await teamsDb.updateTeam(env.DB, team.id, { name: 'After' })).toBe(true);
      expect(await teamsDb.getTeamById(env.DB, team.id)).toMatchObject({ name: 'After', description: 'old description', password_hash: 'salt:old' });

      await teamsDb.updateTeam(env.DB, team.id, { description: 'new description' });
      expect(await teamsDb.getTeamById(env.DB, team.id)).toMatchObject({ name: 'After', description: 'new description', password_hash: 'salt:old' });

      await teamsDb.updateTeam(env.DB, team.id, { passwordHash: 'salt:new' });
      expect(await teamsDb.getTeamById(env.DB, team.id)).toMatchObject({ name: 'After', description: 'new description', password_hash: 'salt:new' });
    });

    it('updates several fields at once', async () => {
      const team = await newTeam();
      await teamsDb.updateTeam(env.DB, team.id, { name: 'Both', description: 'changed', passwordHash: 'salt:x' });
      expect(await teamsDb.getTeamById(env.DB, team.id)).toMatchObject({ name: 'Both', description: 'changed', password_hash: 'salt:x' });
    });

    it('returns false and changes nothing when there is nothing to update', async () => {
      const team = await newTeam('Stable', 'same', 'salt:same');

      expect(await teamsDb.updateTeam(env.DB, team.id, {})).toBe(false);
      expect(await teamsDb.updateTeam(env.DB, team.id, { name: undefined, description: undefined })).toBe(false);
      expect(await teamsDb.getTeamById(env.DB, team.id)).toMatchObject({ name: 'Stable', description: 'same', password_hash: 'salt:same' });
    });

    it('can clear the description with an empty string', async () => {
      const team = await newTeam('Clearable', 'to be cleared');
      await teamsDb.updateTeam(env.DB, team.id, { description: '' });
      expect((await teamsDb.getTeamById(env.DB, team.id)).description).toBe('');
    });

    it('does not touch other teams', async () => {
      const [a, b] = [await newTeam('TeamA'), await newTeam('TeamB')];
      await teamsDb.updateTeam(env.DB, a.id, { name: 'Renamed' });
      expect((await teamsDb.getTeamById(env.DB, b.id)).name).toBe('TeamB');
    });

    it('rejects a rename to a name already in use', async () => {
      await newTeam('Taken');
      const other = await newTeam('Free');
      await expect(teamsDb.updateTeam(env.DB, other.id, { name: 'Taken' })).rejects.toThrow(/UNIQUE/i);
    });
  });

  describe('deleteTeam', () => {
    it('removes the team and cascades to its members only', async () => {
      const doomed = await newTeam();
      const safe = await newTeam();
      await membersDb.addMember(env.DB, doomed.id, person());
      await membersDb.addMember(env.DB, doomed.id, person());
      const survivor = await membersDb.addMember(env.DB, safe.id, person());

      expect(await teamsDb.deleteTeam(env.DB, doomed.id)).toBe(true);

      expect(await teamsDb.getTeamById(env.DB, doomed.id)).toBeNull();
      expect(await teamsDb.getTeamMemberCount(env.DB, doomed.id)).toBe(0);
      expect(await membersDb.getTotalParticipants(env.DB)).toBe(1);
      expect(await membersDb.getMemberById(env.DB, survivor.id)).not.toBeNull();
    });

    it('returns false for an unknown team', async () => {
      expect(await teamsDb.deleteTeam(env.DB, 987_654)).toBe(false);
    });
  });

  it('getTeamMemberCount counts members of one team', async () => {
    const [a, b] = [await newTeam(), await newTeam()];
    await membersDb.addMember(env.DB, a.id, person());
    await membersDb.addMember(env.DB, a.id, person());
    await membersDb.addMember(env.DB, b.id, person());

    expect(await teamsDb.getTeamMemberCount(env.DB, a.id)).toBe(2);
    expect(await teamsDb.getTeamMemberCount(env.DB, b.id)).toBe(1);
    expect(await teamsDb.getTeamMemberCount(env.DB, 987_654)).toBe(0);
  });

  it('verifyTeamPassword compares the stored hash exactly', async () => {
    const team = await newTeam('Verify', '', 'salt:exact');
    expect(await teamsDb.verifyTeamPassword(env.DB, team.id, 'salt:exact')).toBe(true);
    expect(await teamsDb.verifyTeamPassword(env.DB, team.id, 'salt:EXACT')).toBe(false);
    expect(await teamsDb.verifyTeamPassword(env.DB, 987_654, 'salt:exact')).toBe(false);
  });
});

describe('db.members', () => {
  let team;
  beforeEach(async () => {
    team = await newTeam();
  });

  it('addMember stores the row with defaults and returns the id', async () => {
    const data = person();
    const member = await membersDb.addMember(env.DB, team.id, data);
    expect(member).toMatchObject({ id: expect.any(Number), ...data });

    expect(await membersDb.getMemberById(env.DB, member.id)).toMatchObject({
      team_id: team.id, first_name: data.firstName, last_name: data.lastName, email: data.email,
      bac_level: 0, is_leader: 0, food_diet: ''
    });
  });

  it('addMember stores the leader flag as 0/1 and the bac level / food choice', async () => {
    const member = await membersDb.addMember(env.DB, team.id, person({ isLeader: true, bacLevel: 3, foodDiet: 'reine' }));
    expect(await membersDb.getMemberById(env.DB, member.id)).toMatchObject({ is_leader: 1, bac_level: 3, food_diet: 'reine' });
  });

  it('addMember and addMemberAdmin reject a duplicate first/last name', async () => {
    const data = person();
    await membersDb.addMember(env.DB, team.id, data);
    await expect(membersDb.addMember(env.DB, team.id, person({ firstName: data.firstName, lastName: data.lastName }))).rejects.toThrow(/UNIQUE/i);
    await expect(membersDb.addMemberAdmin(env.DB, team.id, person({ firstName: data.firstName, lastName: data.lastName }))).rejects.toThrow(/UNIQUE/i);
  });

  it('addMemberAdmin also returns the team id', async () => {
    const member = await membersDb.addMemberAdmin(env.DB, team.id, person());
    expect(member.teamId).toBe(team.id);
  });

  it('memberExists matches on the exact first + last name pair', async () => {
    const data = person();
    await membersDb.addMember(env.DB, team.id, data);

    expect(await membersDb.memberExists(env.DB, data.firstName, data.lastName)).toBe(true);
    expect(await membersDb.memberExists(env.DB, data.firstName, 'Other')).toBe(false);
    expect(await membersDb.memberExists(env.DB, 'Other', data.lastName)).toBe(false);
  });

  it('getMemberById returns null for an unknown id', async () => {
    expect(await membersDb.getMemberById(env.DB, 987_654)).toBeNull();
  });

  describe('updateMember', () => {
    it('updates a single field without touching the others', async () => {
      const member = await membersDb.addMember(env.DB, team.id, person({ bacLevel: 2, foodDiet: 'reine' }));

      expect(await membersDb.updateMember(env.DB, member.id, { bacLevel: 5 })).toBe(true);
      expect(await membersDb.getMemberById(env.DB, member.id)).toMatchObject({
        bac_level: 5, food_diet: 'reine', first_name: member.firstName
      });
    });

    it('maps isLeader to 0/1 in both directions', async () => {
      const member = await membersDb.addMember(env.DB, team.id, person());

      await membersDb.updateMember(env.DB, member.id, { isLeader: true });
      expect((await membersDb.getMemberById(env.DB, member.id)).is_leader).toBe(1);

      await membersDb.updateMember(env.DB, member.id, { isLeader: false });
      expect((await membersDb.getMemberById(env.DB, member.id)).is_leader).toBe(0);
    });

    it('moves a member to another team', async () => {
      const other = await newTeam();
      const member = await membersDb.addMember(env.DB, team.id, person());

      await membersDb.updateMember(env.DB, member.id, { teamId: other.id });
      expect((await membersDb.getMemberById(env.DB, member.id)).team_id).toBe(other.id);
      expect(await teamsDb.getTeamMemberCount(env.DB, team.id)).toBe(0);
      expect(await teamsDb.getTeamMemberCount(env.DB, other.id)).toBe(1);
    });

    it('updates names, email and food choice together', async () => {
      const member = await membersDb.addMember(env.DB, team.id, person());
      const changes = { firstName: uniq('NF'), lastName: uniq('NL'), email: 'new@example.com', foodDiet: 'margherita' };

      await membersDb.updateMember(env.DB, member.id, changes);
      expect(await membersDb.getMemberById(env.DB, member.id)).toMatchObject({
        first_name: changes.firstName, last_name: changes.lastName, email: changes.email, food_diet: 'margherita'
      });
    });

    it('returns false when there is nothing to change', async () => {
      const member = await membersDb.addMember(env.DB, team.id, person());
      expect(await membersDb.updateMember(env.DB, member.id, {})).toBe(false);
      expect(await membersDb.updateMember(env.DB, member.id, { email: undefined })).toBe(false);
    });
  });

  it('deleteMember reports whether a row was removed', async () => {
    const member = await membersDb.addMember(env.DB, team.id, person());
    expect(await membersDb.deleteMember(env.DB, member.id)).toBe(true);
    expect(await membersDb.deleteMember(env.DB, member.id)).toBe(false);
  });

  it('deleteMembers removes the listed ids and reports how many existed', async () => {
    const a = await membersDb.addMember(env.DB, team.id, person());
    const b = await membersDb.addMember(env.DB, team.id, person());
    const keep = await membersDb.addMember(env.DB, team.id, person());

    expect(await membersDb.deleteMembers(env.DB, [])).toBe(0);
    expect(await membersDb.deleteMembers(env.DB, [a.id, b.id, 987_654])).toBe(2);
    expect(await membersDb.getMemberById(env.DB, keep.id)).not.toBeNull();
    expect(await membersDb.getTotalParticipants(env.DB)).toBe(1);
  });

  it('getAllMembers joins the team name and orders by team, then last and first name', async () => {
    const zed = await newTeam('Zed team');
    const abe = await newTeam('Abe team');
    await membersDb.addMember(env.DB, zed.id, { firstName: 'Ann', lastName: 'Zulu', email: 'a@example.com' });
    await membersDb.addMember(env.DB, abe.id, { firstName: 'Bob', lastName: 'Yankee', email: 'b@example.com' });
    await membersDb.addMember(env.DB, abe.id, { firstName: 'Cid', lastName: 'Alpha', email: 'c@example.com' });

    const members = await membersDb.getAllMembers(env.DB);
    expect(members.map(m => `${m.team_name}/${m.last_name}`)).toEqual(['Abe team/Alpha', 'Abe team/Yankee', 'Zed team/Zulu']);
    expect(members[0]).not.toHaveProperty('team_id');
  });

  it('getMembersByTeam only returns that team, ordered by last then first name', async () => {
    const other = await newTeam();
    await membersDb.addMember(env.DB, team.id, { firstName: 'Zoe', lastName: 'Same', email: 'z@example.com' });
    await membersDb.addMember(env.DB, team.id, { firstName: 'Abe', lastName: 'Same', email: 'a@example.com' });
    await membersDb.addMember(env.DB, other.id, person());

    const members = await membersDb.getMembersByTeam(env.DB, team.id);
    expect(members.map(m => m.first_name)).toEqual(['Abe', 'Zoe']);
  });

  it('getTotalParticipants counts every member', async () => {
    expect(await membersDb.getTotalParticipants(env.DB)).toBe(0);
    await membersDb.addMember(env.DB, team.id, person());
    await membersDb.addMember(env.DB, team.id, person());
    expect(await membersDb.getTotalParticipants(env.DB)).toBe(2);
  });

  it('getFoodStats ignores empty choices and sorts by popularity', async () => {
    await membersDb.addMember(env.DB, team.id, person({ foodDiet: 'reine' }));
    await membersDb.addMember(env.DB, team.id, person({ foodDiet: 'margherita' }));
    await membersDb.addMember(env.DB, team.id, person({ foodDiet: 'margherita' }));
    await membersDb.addMember(env.DB, team.id, person({ foodDiet: '' }));

    expect(await membersDb.getFoodStats(env.DB)).toEqual([
      { food_diet: 'margherita', count: 2 },
      { food_diet: 'reine', count: 1 }
    ]);
  });

  it('getBacLevelStats groups by level in ascending order', async () => {
    await membersDb.addMember(env.DB, team.id, person({ bacLevel: 5 }));
    await membersDb.addMember(env.DB, team.id, person({ bacLevel: 1 }));
    await membersDb.addMember(env.DB, team.id, person({ bacLevel: 5 }));

    expect(await membersDb.getBacLevelStats(env.DB)).toEqual([
      { bac_level: 1, count: 1 },
      { bac_level: 5, count: 2 }
    ]);
  });
});

describe('db.settings', () => {
  it('getSetting returns null for a missing key', async () => {
    expect(await settingsDb.getSetting(env.DB, 'missing')).toBeNull();
  });

  it('setSetting inserts then upserts, keeping a single row per key', async () => {
    await settingsDb.setSetting(env.DB, 'k', 'one', 'first description');
    await settingsDb.setSetting(env.DB, 'k', 'two');

    expect(await settingsDb.getSetting(env.DB, 'k')).toBe('two');
    const rows = (await settingsDb.getAllSettings(env.DB)).filter(s => s.key === 'k');
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe('first description');
  });

  it('setSetting replaces the description only when a new one is given', async () => {
    await settingsDb.setSetting(env.DB, 'd', 'v', 'old');
    await settingsDb.setSetting(env.DB, 'd', 'v2', 'new');
    expect((await settingsDb.getAllSettings(env.DB)).find(s => s.key === 'd').description).toBe('new');
  });

  it('treats an empty stored value as "not set"', async () => {
    await settingsDb.setSetting(env.DB, 'empty', '');
    expect(await settingsDb.getSetting(env.DB, 'empty')).toBeNull();
  });

  it('getSettingJson and setSettingJson round-trip structured values', async () => {
    const value = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
    await settingsDb.setSettingJson(env.DB, 'list', value);

    expect(await settingsDb.getSetting(env.DB, 'list')).toBe(JSON.stringify(value));
    expect(await settingsDb.getSettingJson(env.DB, 'list')).toEqual(value);
  });

  it('getSettingJson returns null for missing or invalid JSON', async () => {
    await settingsDb.setSetting(env.DB, 'broken', '{not json');
    expect(await settingsDb.getSettingJson(env.DB, 'broken')).toBeNull();
    expect(await settingsDb.getSettingJson(env.DB, 'absent')).toBeNull();
  });

  it('deleteSetting reports whether a row existed', async () => {
    await settingsDb.setSetting(env.DB, 'gone', 'x');
    expect(await settingsDb.deleteSetting(env.DB, 'gone')).toBe(true);
    expect(await settingsDb.getSetting(env.DB, 'gone')).toBeNull();
    expect(await settingsDb.deleteSetting(env.DB, 'gone')).toBe(false);
  });

  it('getAllSettings orders rows by key', async () => {
    await settingsDb.setSetting(env.DB, 'b-key', '2');
    await settingsDb.setSetting(env.DB, 'a-key', '1');
    await settingsDb.setSetting(env.DB, 'c-key', '3');

    expect((await settingsDb.getAllSettings(env.DB)).map(s => s.key)).toEqual(['a-key', 'b-key', 'c-key']);
  });

  it('keeps a value containing quotes and SQL fragments intact', async () => {
    const value = `'); DROP TABLE settings; -- "quoted"`;
    await settingsDb.setSetting(env.DB, 'evil', value);
    expect(await settingsDb.getSetting(env.DB, 'evil')).toBe(value);
  });

  describe('getCapacitySettings', () => {
    it('uses the environment values when D1 has no override', async () => {
      const capacity = await settingsDb.getCapacitySettings(env.DB, { MAX_TEAM_SIZE: '8', MAX_TOTAL_PARTICIPANTS: '80', MIN_TEAM_SIZE: '2' });
      expect(capacity).toEqual({ maxTeamSize: 8, maxTotalParticipants: 80, minTeamSize: 2 });
    });

    it('falls back to the built-in defaults when the environment is empty or invalid', async () => {
      expect(await settingsDb.getCapacitySettings(env.DB, {})).toEqual({ maxTeamSize: 15, maxTotalParticipants: 200, minTeamSize: 1 });
      expect(await settingsDb.getCapacitySettings(env.DB, { MAX_TEAM_SIZE: 'abc', MIN_TEAM_SIZE: '0' }))
        .toEqual({ maxTeamSize: 15, maxTotalParticipants: 200, minTeamSize: 1 });
    });

    it('lets D1 settings override the environment, key by key', async () => {
      await settingsDb.setSetting(env.DB, 'max_team_size', '4');
      await settingsDb.setSetting(env.DB, 'min_team_size', '3');

      const capacity = await settingsDb.getCapacitySettings(env.DB, { MAX_TEAM_SIZE: '15', MAX_TOTAL_PARTICIPANTS: '90' });
      expect(capacity).toEqual({ maxTeamSize: 4, maxTotalParticipants: 90, minTeamSize: 3 });
    });

    it('falls back to the environment when D1 cannot be read', async () => {
      const capacity = await settingsDb.getCapacitySettings(throwingDb, { MAX_TEAM_SIZE: '9', MAX_TOTAL_PARTICIPANTS: '99' });
      expect(capacity).toEqual({ maxTeamSize: 9, maxTotalParticipants: 99, minTeamSize: 1 });
    });
  });

  it('settingsTableExists is true for the real table and false when D1 errors', async () => {
    expect(await settingsDb.settingsTableExists(env.DB)).toBe(true);
    expect(await settingsDb.settingsTableExists(throwingDb)).toBe(false);
  });
});

describe('db.payments', () => {
  let member;
  beforeEach(async () => {
    const team = await newTeam();
    member = await membersDb.addMember(env.DB, team.id, person());
  });

  const memberRow = (id = member.id) => membersDb.getMemberById(env.DB, id);

  describe('updateMemberPayment', () => {
    it('updates every supported payment column', async () => {
      const confirmedAt = new Date().toISOString();
      expect(await paymentsDb.updateMemberPayment(env.DB, member.id, {
        payment_status: 'paid',
        payment_method: 'online',
        checkout_id: 'co-1',
        transaction_id: 'txn-1',
        registration_tier: 'tier1',
        payment_amount: 500,
        payment_confirmed_at: confirmedAt,
        payment_tier: 'tier1'
      })).toBe(true);

      expect(await memberRow()).toMatchObject({
        payment_status: 'paid', payment_method: 'online', checkout_id: 'co-1', transaction_id: 'txn-1',
        registration_tier: 'tier1', payment_amount: 500, payment_confirmed_at: confirmedAt, payment_tier: 'tier1'
      });
    });

    it('updates only the given columns', async () => {
      await paymentsDb.updateMemberPayment(env.DB, member.id, { payment_status: 'pending', checkout_id: 'co-2' });
      await paymentsDb.updateMemberPayment(env.DB, member.id, { payment_status: 'delayed' });

      expect(await memberRow()).toMatchObject({ payment_status: 'delayed', checkout_id: 'co-2', payment_amount: null });
    });

    it('returns false without touching the row when there is nothing to update', async () => {
      expect(await paymentsDb.updateMemberPayment(env.DB, member.id, {})).toBe(false);
      expect(await paymentsDb.updateMemberPayment(env.DB, member.id, { payment_status: undefined })).toBe(false);
      expect((await memberRow()).payment_status).toBe('unpaid');
    });

    it('stores explicit nulls', async () => {
      await paymentsDb.updateMemberPayment(env.DB, member.id, { checkout_id: 'co-3' });
      await paymentsDb.updateMemberPayment(env.DB, member.id, { checkout_id: null });
      expect((await memberRow()).checkout_id).toBeNull();
    });
  });

  it('getMemberByCheckoutId finds the member or returns null', async () => {
    await paymentsDb.updateMemberPayment(env.DB, member.id, { checkout_id: 'co-find' });
    expect((await paymentsDb.getMemberByCheckoutId(env.DB, 'co-find')).id).toBe(member.id);
    expect(await paymentsDb.getMemberByCheckoutId(env.DB, 'co-missing')).toBeNull();
  });

  it('getPendingPayments only lists pending members, with their team name', async () => {
    const team = await teamsDb.getTeamById(env.DB, (await memberRow()).team_id);
    const pending = await membersDb.addMember(env.DB, team.id, person());
    await paymentsDb.updateMemberPayment(env.DB, pending.id, { payment_status: 'pending' });
    await paymentsDb.updateMemberPayment(env.DB, member.id, { payment_status: 'paid' });

    const rows = await paymentsDb.getPendingPayments(env.DB);
    expect(rows.map(r => r.id)).toEqual([pending.id]);
    expect(rows[0].team_name).toBe(team.name);
  });

  it('getPaymentStats aggregates counts and amounts per status', async () => {
    const team = await teamsDb.getTeamById(env.DB, (await memberRow()).team_id);
    const second = await membersDb.addMember(env.DB, team.id, person());
    const third = await membersDb.addMember(env.DB, team.id, person());
    await paymentsDb.updateMemberPayment(env.DB, member.id, { payment_status: 'paid', payment_amount: 500 });
    await paymentsDb.updateMemberPayment(env.DB, second.id, { payment_status: 'paid', payment_amount: 700 });
    await paymentsDb.updateMemberPayment(env.DB, third.id, { payment_status: 'delayed' });

    const stats = await paymentsDb.getPaymentStats(env.DB);
    expect(stats.paid).toEqual({ count: 2, amount: 1200 });
    expect(stats.delayed).toEqual({ count: 1, amount: 0 });
    expect(stats.unpaid).toEqual({ count: 0, amount: 0 });
    expect(Object.keys(stats).sort()).toEqual(['delayed', 'paid', 'pending', 'refunded', 'unpaid']);
  });

  it('getPaymentStats ignores statuses it does not know', async () => {
    await paymentsDb.updateMemberPayment(env.DB, member.id, { payment_status: 'mystery', payment_amount: 999 });
    const stats = await paymentsDb.getPaymentStats(env.DB);
    expect(stats).not.toHaveProperty('mystery');
    expect(Object.values(stats).reduce((sum, s) => sum + s.amount, 0)).toBe(0);
  });

  describe('payment events', () => {
    it('logPaymentEvent stores the event and returns its id', async () => {
      const id = await paymentsDb.logPaymentEvent(env.DB, {
        member_id: member.id, checkout_id: 'co-ev', event_type: 'checkout_created', amount: 500, tier: 'tier1',
        metadata: { checkout_reference: 'ndi-1' }
      });
      expect(id).toEqual(expect.any(Number));

      const [event] = await paymentsDb.getMemberPaymentEvents(env.DB, member.id);
      expect(event).toMatchObject({ id, member_id: member.id, checkout_id: 'co-ev', event_type: 'checkout_created', amount: 500, tier: 'tier1' });
      expect(JSON.parse(event.metadata)).toEqual({ checkout_reference: 'ndi-1' });
    });

    it('logPaymentEvent stores null for missing checkout id and metadata', async () => {
      await paymentsDb.logPaymentEvent(env.DB, { member_id: member.id, event_type: 'payment_delayed', amount: 0, tier: 'tier2' });

      const [event] = await paymentsDb.getMemberPaymentEvents(env.DB, member.id);
      expect(event.checkout_id).toBeNull();
      expect(event.metadata).toBeNull();
    });

    it('logPaymentEvent rejects events without a type or tier (NOT NULL columns)', async () => {
      await expect(paymentsDb.logPaymentEvent(env.DB, { member_id: member.id, amount: 1, tier: 'tier1' })).rejects.toThrow();
      await expect(paymentsDb.logPaymentEvent(env.DB, { member_id: member.id, event_type: 'x', amount: 1 })).rejects.toThrow();
    });

    it('returns events per member, newest first', async () => {
      const first = await paymentsDb.logPaymentEvent(env.DB, { member_id: member.id, event_type: 'checkout_created', amount: 500, tier: 'tier1' });
      const second = await paymentsDb.logPaymentEvent(env.DB, { member_id: member.id, event_type: 'payment_completed', amount: 500, tier: 'tier1' });
      await env.DB.prepare("UPDATE payment_events SET created_at = '2030-01-01 10:00:00' WHERE id = ?").bind(first).run();
      await env.DB.prepare("UPDATE payment_events SET created_at = '2030-01-01 11:00:00' WHERE id = ?").bind(second).run();

      const events = await paymentsDb.getMemberPaymentEvents(env.DB, member.id);
      expect(events.map(e => e.id)).toEqual([second, first]);
      expect(await paymentsDb.getMemberPaymentEvents(env.DB, 987_654)).toEqual([]);
    });

    it('getPaymentEventsByCheckout filters on the checkout id', async () => {
      await paymentsDb.logPaymentEvent(env.DB, { member_id: member.id, checkout_id: 'co-a', event_type: 'checkout_created', amount: 500, tier: 'tier1' });
      await paymentsDb.logPaymentEvent(env.DB, { member_id: member.id, checkout_id: 'co-b', event_type: 'checkout_created', amount: 500, tier: 'tier1' });

      const events = await paymentsDb.getPaymentEventsByCheckout(env.DB, 'co-a');
      expect(events).toHaveLength(1);
      expect(events[0].checkout_id).toBe('co-a');
    });

    it('getAllPaymentEvents joins the member and honours the limit', async () => {
      for (let i = 0; i < 3; i++) {
        await paymentsDb.logPaymentEvent(env.DB, { member_id: member.id, event_type: 'payment_delayed', amount: 0, tier: 'tier1' });
      }

      const all = await paymentsDb.getAllPaymentEvents(env.DB);
      expect(all).toHaveLength(3);
      expect(all[0]).toMatchObject({ first_name: member.firstName, last_name: member.lastName, email: member.email });
      expect(await paymentsDb.getAllPaymentEvents(env.DB, 2)).toHaveLength(2);
    });

    it('events disappear with their member (ON DELETE CASCADE)', async () => {
      await paymentsDb.logPaymentEvent(env.DB, { member_id: member.id, event_type: 'payment_delayed', amount: 0, tier: 'tier1' });
      await membersDb.deleteMember(env.DB, member.id);
      expect(await paymentsDb.getMemberPaymentEvents(env.DB, member.id)).toEqual([]);
    });
  });

  it('getMembersWithPaymentInfo joins the team name and room against the current schema', async () => {
    const row = await memberRow();
    await env.DB.prepare('UPDATE teams SET room = ? WHERE id = ?').bind('Salle 7', row.team_id).run();

    const members = await paymentsDb.getMembersWithPaymentInfo(env.DB);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ id: member.id, team_room: 'Salle 7', payment_status: 'unpaid' });
    expect(members[0].team_name).toBeTruthy();
  });

  it('paymentEventsTableExists is true for the real table and false when D1 errors', async () => {
    expect(await paymentsDb.paymentEventsTableExists(env.DB)).toBe(true);
    expect(await paymentsDb.paymentEventsTableExists(throwingDb)).toBe(false);
  });
});
