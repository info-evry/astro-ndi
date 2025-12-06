import { describe, it, expect } from 'vitest';
import {
  createSortComparator,
  sortMembers,
  sortTeams,
  filterMembers,
  filterMembersByStatus,
  filterTeamsByRoom,
  toggleSortDirection
} from '../../src/client/lib/sorting.js';

describe('Sorting Utilities', () => {
  describe('createSortComparator', () => {
    it('sorts strings ascending', () => {
      const arr = [{ name: 'Charlie' }, { name: 'Alice' }, { name: 'Bob' }];
      arr.sort(createSortComparator('name', 'asc'));
      expect(arr.map(x => x.name)).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    it('sorts strings descending', () => {
      const arr = [{ name: 'Alice' }, { name: 'Charlie' }, { name: 'Bob' }];
      arr.sort(createSortComparator('name', 'desc'));
      expect(arr.map(x => x.name)).toEqual(['Charlie', 'Bob', 'Alice']);
    });

    it('handles case insensitivity', () => {
      const arr = [{ name: 'alice' }, { name: 'Bob' }, { name: 'CHARLIE' }];
      arr.sort(createSortComparator('name', 'asc'));
      expect(arr.map(x => x.name)).toEqual(['alice', 'Bob', 'CHARLIE']);
    });

    it('handles null values (nulls last by default)', () => {
      const arr = [{ name: null }, { name: 'Alice' }, { name: 'Bob' }];
      arr.sort(createSortComparator('name', 'asc'));
      expect(arr.map(x => x.name)).toEqual(['Alice', 'Bob', null]);
    });

    it('sorts numbers', () => {
      const arr = [{ val: 3 }, { val: 1 }, { val: 2 }];
      arr.sort(createSortComparator('val', 'asc'));
      expect(arr.map(x => x.val)).toEqual([1, 2, 3]);
    });
  });

  describe('sortMembers', () => {
    const members = [
      { first_name: 'John', last_name: 'Doe', email: 'john@test.com', team_name: 'Alpha', bac_level: 3, is_manager: true },
      { first_name: 'Jane', last_name: 'Smith', email: 'jane@test.com', team_name: 'Beta', bac_level: 5, is_manager: false },
      { first_name: 'Alice', last_name: 'Brown', email: 'alice@test.com', team_name: 'Alpha', bac_level: 1, is_manager: false }
    ];

    it('sorts by name', () => {
      const sorted = sortMembers(members, 'name', 'asc');
      expect(sorted[0].first_name).toBe('Alice');
      expect(sorted[1].first_name).toBe('Jane');
      expect(sorted[2].first_name).toBe('John');
    });

    it('sorts by email', () => {
      const sorted = sortMembers(members, 'email', 'asc');
      expect(sorted[0].email).toBe('alice@test.com');
    });

    it('sorts by team', () => {
      const sorted = sortMembers(members, 'team', 'asc');
      expect(sorted[0].team_name).toBe('Alpha');
      expect(sorted[2].team_name).toBe('Beta');
    });

    it('sorts by bac level', () => {
      const sorted = sortMembers(members, 'bac', 'asc');
      expect(sorted[0].bac_level).toBe(1);
      expect(sorted[2].bac_level).toBe(5);
    });

    it('sorts by manager status (leaders first)', () => {
      const sorted = sortMembers(members, 'manager', 'asc');
      expect(sorted[0].is_manager).toBe(true);
    });

    it('does not mutate original array', () => {
      const original = [...members];
      sortMembers(members, 'name', 'desc');
      expect(members).toEqual(original);
    });

    it('handles empty array', () => {
      expect(sortMembers([], 'name')).toEqual([]);
    });

    it('handles non-array input', () => {
      expect(sortMembers(null, 'name')).toEqual([]);
      expect(sortMembers(undefined, 'name')).toEqual([]);
    });
  });

  describe('sortTeams', () => {
    const teams = [
      { name: 'Team C', member_count: 5, room: 'Room 1' },
      { name: 'Team A', member_count: 3, room: 'Room 2' },
      { name: 'Team B', member_count: 7, room: null }
    ];

    it('sorts by name', () => {
      const sorted = sortTeams(teams, 'name', 'asc');
      expect(sorted[0].name).toBe('Team A');
    });

    it('sorts by member count', () => {
      const sorted = sortTeams(teams, 'members', 'asc');
      expect(sorted[0].member_count).toBe(3);
      expect(sorted[2].member_count).toBe(7);
    });

    it('sorts by room', () => {
      const sorted = sortTeams(teams, 'room', 'asc');
      expect(sorted[0].room).toBe('Room 1');
    });
  });

  describe('filterMembers', () => {
    const members = [
      { first_name: 'John', last_name: 'Doe', email: 'john@test.com', team_name: 'Alpha' },
      { first_name: 'Jane', last_name: 'Smith', email: 'jane@test.com', team_name: 'Beta' },
      { first_name: 'Alice', last_name: 'Johnson', email: 'alice@test.com', team_name: 'Alpha' }
    ];

    it('filters by first name', () => {
      const filtered = filterMembers(members, 'john');
      expect(filtered).toHaveLength(2); // John and Johnson
    });

    it('filters by email', () => {
      const filtered = filterMembers(members, 'jane@');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].first_name).toBe('Jane');
    });

    it('filters by team name', () => {
      const filtered = filterMembers(members, 'alpha');
      expect(filtered).toHaveLength(2);
    });

    it('is case insensitive', () => {
      const filtered = filterMembers(members, 'JOHN');
      expect(filtered).toHaveLength(2);
    });

    it('returns all if no search term', () => {
      expect(filterMembers(members, '')).toHaveLength(3);
      expect(filterMembers(members, null)).toHaveLength(3);
    });

    it('handles empty array', () => {
      expect(filterMembers([], 'test')).toEqual([]);
    });
  });

  describe('filterMembersByStatus', () => {
    const members = [
      { id: 1, checked_in: 1, payment_status: 'paid' },
      { id: 2, checked_in: 0, payment_status: 'delayed' },
      { id: 3, checked_in: null, payment_tier: 'asso_member' },
      { id: 4, checked_in: 1, payment_status: 'pending' }
    ];

    it('filters all (no filter)', () => {
      expect(filterMembersByStatus(members, 'all')).toHaveLength(4);
    });

    it('filters present members', () => {
      const filtered = filterMembersByStatus(members, 'present');
      expect(filtered).toHaveLength(2);
      expect(filtered.every(m => m.checked_in === 1)).toBe(true);
    });

    it('filters absent members', () => {
      const filtered = filterMembersByStatus(members, 'absent');
      expect(filtered).toHaveLength(2);
    });

    it('filters paid members', () => {
      const filtered = filterMembersByStatus(members, 'paid');
      expect(filtered).toHaveLength(2); // paid status or payment_tier
    });

    it('filters pending members', () => {
      const filtered = filterMembersByStatus(members, 'pending');
      expect(filtered).toHaveLength(1);
    });

    it('filters delayed members', () => {
      const filtered = filterMembersByStatus(members, 'delayed');
      expect(filtered).toHaveLength(1);
    });
  });

  describe('filterTeamsByRoom', () => {
    const teams = [
      { id: 1, name: 'Team A', room: 'Room 1' },
      { id: 2, name: 'Team B', room: '' },
      { id: 3, name: 'Team C', room: null }
    ];

    it('returns all teams with "all" filter', () => {
      expect(filterTeamsByRoom(teams, 'all')).toHaveLength(3);
    });

    it('filters assigned teams', () => {
      const filtered = filterTeamsByRoom(teams, 'assigned');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('Team A');
    });

    it('filters unassigned teams', () => {
      const filtered = filterTeamsByRoom(teams, 'unassigned');
      expect(filtered).toHaveLength(2);
    });
  });

  describe('toggleSortDirection', () => {
    it('toggles asc to desc', () => {
      expect(toggleSortDirection('asc')).toBe('desc');
    });

    it('toggles desc to asc', () => {
      expect(toggleSortDirection('desc')).toBe('asc');
    });
  });
});
