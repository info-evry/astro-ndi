/**
 * GDPR expiry of archives: anonymization details, retention setting,
 * lazy expiry through the admin API and the scheduled cron worker.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import cron from '../cron/index.js';
import {
  createArchive, checkAndApplyExpiration, checkAllExpirations, getArchiveByYear, getArchives, archiveExists
} from '../src/database/db.archives.js';
import { setupSchema, clearAllTables, seedTeam, adminFetch, uniq, countRows } from './helpers.js';

beforeAll(setupSchema);
beforeEach(clearAllTables);
afterEach(() => vi.restoreAllMocks());

const DAY_MS = 24 * 3600 * 1000;

/** Insert an archive row directly, with full control of the expiration date. */
async function insertArchive({ year, expiresAt, expired = 0, members = [], events = [], teams = [], stats = { total_teams: 0 } }) {
  await env.DB.prepare(
    `INSERT INTO archives (event_year, expiration_date, is_expired, teams_json, members_json, payment_events_json, stats_json,
       total_teams, total_participants, total_revenue, data_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    year, new Date(expiresAt).toISOString(), expired, JSON.stringify(teams), JSON.stringify(members), JSON.stringify(events),
    JSON.stringify(stats), teams.length, members.length, 500, 'hash-before'
  ).run();
}

const personalMember = (id) => ({
  id,
  team_id: 1,
  first_name: `Real${id}`,
  last_name: `Person${id}`,
  email: `real${id}@example.com`,
  bac_level: 3,
  is_leader: 1,
  food_diet: 'reine',
  checked_in: 1,
  payment_status: 'paid',
  payment_method: 'online',
  checkout_id: `co-${id}`,
  transaction_id: `txn-${id}`,
  payment_amount: 500
});

const event = (id) => ({ id, member_id: id, checkout_id: `co-${id}`, event_type: 'payment_completed', amount: 500, tier: 'tier1', metadata: '{"transaction_id":"txn-secret"}' });

describe('Anonymization of expired archives', () => {
  it('removes personal data but keeps the statistics members and events are counted by', async () => {
    await insertArchive({
      year: 2020,
      expiresAt: Date.now() - DAY_MS,
      members: [personalMember(1), personalMember(2)],
      events: [event(1)],
      teams: [{ id: 1, name: 'Public Team', member_count: 2 }],
      stats: { total_teams: 1, total_participants: 2 }
    });

    expect(await checkAndApplyExpiration(env.DB, 2020)).toEqual({ expired: true, updated: true });

    const archive = await getArchiveByYear(env.DB, 2020);
    expect(archive.is_expired).toBe(1);

    for (const member of archive.members) {
      expect(member.first_name).toBe('Participant');
      expect(member.last_name).toBe('');
      expect(member.email).toBeNull();
      expect(member.checkout_id).toBeNull();
      expect(member.transaction_id).toBeNull();
      // non-personal attributes stay available for statistics
      expect(member).toMatchObject({ bac_level: 3, is_leader: 1, food_diet: 'reine', payment_status: 'paid', payment_amount: 500 });
    }
    expect(archive.members.map(m => m.id)).toEqual([1, 2]);

    expect(archive.payment_events[0]).toMatchObject({ checkout_id: null, metadata: null, amount: 500, event_type: 'payment_completed' });
    expect(archive.stats).toEqual({ total_teams: 1, total_participants: 2 });
    expect(archive.teams).toEqual([{ id: 1, name: 'Public Team', member_count: 2 }]);
    expect(archive.total_participants).toBe(2);
    expect(archive.data_hash).toBe('hash-before');
  });

  it('leaves no trace of the original personal data in the stored row', async () => {
    await insertArchive({ year: 2020, expiresAt: Date.now() - DAY_MS, members: [personalMember(7)], events: [event(7)] });
    await checkAndApplyExpiration(env.DB, 2020);

    const raw = await env.DB.prepare('SELECT * FROM archives WHERE event_year = 2020').first();
    const serialized = JSON.stringify(raw);
    for (const secret of ['real7@example.com', 'Real7', 'Person7', 'co-7', 'txn-7', 'txn-secret']) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('is idempotent: a second pass changes nothing', async () => {
    await insertArchive({ year: 2020, expiresAt: Date.now() - DAY_MS, members: [personalMember(1)] });
    expect(await checkAndApplyExpiration(env.DB, 2020)).toEqual({ expired: true, updated: true });
    const after = await env.DB.prepare('SELECT members_json FROM archives WHERE event_year = 2020').first();

    expect(await checkAndApplyExpiration(env.DB, 2020)).toEqual({ expired: true, updated: false });
    expect((await env.DB.prepare('SELECT members_json FROM archives WHERE event_year = 2020').first()).members_json).toBe(after.members_json);
  });

  it('expires at the boundary: one minute past is expired, one minute ahead is not', async () => {
    await insertArchive({ year: 2020, expiresAt: Date.now() - 60_000, members: [personalMember(1)] });
    await insertArchive({ year: 2021, expiresAt: Date.now() + 60_000, members: [personalMember(2)] });

    expect((await checkAndApplyExpiration(env.DB, 2020)).expired).toBe(true);
    expect(await checkAndApplyExpiration(env.DB, 2021)).toEqual({ expired: false, updated: false });
    expect((await getArchiveByYear(env.DB, 2021)).members[0].email).toBe('real2@example.com');
  });

  it('copes with an archive without payment events', async () => {
    await insertArchive({ year: 2020, expiresAt: Date.now() - DAY_MS, members: [personalMember(1)] });
    await env.DB.prepare('UPDATE archives SET payment_events_json = NULL WHERE event_year = 2020').run();

    expect(await checkAndApplyExpiration(env.DB, 2020)).toEqual({ expired: true, updated: true });
    expect((await getArchiveByYear(env.DB, 2020)).payment_events).toEqual([]);
  });

  it('checkAllExpirations only processes archives that are not yet marked expired', async () => {
    await insertArchive({ year: 2018, expiresAt: Date.now() - 400 * DAY_MS, expired: 1, members: [personalMember(1)] });
    await insertArchive({ year: 2019, expiresAt: Date.now() - DAY_MS, members: [personalMember(2)] });
    await insertArchive({ year: 2030, expiresAt: Date.now() + 400 * DAY_MS, members: [personalMember(3)] });

    const results = await checkAllExpirations(env.DB);
    expect(results.sort((a, b) => a.year - b.year)).toEqual([
      { year: 2019, expired: true, updated: true },
      { year: 2030, expired: false, updated: false }
    ]);
    // an archive already flagged expired is trusted as-is (not rewritten)
    expect((await getArchiveByYear(env.DB, 2018)).members[0].email).toBe('real1@example.com');
  });
});

describe('GDPR retention setting', () => {
  async function archiveWithRetention(years) {
    if (years !== undefined) {
      await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('gdpr_retention_years', ?)").bind(String(years)).run();
    }
    await seedTeam({ members: 1 });
    return createArchive(env.DB, 2040);
  }

  const yearsAhead = (iso) => (new Date(iso).getTime() - Date.now()) / (365.25 * DAY_MS);

  it('defaults to 3 years when the setting is absent', async () => {
    const archive = await archiveWithRetention();
    expect(yearsAhead(archive.expiration_date)).toBeGreaterThan(2.99);
    expect(yearsAhead(archive.expiration_date)).toBeLessThan(3.01);
  });

  it.each([1, 5, 10])('uses the configured %i-year retention', async (years) => {
    const archive = await archiveWithRetention(years);
    expect(yearsAhead(archive.expiration_date)).toBeGreaterThan(years - 0.01);
    expect(yearsAhead(archive.expiration_date)).toBeLessThan(years + 0.01);
  });

  it('applies the retention chosen through the admin settings API to the next archive', async () => {
    expect((await adminFetch('/api/admin/settings', { method: 'PUT', body: { gdpr_retention_years: 2 } })).status).toBe(200);
    await seedTeam({ members: 1 });

    const response = await adminFetch('/api/admin/archives', { method: 'POST', body: { year: 2041 } });
    expect(response.status).toBe(201);
    const { archive } = await response.json();
    expect(yearsAhead(archive.expiration_date)).toBeGreaterThan(1.99);
    expect(yearsAhead(archive.expiration_date)).toBeLessThan(2.01);
  });

  it('does not shorten the retention of archives that already exist', async () => {
    const first = await archiveWithRetention(5);
    await env.DB.prepare("UPDATE settings SET value = '1' WHERE key = 'gdpr_retention_years'").run();

    const stored = (await getArchives(env.DB)).find(a => a.event_year === 2040);
    expect(stored.expiration_date).toBe(first.expiration_date);
  });
});

describe('Expiry through the admin API', () => {
  beforeEach(async () => {
    await insertArchive({ year: 2020, expiresAt: Date.now() - DAY_MS, members: [personalMember(1)], events: [event(1)] });
  });

  it('GET /api/admin/archives/:year anonymizes an expired archive on first access', async () => {
    const response = await adminFetch('/api/admin/archives/2020');
    const { archive } = await response.json();

    expect(archive.is_expired).toBe(1);
    expect(archive.members[0].email).toBeNull();
    expect(JSON.stringify(archive)).not.toContain('real1@example.com');
  });

  it('the JSON export of an expired archive is anonymized too', async () => {
    const response = await adminFetch('/api/admin/archives/2020/export');
    const { export: data } = await response.json();

    expect(data.metadata.is_expired).toBe(1);
    expect(data.participants[0]).toMatchObject({ first_name: 'Participant', email: null });
    expect(data.payment_events[0].checkout_id).toBeNull();
  });

  it('POST /api/admin/expiration-check reports what it processed, then has nothing left to do', async () => {
    await insertArchive({ year: 2050, expiresAt: Date.now() + 400 * DAY_MS });

    const first = await (await adminFetch('/api/admin/expiration-check', { method: 'POST', body: {} })).json();
    expect(first).toMatchObject({ checked: 2, expired: 1, updated: 1 });
    expect(first.details.find(d => d.year === 2020)).toEqual({ year: 2020, expired: true, updated: true });

    const second = await (await adminFetch('/api/admin/expiration-check', { method: 'POST', body: {} })).json();
    expect(second).toMatchObject({ checked: 1, expired: 0, updated: 0 });
  });

  it('listing archives exposes only metadata and statistics, never the people', async () => {
    const response = await adminFetch('/api/admin/archives');
    const text = await response.text();
    expect(text).not.toContain('real1@example.com');
    expect(text).not.toContain('Real1');
    expect(JSON.parse(text).archives[0]).not.toHaveProperty('members_json');
  });

  it('answers 404 for an unknown archive year and 400 for a malformed one', async () => {
    expect((await adminFetch('/api/admin/archives/1999')).status).toBe(404);
    expect((await adminFetch('/api/admin/archives/abc')).status).toBe(400);
    expect((await adminFetch('/api/admin/archives/abc/export')).status).toBe(400);
  });
});

describe('Cron worker scheduled()', () => {
  const cronEvent = { cron: '0 3 * * *', scheduledTime: Date.now(), type: 'scheduled' };

  it('applies expiry and logs one JSON line describing the run', async () => {
    await insertArchive({ year: 2020, expiresAt: Date.now() - DAY_MS, members: [personalMember(1)] });
    await insertArchive({ year: 2060, expiresAt: Date.now() + 500 * DAY_MS, members: [personalMember(2)] });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await cron.scheduled(cronEvent, env, {});

    expect((await getArchiveByYear(env.DB, 2020)).members[0].email).toBeNull();
    expect((await getArchiveByYear(env.DB, 2060)).members[0].email).toBe('real2@example.com');

    expect(log).toHaveBeenCalledTimes(1);
    const line = JSON.parse(log.mock.calls[0][0]);
    expect(line.event).toBe('gdpr-expiration');
    expect(line.cron).toBe('0 3 * * *');
    expect(line.results.sort((a, b) => a.year - b.year)).toEqual([
      { year: 2020, expired: true, updated: true },
      { year: 2060, expired: false, updated: false }
    ]);
  });

  it('logs an empty result when there is nothing to check', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await cron.scheduled(cronEvent, env, {});

    expect(JSON.parse(log.mock.calls[0][0])).toEqual({ event: 'gdpr-expiration', cron: '0 3 * * *', results: [] });
  });

  it('is safe to run twice (the second run is a no-op)', async () => {
    await insertArchive({ year: 2020, expiresAt: Date.now() - DAY_MS, members: [personalMember(1)] });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await cron.scheduled(cronEvent, env, {});
    await cron.scheduled(cronEvent, env, {});

    expect(JSON.parse(log.mock.calls[1][0]).results).toEqual([]);
    expect(await countRows('archives', 'WHERE is_expired = 1')).toBe(1);
  });

  it('never touches live teams and members', async () => {
    await insertArchive({ year: 2020, expiresAt: Date.now() - DAY_MS, members: [personalMember(1)] });
    const team = await seedTeam({ name: uniq('Live'), members: 2 });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await cron.scheduled(cronEvent, env, {});

    expect(await countRows('members', 'WHERE team_id = ?', team.id)).toBe(2);
    expect(await archiveExists(env.DB, 2020)).toBe(true);
  });

  it('rejects (so the failed run is visible) when the database is unavailable', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const brokenDb = { prepare() { throw new Error('D1 unavailable'); } };

    await expect(cron.scheduled(cronEvent, { DB: brokenDb }, {})).rejects.toThrow('D1 unavailable');
  });
});
