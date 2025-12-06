/**
 * Tests for archives database functions
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import {
  detectEventYear,
  archiveExists,
  getArchives,
  getArchiveByYear,
  createArchive,
  checkAndApplyExpiration,
  checkAllExpirations,
  resetAllData,
  getDataCounts,
  calculateStats,
  generateDataHash,
  anonymizeMembers,
  anonymizePaymentEvents
} from '../src/database/db.archives.js';

// Setup database tables
beforeAll(async () => {
  // Core tables
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS teams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, description TEXT DEFAULT '', password_hash TEXT DEFAULT '', room_id TEXT DEFAULT NULL, created_at TEXT DEFAULT (datetime('now')))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY AUTOINCREMENT, team_id INTEGER NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL, bac_level INTEGER DEFAULT 0, is_leader INTEGER DEFAULT 0, food_diet TEXT DEFAULT '', checked_in INTEGER DEFAULT 0, checked_in_at TEXT DEFAULT NULL, created_at TEXT DEFAULT (datetime('now')), payment_status TEXT DEFAULT 'unpaid', payment_method TEXT DEFAULT NULL, checkout_id TEXT DEFAULT NULL, transaction_id TEXT DEFAULT NULL, registration_tier TEXT DEFAULT NULL, payment_amount INTEGER DEFAULT NULL, payment_confirmed_at TEXT DEFAULT NULL, payment_tier TEXT DEFAULT NULL, FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE, UNIQUE(first_name, last_name))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, description TEXT DEFAULT '', updated_at TEXT DEFAULT (datetime('now')))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS payment_events (id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER NOT NULL, checkout_id TEXT, event_type TEXT NOT NULL, amount INTEGER NOT NULL, tier TEXT NOT NULL, metadata TEXT, created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE)`);

  // Archives table
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS archives (id INTEGER PRIMARY KEY AUTOINCREMENT, event_year INTEGER NOT NULL UNIQUE, archived_at TEXT NOT NULL DEFAULT (datetime('now')), expiration_date TEXT NOT NULL, is_expired INTEGER DEFAULT 0, teams_json TEXT NOT NULL, members_json TEXT NOT NULL, payment_events_json TEXT, stats_json TEXT NOT NULL, total_teams INTEGER NOT NULL, total_participants INTEGER NOT NULL, total_revenue INTEGER DEFAULT 0, data_hash TEXT NOT NULL)`);
});

// Clean up before each test
beforeEach(async () => {
  await env.DB.exec('DELETE FROM payment_events');
  await env.DB.exec('DELETE FROM members');
  await env.DB.exec('DELETE FROM teams');
  await env.DB.exec('DELETE FROM archives');
  await env.DB.exec('DELETE FROM settings');
});

describe('detectEventYear', () => {
  it('should return current year when no settings or data', async () => {
    const year = await detectEventYear(env.DB);
    expect(year).toBe(new Date().getFullYear());
  });

  it('should return event_year from settings when set', async () => {
    await env.DB.exec(`INSERT INTO settings (key, value) VALUES ('event_year', '2024')`);

    const year = await detectEventYear(env.DB);
    expect(year).toBe(2024);
  });

  it('should infer year from member registrations when no setting', async () => {
    // Create a team and member with specific date
    await env.DB.exec(`INSERT INTO teams (name) VALUES ('Test Team')`);
    await env.DB.exec(`INSERT INTO members (team_id, first_name, last_name, email, created_at) VALUES (1, 'Test', 'User', 'test@test.com', '2023-11-15 10:00:00')`);

    const year = await detectEventYear(env.DB);
    expect(year).toBe(2023);
  });

  it('should handle January registrations as previous year event', async () => {
    await env.DB.exec(`INSERT INTO teams (name) VALUES ('Test Team')`);
    await env.DB.exec(`INSERT INTO members (team_id, first_name, last_name, email, created_at) VALUES (1, 'Test', 'User', 'test@test.com', '2024-01-05 10:00:00')`);

    const year = await detectEventYear(env.DB);
    expect(year).toBe(2023);
  });
});

describe('archiveExists', () => {
  it('should return false when no archive exists', async () => {
    const exists = await archiveExists(env.DB, 2024);
    expect(exists).toBe(false);
  });

  it('should return true when archive exists', async () => {
    await env.DB.exec(`INSERT INTO archives (event_year, expiration_date, teams_json, members_json, stats_json, total_teams, total_participants, data_hash) VALUES (2024, '2027-01-01', '[]', '[]', '{}', 0, 0, 'abc123')`);

    const exists = await archiveExists(env.DB, 2024);
    expect(exists).toBe(true);
  });
});

describe('getArchives', () => {
  it('should return empty array when no archives', async () => {
    const archives = await getArchives(env.DB);
    expect(archives).toEqual([]);
  });

  it('should return archives ordered by year descending', async () => {
    await env.DB.exec(`INSERT INTO archives (event_year, expiration_date, teams_json, members_json, stats_json, total_teams, total_participants, data_hash) VALUES (2022, '2025-01-01', '[]', '[]', '{}', 5, 20, 'hash1')`);
    await env.DB.exec(`INSERT INTO archives (event_year, expiration_date, teams_json, members_json, stats_json, total_teams, total_participants, data_hash) VALUES (2024, '2027-01-01', '[]', '[]', '{}', 10, 50, 'hash2')`);
    await env.DB.exec(`INSERT INTO archives (event_year, expiration_date, teams_json, members_json, stats_json, total_teams, total_participants, data_hash) VALUES (2023, '2026-01-01', '[]', '[]', '{}', 8, 35, 'hash3')`);

    const archives = await getArchives(env.DB);

    expect(archives.length).toBe(3);
    expect(archives[0].event_year).toBe(2024);
    expect(archives[1].event_year).toBe(2023);
    expect(archives[2].event_year).toBe(2022);
  });
});

describe('getArchiveByYear', () => {
  it('should return null for non-existent archive', async () => {
    const archive = await getArchiveByYear(env.DB, 2024);
    expect(archive).toBeNull();
  });

  it('should return archive with parsed JSON fields', async () => {
    const teams = [{ id: 1, name: 'Team A' }];
    const members = [{ id: 1, first_name: 'Test' }];
    const stats = { total_teams: 1 };

    await env.DB.exec(`INSERT INTO archives (event_year, expiration_date, teams_json, members_json, stats_json, total_teams, total_participants, data_hash) VALUES (2024, '2027-01-01', '${JSON.stringify(teams)}', '${JSON.stringify(members)}', '${JSON.stringify(stats)}', 1, 1, 'hash')`);

    const archive = await getArchiveByYear(env.DB, 2024);

    expect(archive).not.toBeNull();
    expect(archive.event_year).toBe(2024);
    expect(archive.teams).toEqual(teams);
    expect(archive.members).toEqual(members);
    expect(archive.stats).toEqual(stats);
    expect(archive.payment_events).toEqual([]);
  });
});

describe('createArchive', () => {
  beforeEach(async () => {
    await env.DB.exec(`INSERT INTO settings (key, value) VALUES ('gdpr_retention_years', '3')`);
  });

  it('should create archive with team and member data', async () => {
    await env.DB.exec(`INSERT INTO teams (name, description) VALUES ('Team Alpha', 'First team')`);
    await env.DB.exec(`INSERT INTO members (team_id, first_name, last_name, email, bac_level, is_leader, food_diet, payment_status, payment_amount) VALUES (1, 'Alice', 'Smith', 'alice@test.com', 3, 1, 'vegetarian', 'paid', 500)`);
    await env.DB.exec(`INSERT INTO members (team_id, first_name, last_name, email, bac_level, is_leader, food_diet) VALUES (1, 'Bob', 'Jones', 'bob@test.com', 2, 0, '')`);

    const archive = await createArchive(env.DB, 2024);

    expect(archive.event_year).toBe(2024);
    expect(archive.total_teams).toBe(1);
    expect(archive.total_participants).toBe(2);
    expect(archive.total_revenue).toBe(500);
    expect(archive.expiration_date).toBeDefined();
    expect(archive.data_hash).toBeDefined();
  });

  it('should set expiration date based on gdpr_retention_years setting', async () => {
    await env.DB.exec(`UPDATE settings SET value = '5' WHERE key = 'gdpr_retention_years'`);
    await env.DB.exec(`INSERT INTO teams (name) VALUES ('Test')`);
    await env.DB.exec(`INSERT INTO members (team_id, first_name, last_name, email) VALUES (1, 'Test', 'User', 'test@test.com')`);

    const archive = await createArchive(env.DB, 2024);
    const expirationDate = new Date(archive.expiration_date);
    const expectedYear = new Date().getFullYear() + 5;

    expect(expirationDate.getFullYear()).toBe(expectedYear);
  });
});

describe('checkAndApplyExpiration', () => {
  it('should return not expired for non-existent archive', async () => {
    const result = await checkAndApplyExpiration(env.DB, 2024);
    expect(result).toEqual({ expired: false, updated: false });
  });

  it('should return already expired for previously expired archive', async () => {
    await env.DB.exec(`INSERT INTO archives (event_year, expiration_date, is_expired, teams_json, members_json, stats_json, total_teams, total_participants, data_hash) VALUES (2020, '2023-01-01', 1, '[]', '[]', '{}', 0, 0, 'hash')`);

    const result = await checkAndApplyExpiration(env.DB, 2020);
    expect(result).toEqual({ expired: true, updated: false });
  });

  it('should not expire archive with future expiration date', async () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);

    await env.DB.exec(`INSERT INTO archives (event_year, expiration_date, is_expired, teams_json, members_json, stats_json, total_teams, total_participants, data_hash) VALUES (2024, '${futureDate.toISOString()}', 0, '[]', '[]', '{}', 0, 0, 'hash')`);

    const result = await checkAndApplyExpiration(env.DB, 2024);
    expect(result).toEqual({ expired: false, updated: false });
  });

  it('should anonymize data when expiration date has passed', async () => {
    const pastDate = new Date();
    pastDate.setFullYear(pastDate.getFullYear() - 1);

    const members = [{ id: 1, first_name: 'Alice', last_name: 'Smith', email: 'alice@test.com', team_id: 1 }];

    await env.DB.exec(`INSERT INTO archives (event_year, expiration_date, is_expired, teams_json, members_json, stats_json, total_teams, total_participants, data_hash) VALUES (2020, '${pastDate.toISOString()}', 0, '[]', '${JSON.stringify(members)}', '{}', 1, 1, 'hash')`);

    const result = await checkAndApplyExpiration(env.DB, 2020);

    expect(result).toEqual({ expired: true, updated: true });

    // Verify anonymization
    const archive = await getArchiveByYear(env.DB, 2020);
    expect(archive.is_expired).toBe(1);
    expect(archive.members[0].first_name).toBe('Participant');
    expect(archive.members[0].last_name).toBe('');
    expect(archive.members[0].email).toBeNull();
  });
});

describe('checkAllExpirations', () => {
  it('should return empty array when no archives', async () => {
    const results = await checkAllExpirations(env.DB);
    expect(results).toEqual([]);
  });

  it('should check all non-expired archives', async () => {
    const pastDate = new Date();
    pastDate.setFullYear(pastDate.getFullYear() - 1);

    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);

    await env.DB.exec(`INSERT INTO archives (event_year, expiration_date, is_expired, teams_json, members_json, stats_json, total_teams, total_participants, data_hash) VALUES (2020, '${pastDate.toISOString()}', 0, '[]', '[]', '{}', 0, 0, 'hash1')`);
    await env.DB.exec(`INSERT INTO archives (event_year, expiration_date, is_expired, teams_json, members_json, stats_json, total_teams, total_participants, data_hash) VALUES (2024, '${futureDate.toISOString()}', 0, '[]', '[]', '{}', 0, 0, 'hash2')`);
    await env.DB.exec(`INSERT INTO archives (event_year, expiration_date, is_expired, teams_json, members_json, stats_json, total_teams, total_participants, data_hash) VALUES (2019, '2022-01-01', 1, '[]', '[]', '{}', 0, 0, 'hash3')`);

    const results = await checkAllExpirations(env.DB);

    // Should only check non-expired archives (2020 and 2024)
    expect(results.length).toBe(2);
    expect(results.find(r => r.year === 2020)).toEqual({ year: 2020, expired: true, updated: true });
    expect(results.find(r => r.year === 2024)).toEqual({ year: 2024, expired: false, updated: false });
  });
});

describe('resetAllData', () => {
  it('should delete all teams, members, and payment events', async () => {
    await env.DB.exec(`INSERT INTO teams (name) VALUES ('Team A'), ('Team B')`);
    await env.DB.exec(`INSERT INTO members (team_id, first_name, last_name, email) VALUES (1, 'Alice', 'A', 'a@test.com'), (1, 'Bob', 'B', 'b@test.com'), (2, 'Carol', 'C', 'c@test.com')`);
    await env.DB.exec(`INSERT INTO payment_events (member_id, event_type, amount, tier) VALUES (1, 'payment', 500, 'tier1')`);

    const result = await resetAllData(env.DB);

    expect(result.teams).toBe(2);
    expect(result.members).toBe(3);
    expect(result.payments).toBe(1);

    // Verify tables are empty
    const counts = await getDataCounts(env.DB);
    expect(counts.teams).toBe(0);
    expect(counts.members).toBe(0);
    expect(counts.payments).toBe(0);
  });
});

describe('getDataCounts', () => {
  it('should return zero counts for empty database', async () => {
    const counts = await getDataCounts(env.DB);
    expect(counts).toEqual({ teams: 0, members: 0, payments: 0 });
  });

  it('should return correct counts', async () => {
    await env.DB.exec(`INSERT INTO teams (name) VALUES ('Team A'), ('Team B')`);
    await env.DB.exec(`INSERT INTO members (team_id, first_name, last_name, email) VALUES (1, 'Alice', 'A', 'a@test.com'), (2, 'Bob', 'B', 'b@test.com')`);
    await env.DB.exec(`INSERT INTO payment_events (member_id, event_type, amount, tier) VALUES (1, 'payment', 500, 'tier1'), (1, 'refund', -500, 'tier1')`);

    const counts = await getDataCounts(env.DB);
    expect(counts).toEqual({ teams: 2, members: 2, payments: 2 });
  });
});

describe('calculateStats', () => {
  it('should calculate statistics from data', () => {
    const teams = [{ id: 1 }, { id: 2 }];
    const members = [
      { id: 1, bac_level: 3, food_diet: 'vegetarian', checked_in: 1, payment_status: 'paid', payment_method: 'online', payment_amount: 500, created_at: '2024-11-15T10:00:00' },
      { id: 2, bac_level: 3, food_diet: 'vegetarian', checked_in: 0, payment_status: 'paid', payment_method: 'on_site', payment_amount: 700, created_at: '2024-11-15T10:00:00' },
      { id: 3, bac_level: 5, food_diet: '', checked_in: 1, payment_status: 'unpaid', payment_method: null, payment_amount: null, created_at: '2024-11-16T10:00:00' }
    ];
    const paymentEvents = [];

    const stats = calculateStats(teams, members, paymentEvents);

    expect(stats.total_teams).toBe(2);
    expect(stats.total_participants).toBe(3);
    expect(stats.participants_by_bac_level).toEqual({ '3': 2, '5': 1 });
    expect(stats.food_preferences).toEqual({ 'vegetarian': 2 });
    expect(stats.attendance.checked_in).toBe(2);
    expect(stats.attendance.no_show).toBe(1);
    expect(stats.payments.paid).toBe(2);
    expect(stats.payments.unpaid).toBe(1);
    expect(stats.payments.paid_online).toBe(1);
    expect(stats.payments.paid_onsite).toBe(1);
    expect(stats.payments.total_revenue).toBe(1200);
    expect(stats.registration_timeline['2024-11-15']).toBe(2);
    expect(stats.registration_timeline['2024-11-16']).toBe(1);
  });

  it('should handle empty data', () => {
    const stats = calculateStats([], [], []);

    expect(stats.total_teams).toBe(0);
    expect(stats.total_participants).toBe(0);
    expect(stats.participants_by_bac_level).toEqual({});
    expect(stats.food_preferences).toEqual({});
    expect(stats.attendance.checked_in).toBe(0);
    expect(stats.attendance.no_show).toBe(0);
  });
});

describe('generateDataHash', () => {
  it('should generate consistent hash for same data', () => {
    const data = { teams: [{ id: 1 }], members: [{ id: 1 }] };

    const hash1 = generateDataHash(data);
    const hash2 = generateDataHash(data);

    expect(hash1).toBe(hash2);
  });

  it('should generate different hash for different data', () => {
    const data1 = { teams: [{ id: 1 }] };
    const data2 = { teams: [{ id: 2 }] };

    const hash1 = generateDataHash(data1);
    const hash2 = generateDataHash(data2);

    expect(hash1).not.toBe(hash2);
  });

  it('should return 8-character hex string', () => {
    const hash = generateDataHash({ test: 'data' });
    expect(hash).toMatch(/^[\da-f]{8}$/);
  });
});

describe('anonymizeMembers', () => {
  it('should anonymize personal data', () => {
    const members = [
      { id: 1, first_name: 'Alice', last_name: 'Smith', email: 'alice@test.com', bac_level: 3, checkout_id: 'checkout_123', transaction_id: 'tx_456' },
      { id: 2, first_name: 'Bob', last_name: 'Jones', email: 'bob@test.com', bac_level: 5, checkout_id: 'checkout_789', transaction_id: 'tx_012' }
    ];

    const anonymized = anonymizeMembers(members);

    expect(anonymized[0].first_name).toBe('Participant');
    expect(anonymized[0].last_name).toBe('');
    expect(anonymized[0].email).toBeNull();
    expect(anonymized[0].checkout_id).toBeNull();
    expect(anonymized[0].transaction_id).toBeNull();
    expect(anonymized[0].bac_level).toBe(3);
    expect(anonymized[0].id).toBe(1);

    expect(anonymized[1].first_name).toBe('Participant');
    expect(anonymized[1].last_name).toBe('');
    expect(anonymized[1].email).toBeNull();
  });

  it('should preserve non-personal data', () => {
    const members = [
      { id: 1, first_name: 'Alice', last_name: 'Smith', email: 'alice@test.com', bac_level: 3, team_id: 5, is_leader: 1, food_diet: 'vegetarian', checked_in: 1, payment_status: 'paid', payment_amount: 500 }
    ];

    const anonymized = anonymizeMembers(members);

    expect(anonymized[0].bac_level).toBe(3);
    expect(anonymized[0].team_id).toBe(5);
    expect(anonymized[0].is_leader).toBe(1);
    expect(anonymized[0].food_diet).toBe('vegetarian');
    expect(anonymized[0].checked_in).toBe(1);
    expect(anonymized[0].payment_status).toBe('paid');
    expect(anonymized[0].payment_amount).toBe(500);
  });
});

describe('anonymizePaymentEvents', () => {
  it('should anonymize payment event data', () => {
    const events = [
      { id: 1, member_id: 1, checkout_id: 'checkout_123', event_type: 'payment', amount: 500, tier: 'tier1', metadata: '{"email":"test@test.com"}', created_at: '2024-01-01' },
      { id: 2, member_id: 2, checkout_id: 'checkout_456', event_type: 'refund', amount: -500, tier: 'tier1', metadata: '{"reason":"cancelled"}', created_at: '2024-01-02' }
    ];

    const anonymized = anonymizePaymentEvents(events);

    expect(anonymized[0].checkout_id).toBeNull();
    expect(anonymized[0].metadata).toBeNull();
    expect(anonymized[0].id).toBe(1);
    expect(anonymized[0].member_id).toBe(1);
    expect(anonymized[0].event_type).toBe('payment');
    expect(anonymized[0].amount).toBe(500);
    expect(anonymized[0].tier).toBe('tier1');
    expect(anonymized[0].created_at).toBe('2024-01-01');

    expect(anonymized[1].checkout_id).toBeNull();
    expect(anonymized[1].metadata).toBeNull();
  });
});
