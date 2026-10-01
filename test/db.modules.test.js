/**
 * Direct tests of the database layer (src/lib/db.js for teams and members,
 * src/database for settings and payments) against the D1 binding.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import * as db from '../src/lib/db.js';
import * as settingsDb from '../src/database/db.settings.js';
import { setupSchema, clearAllTables, uniq } from './helpers.js';

beforeAll(setupSchema);
beforeEach(clearAllTables);

const person = (overrides = {}) => {
  const id = uniq('p');
  return { firstName: `F${id}`, lastName: `L${id}`, email: `${id}@example.com`, ...overrides };
};

async function newTeam(name = uniq('Team'), description = 'desc', hash = 'salt:hash') {
  return db.createTeam(env.DB, name, description, hash);
}

const throwingDb = {
  prepare() {
    throw new Error('D1 unavailable');
  }
};

describe('db (teams)', () => {
  it('createTeam returns the new id and stores the password hash', async () => {
    const team = await db.createTeam(env.DB, 'Alpha', 'First', 'salt:abc');
    expect(team).toEqual({ id: expect.any(Number), name: 'Alpha', description: 'First' });

    const row = await db.getTeamByName(env.DB, 'Alpha');
    expect(row).toMatchObject({ id: team.id, description: 'First', password_hash: 'salt:abc' });
  });

  it('createTeam defaults description and hash to empty strings', async () => {
    const team = await db.createTeam(env.DB, 'Bare');
    const row = await db.getTeamById(env.DB, team.id);
    expect(row).toMatchObject({ description: '', password_hash: '' });
  });

  it('createTeam enforces unique team names', async () => {
    await db.createTeam(env.DB, 'Unique');
    await expect(db.createTeam(env.DB, 'Unique')).rejects.toThrow(/UNIQUE/i);
  });

  it('getTeamById returns the team with its members, and null for an unknown id', async () => {
    const team = await newTeam();
    const first = await db.addMemberAdmin(env.DB, team.id, person());
    const second = await db.addMemberAdmin(env.DB, team.id, person());

    const found = await db.getTeamById(env.DB, team.id);
    expect(found.name).toBe(team.name);
    expect(found.members.map(m => m.id).sort()).toEqual([first.id, second.id].sort());

    expect(await db.getTeamById(env.DB, 987_654)).toBeNull();
    expect(await db.getTeamById(env.DB, 'not-a-number')).toBeNull();
  });

  it('getTeamByName is exact and returns null when missing', async () => {
    await db.createTeam(env.DB, 'Exact Name');
    expect(await db.getTeamByName(env.DB, 'Exact Name')).not.toBeNull();
    expect(await db.getTeamByName(env.DB, 'exact name')).toBeNull();
    expect(await db.getTeamByName(env.DB, 'Missing')).toBeNull();
  });

  it('getTeams lists every team with its member_count, including empty ones', async () => {
    const empty = await newTeam();
    const busy = await newTeam();
    await db.addMemberAdmin(env.DB, busy.id, person());
    await db.addMemberAdmin(env.DB, busy.id, person());

    const teams = await db.getTeams(env.DB);
    expect(teams.find(t => t.id === empty.id).member_count).toBe(0);
    expect(teams.find(t => t.id === busy.id).member_count).toBe(2);
    expect(teams[0]).not.toHaveProperty('password_hash');
  });

  describe('updateTeam', () => {
    it('updates only the provided fields', async () => {
      const team = await newTeam('Before', 'old description', 'salt:old');

      expect(await db.updateTeam(env.DB, team.id, { name: 'After' })).toBe(true);
      expect(await db.getTeamById(env.DB, team.id)).toMatchObject({ name: 'After', description: 'old description', password_hash: 'salt:old' });

      await db.updateTeam(env.DB, team.id, { description: 'new description' });
      expect(await db.getTeamById(env.DB, team.id)).toMatchObject({ name: 'After', description: 'new description', password_hash: 'salt:old' });

      await db.updateTeam(env.DB, team.id, { passwordHash: 'salt:new' });
      expect(await db.getTeamById(env.DB, team.id)).toMatchObject({ name: 'After', description: 'new description', password_hash: 'salt:new' });
    });

    it('updates several fields at once', async () => {
      const team = await newTeam();
      await db.updateTeam(env.DB, team.id, { name: 'Both', description: 'changed', passwordHash: 'salt:x' });
      expect(await db.getTeamById(env.DB, team.id)).toMatchObject({ name: 'Both', description: 'changed', password_hash: 'salt:x' });
    });

    it('returns false and changes nothing when there is nothing to update', async () => {
      const team = await newTeam('Stable', 'same', 'salt:same');

      expect(await db.updateTeam(env.DB, team.id, {})).toBe(false);
      expect(await db.updateTeam(env.DB, team.id, { name: undefined, description: undefined })).toBe(false);
      expect(await db.getTeamById(env.DB, team.id)).toMatchObject({ name: 'Stable', description: 'same', password_hash: 'salt:same' });
    });

    it('can clear the description with an empty string', async () => {
      const team = await newTeam('Clearable', 'to be cleared');
      await db.updateTeam(env.DB, team.id, { description: '' });
      expect((await db.getTeamById(env.DB, team.id)).description).toBe('');
    });

    it('does not touch other teams', async () => {
      const [a, b] = [await newTeam('TeamA'), await newTeam('TeamB')];
      await db.updateTeam(env.DB, a.id, { name: 'Renamed' });
      expect((await db.getTeamById(env.DB, b.id)).name).toBe('TeamB');
    });

    it('rejects a rename to a name already in use', async () => {
      await newTeam('Taken');
      const other = await newTeam('Free');
      await expect(db.updateTeam(env.DB, other.id, { name: 'Taken' })).rejects.toThrow(/UNIQUE/i);
    });
  });

  describe('deleteTeam', () => {
    it('removes the team and cascades to its members only', async () => {
      const doomed = await newTeam();
      const safe = await newTeam();
      await db.addMemberAdmin(env.DB, doomed.id, person());
      await db.addMemberAdmin(env.DB, doomed.id, person());
      const survivor = await db.addMemberAdmin(env.DB, safe.id, person());

      expect(await db.deleteTeam(env.DB, doomed.id)).toBe(true);

      expect(await db.getTeamById(env.DB, doomed.id)).toBeNull();
      expect(await db.getTeamMemberCount(env.DB, doomed.id)).toBe(0);
      expect(await db.getParticipantsExcludingOrg(env.DB)).toBe(1);
      expect(await db.getMemberById(env.DB, survivor.id)).not.toBeNull();
    });

    it('returns false for an unknown team', async () => {
      expect(await db.deleteTeam(env.DB, 987_654)).toBe(false);
    });
  });

  it('getTeamMemberCount counts members of one team', async () => {
    const [a, b] = [await newTeam(), await newTeam()];
    await db.addMemberAdmin(env.DB, a.id, person());
    await db.addMemberAdmin(env.DB, a.id, person());
    await db.addMemberAdmin(env.DB, b.id, person());

    expect(await db.getTeamMemberCount(env.DB, a.id)).toBe(2);
    expect(await db.getTeamMemberCount(env.DB, b.id)).toBe(1);
    expect(await db.getTeamMemberCount(env.DB, 987_654)).toBe(0);
  });

});

describe('db (members)', () => {
  let team;
  beforeEach(async () => {
    team = await newTeam();
  });

  it('addMemberAdmin stores the row with defaults and returns the id', async () => {
    const data = person();
    const member = await db.addMemberAdmin(env.DB, team.id, data);
    expect(member).toMatchObject({ id: expect.any(Number), ...data });

    expect(await db.getMemberById(env.DB, member.id)).toMatchObject({
      team_id: team.id, first_name: data.firstName, last_name: data.lastName, email: data.email,
      bac_level: 0, is_leader: 0, food_diet: ''
    });
  });

  it('addMemberAdmin stores the leader flag as 0/1 and the bac level / food choice', async () => {
    const member = await db.addMemberAdmin(env.DB, team.id, person({ isLeader: true, bacLevel: 3, foodDiet: 'reine' }));
    expect(await db.getMemberById(env.DB, member.id)).toMatchObject({ is_leader: 1, bac_level: 3, food_diet: 'reine' });
  });

  it('addMemberAdmin rejects a duplicate first/last name', async () => {
    const data = person();
    await db.addMemberAdmin(env.DB, team.id, data);
    await expect(db.addMemberAdmin(env.DB, team.id, person({ firstName: data.firstName, lastName: data.lastName }))).rejects.toThrow(/UNIQUE/i);
  });

  it('addMemberAdmin also returns the team id', async () => {
    const member = await db.addMemberAdmin(env.DB, team.id, person());
    expect(member.teamId).toBe(team.id);
  });

  it('getMemberById returns null for an unknown id', async () => {
    expect(await db.getMemberById(env.DB, 987_654)).toBeNull();
  });

  describe('updateMember', () => {
    it('updates a single field without touching the others', async () => {
      const member = await db.addMemberAdmin(env.DB, team.id, person({ bacLevel: 2, foodDiet: 'reine' }));

      expect(await db.updateMember(env.DB, member.id, { bacLevel: 5 })).toBe(true);
      expect(await db.getMemberById(env.DB, member.id)).toMatchObject({
        bac_level: 5, food_diet: 'reine', first_name: member.firstName
      });
    });

    it('maps isLeader to 0/1 in both directions', async () => {
      const member = await db.addMemberAdmin(env.DB, team.id, person());

      await db.updateMember(env.DB, member.id, { isLeader: true });
      expect((await db.getMemberById(env.DB, member.id)).is_leader).toBe(1);

      await db.updateMember(env.DB, member.id, { isLeader: false });
      expect((await db.getMemberById(env.DB, member.id)).is_leader).toBe(0);
    });

    it('moves a member to another team', async () => {
      const other = await newTeam();
      const member = await db.addMemberAdmin(env.DB, team.id, person());

      await db.updateMember(env.DB, member.id, { teamId: other.id });
      expect((await db.getMemberById(env.DB, member.id)).team_id).toBe(other.id);
      expect(await db.getTeamMemberCount(env.DB, team.id)).toBe(0);
      expect(await db.getTeamMemberCount(env.DB, other.id)).toBe(1);
    });

    it('updates names, email and food choice together', async () => {
      const member = await db.addMemberAdmin(env.DB, team.id, person());
      const changes = { firstName: uniq('NF'), lastName: uniq('NL'), email: 'new@example.com', foodDiet: 'margherita' };

      await db.updateMember(env.DB, member.id, changes);
      expect(await db.getMemberById(env.DB, member.id)).toMatchObject({
        first_name: changes.firstName, last_name: changes.lastName, email: changes.email, food_diet: 'margherita'
      });
    });

    it('returns false when there is nothing to change', async () => {
      const member = await db.addMemberAdmin(env.DB, team.id, person());
      expect(await db.updateMember(env.DB, member.id, {})).toBe(false);
      expect(await db.updateMember(env.DB, member.id, { email: undefined })).toBe(false);
    });
  });

  it('deleteMember reports whether a row was removed', async () => {
    const member = await db.addMemberAdmin(env.DB, team.id, person());
    expect(await db.deleteMember(env.DB, member.id)).toBe(true);
    expect(await db.deleteMember(env.DB, member.id)).toBe(false);
  });

  it('deleteMembers removes the listed ids and reports how many existed', async () => {
    const a = await db.addMemberAdmin(env.DB, team.id, person());
    const b = await db.addMemberAdmin(env.DB, team.id, person());
    const keep = await db.addMemberAdmin(env.DB, team.id, person());

    expect(await db.deleteMembers(env.DB, [])).toBe(0);
    expect(await db.deleteMembers(env.DB, [a.id, b.id, 987_654])).toBe(2);
    expect(await db.getMemberById(env.DB, keep.id)).not.toBeNull();
    expect(await db.getParticipantsExcludingOrg(env.DB)).toBe(1);
  });

  it('getAllMembers joins the team name and orders by team, then last and first name', async () => {
    const zed = await newTeam('Zed team');
    const abe = await newTeam('Abe team');
    await db.addMemberAdmin(env.DB, zed.id, { firstName: 'Ann', lastName: 'Zulu', email: 'a@example.com' });
    await db.addMemberAdmin(env.DB, abe.id, { firstName: 'Bob', lastName: 'Yankee', email: 'b@example.com' });
    await db.addMemberAdmin(env.DB, abe.id, { firstName: 'Cid', lastName: 'Alpha', email: 'c@example.com' });

    const members = await db.getAllMembers(env.DB);
    expect(members.map(m => `${m.team_name}/${m.last_name}`)).toEqual(['Abe team/Alpha', 'Abe team/Yankee', 'Zed team/Zulu']);
    expect(members[0]).not.toHaveProperty('team_id');
  });

  it('getFoodStats ignores empty choices and sorts by popularity', async () => {
    await db.addMemberAdmin(env.DB, team.id, person({ foodDiet: 'reine' }));
    await db.addMemberAdmin(env.DB, team.id, person({ foodDiet: 'margherita' }));
    await db.addMemberAdmin(env.DB, team.id, person({ foodDiet: 'margherita' }));
    await db.addMemberAdmin(env.DB, team.id, person({ foodDiet: '' }));

    expect(await db.getFoodStats(env.DB)).toEqual([
      { food_diet: 'margherita', count: 2 },
      { food_diet: 'reine', count: 1 }
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

describe('db (statistics)', () => {
  const ORG = 'Organisation';
  let teamA;
  let org;

  /** Insert a member straight into D1 with the given columns. */
  async function insertMember(teamId, columns = {}) {
    const tag = uniq('s');
    const row = { first_name: `F${tag}`, last_name: `L${tag}`, email: `${tag}@example.com`, ...columns };
    const names = Object.keys(row);
    const result = await env.DB.prepare(
      `INSERT INTO members (team_id, ${names.join(', ')}) VALUES (?, ${names.map(() => '?').join(', ')})`
    ).bind(teamId, ...Object.values(row)).run();
    return result.meta.last_row_id;
  }

  beforeEach(async () => {
    teamA = await newTeam();
    org = await newTeam(ORG);
  });

  it('getParticipantsExcludingOrg and getTeamsExcludingOrg leave the Organisation team out', async () => {
    await insertMember(teamA.id);
    await insertMember(org.id);
    await insertMember(org.id);

    expect(await db.getParticipantsExcludingOrg(env.DB)).toBe(1);
    expect((await db.getTeamsExcludingOrg(env.DB)).map(t => t.name)).toEqual([teamA.name]);
    expect(await db.getTeams(env.DB)).toHaveLength(2);
  });

  it('getTierStats counts and sums the check-in tiers, Organisation excluded', async () => {
    await insertMember(teamA.id, { payment_tier: 'asso_member', payment_amount: 500 });
    await insertMember(teamA.id, { payment_tier: 'asso_member', payment_amount: 500 });
    await insertMember(teamA.id, { payment_tier: 'non_member', payment_amount: 800 });
    await insertMember(teamA.id, { payment_tier: 'late', payment_amount: 1000 });
    await insertMember(teamA.id, { payment_tier: 'online_tier1', payment_amount: 500 });
    await insertMember(org.id, { payment_tier: 'organisation', payment_amount: 0 });
    await insertMember(org.id, { payment_tier: 'late', payment_amount: 1000 });

    expect(await db.getTierStats(env.DB)).toMatchObject({
      total_paid: 5, total_revenue: 3300,
      asso_members: 2, asso_revenue: 1000,
      non_members: 1, non_member_revenue: 800,
      late_arrivals: 1, late_revenue: 1000
    });
  });

  it('getPizzaStats lists real pizzas only: "none", "0-rien" and empty are not a pizza type', async () => {
    await insertMember(teamA.id, { food_diet: 'reine', checked_in: 1 });
    await insertMember(teamA.id, { food_diet: 'reine', pizza_received: 1 });
    await insertMember(teamA.id, { food_diet: 'none', checked_in: 1 });
    await insertMember(teamA.id, { food_diet: '0-rien' });
    await insertMember(teamA.id, { food_diet: '' });

    const stats = await db.getPizzaStats(env.DB);
    expect(stats).toMatchObject({ total: 5, received: 1, pending: 4 });
    expect(stats.by_type).toEqual([{ food_diet: 'reine', total: 2, received: 1 }]);
    expect(stats.present.total).toBe(2);
    expect(stats.present.by_type).toEqual([{ food_diet: 'reine', total: 1, received: 0 }]);
  });

  it('getPizzaStatsByRoom ignores the Organisation team and "no pizza" members', async () => {
    await env.DB.prepare('UPDATE teams SET room = ? WHERE id IN (?, ?)').bind('Salle 1', teamA.id, org.id).run();
    await insertMember(teamA.id, { food_diet: 'reine' });
    await insertMember(teamA.id, { food_diet: 'none' });
    await insertMember(org.id, { food_diet: 'reine' });

    const [room] = await db.getPizzaStatsByRoom(env.DB);
    expect(room.room).toBe('Salle 1');
    expect(room.pizzas).toEqual([{ food_diet: 'reine', total: 1, present: 0, received: 0 }]);
    expect(room.totals).toEqual({ total: 1, present: 0, received: 0 });
  });

  it('getTeamsWithRooms and getRoomStats exclude the Organisation team', async () => {
    await env.DB.prepare('UPDATE teams SET room = ? WHERE id = ?').bind('Salle 2', org.id).run();

    expect((await db.getTeamsWithRooms(env.DB)).map(t => t.name)).toEqual([teamA.name]);
    expect(await db.getRoomStats(env.DB)).toMatchObject({ total_teams: 1, assigned_teams: 0, unassigned_teams: 1, by_room: [] });
  });

  it('getBacLevelStats groups by level in ascending order', async () => {
    await insertMember(teamA.id, { bac_level: 5 });
    await insertMember(teamA.id, { bac_level: 1 });
    await insertMember(teamA.id, { bac_level: 5 });

    expect(await db.getBacLevelStats(env.DB)).toEqual([{ bac_level: 1, count: 1 }, { bac_level: 5, count: 2 }]);
  });
});

describe('db (batches)', () => {
  it('batch helpers split long id lists into chunks that fit the D1 variable limit, in one batch', async () => {
    const team = await newTeam();
    const ids = [];
    for (let i = 0; i < 12; i++) {
      const rows = Array.from({ length: 25 }, (_, j) => {
        const tag = `${uniq('b')}-${i}-${j}`;
        return env.DB.prepare('INSERT INTO members (team_id, first_name, last_name, email) VALUES (?, ?, ?, ?)')
          .bind(team.id, `F${tag}`, `L${tag}`, `${tag}@example.com`);
      });
      for (const result of await env.DB.batch(rows)) ids.push(result.meta.last_row_id);
    }
    expect(ids).toHaveLength(300);

    expect(await db.checkInMembers(env.DB, ids)).toBe(300);
    expect(await db.givePizzaBatch(env.DB, ids)).toBe(300);
    expect(await db.revokePizzaBatch(env.DB, ids)).toBe(300);
    expect(await db.checkOutMembers(env.DB, ids)).toBe(300);
    expect(await db.getTeamMemberCount(env.DB, team.id)).toBe(300);
    expect(await db.deleteMembers(env.DB, [...ids, 987_654_321])).toBe(300);
    expect(await db.getTeamMemberCount(env.DB, team.id)).toBe(0);
  });

  it('setTeamRoomsBatch reports the teams that do not exist, in one atomic batch', async () => {
    const [a, b] = [await newTeam(), await newTeam()];

    const result = await db.setTeamRoomsBatch(env.DB, [
      { teamId: a.id, room: 'Salle 1' }, { teamId: 987_654, room: 'Salle 2' }, { teamId: b.id, room: null }
    ]);
    expect(result).toEqual({ updated: 2, skipped: [987_654] });
    expect((await db.getTeamById(env.DB, a.id)).room).toBe('Salle 1');
    expect(await db.setTeamRoomsBatch(env.DB, [])).toEqual({ updated: 0, skipped: [] });
  });

  it('deleteTeam removes the team and its members together', async () => {
    const team = await newTeam();
    await db.addMemberAdmin(env.DB, team.id, person());
    expect(await db.deleteTeam(env.DB, team.id)).toBe(true);
    expect(await db.getTeamMemberCount(env.DB, team.id)).toBe(0);
    expect(await db.deleteTeam(env.DB, team.id)).toBe(false);
  });

  it('setSettings writes every entry or none (one D1 batch)', async () => {
    expect(await settingsDb.setSettings(env.DB, [['k1', 'v1'], ['k2', 'v2']])).toBe(2);
    expect(await settingsDb.getSetting(env.DB, 'k2')).toBe('v2');

    // a NOT NULL violation in the second statement rolls the whole batch back
    await expect(settingsDb.setSettings(env.DB, [['k1', 'changed'], ['k3', null]])).rejects.toThrow();
    expect(await settingsDb.getSetting(env.DB, 'k1')).toBe('v1');
    expect(await settingsDb.getSetting(env.DB, 'k3')).toBeNull();
    expect(await settingsDb.setSettings(env.DB, [])).toBe(0);
  });
});
