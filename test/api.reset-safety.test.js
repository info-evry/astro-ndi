/**
 * Reset safety: the event data is only wiped when an archive holds exactly the
 * data that is about to be deleted, whatever year it was filed under.
 *
 * Regression: in September 2026 the 2025 teams were deleted although no
 * archive held them (the only archive, mislabelled, held the Organisation
 * team). And an archive taken before late registrations made the reset look
 * "safe" while those registrations were in no archive.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { setupSchema, clearAllTables, seedTeam, adminFetch, countRows, BASE } from './helpers.js';

beforeAll(setupSchema);
beforeEach(clearAllTables);

const YEAR = 2034;
const reset = (body) => adminFetch('/api/admin/reset', { method: 'POST', body });
const archive = (body) => adminFetch('/api/admin/archives', { method: 'POST', body });
const check = async () => (await adminFetch('/api/admin/reset/check')).json();

async function seedEvent() {
  await seedTeam({ name: 'Organisation', password: 'orga', members: 1 });
  return seedTeam({ members: 3 });
}

describe('reset requires an archive of the current data', () => {
  it('an archive of other data under another year is not an archive of this data', async () => {
    const team = await seedEvent();
    await archive({ year: YEAR });
    await env.DB.prepare('DELETE FROM members WHERE id = ?').bind(team.memberIds[0]).run();

    expect(await check()).toMatchObject({ archiveCurrent: false, safe: false });
    expect((await (await reset({ confirmation: 'SUPPRIMER' })).json()).warning).toBe('no_archive');
    expect(await countRows('members')).toBe(3);
  });

  it('force alone no longer wipes unarchived data', async () => {
    await seedEvent();

    const response = await reset({ confirmation: 'SUPPRIMER', force: true });

    expect(response.status).toBe(200);
    expect((await response.json()).warning).toBe('no_archive');
    expect(await countRows('members')).toBe(4);
  });

  it('an archive taken before later changes does not cover them: reset refuses, nothing is deleted', async () => {
    const team = await seedEvent();
    const year = (await check()).year;
    expect((await archive({ year })).status).toBe(201);
    // a late registration, after the archive
    await env.DB.prepare('INSERT INTO members (team_id, first_name, last_name, email) VALUES (?, ?, ?, ?)')
      .bind(team.id, 'Late', 'Comer', 'late@example.com').run();

    expect(await check()).toMatchObject({ archiveExists: true, archiveCurrent: false, safe: false, has_data: true });

    const data = await (await reset({ confirmation: 'SUPPRIMER' })).json();
    expect(data.warning).toBe('archive_outdated');
    expect(data.archiveYear).toBe(year);
    expect(await countRows('members')).toBe(5);
  });

  it('an edit after the archive (check-in, email) also makes it outdated', async () => {
    const team = await seedEvent();
    await archive({ year: (await check()).year });
    await env.DB.prepare('UPDATE members SET checked_in = 1 WHERE id = ?').bind(team.memberIds[0]).run();

    expect((await check()).safe).toBe(false);
    expect((await (await reset({ confirmation: 'SUPPRIMER' })).json()).warning).toBe('archive_outdated');
    expect(await countRows('members')).toBe(4);
  });

  it('replacing the archive with the current data makes the reset possible, and the archive holds the late data', async () => {
    const team = await seedEvent();
    await archive({ year: YEAR });
    await env.DB.prepare('INSERT INTO members (team_id, first_name, last_name, email) VALUES (?, ?, ?, ?)')
      .bind(team.id, 'Late', 'Comer', 'late@example.com').run();

    const refused = await archive({ year: YEAR });
    expect(refused.status).toBe(409);
    expect((await refused.json()).code).toBe('archive_exists');

    const replaced = await archive({ year: YEAR, replace: true });
    expect(replaced.status).toBe(201);
    expect((await replaced.json()).archive.total_participants).toBe(5);
    expect(await countRows('archives')).toBe(1);
    expect(await check()).toMatchObject({ archiveCurrent: true, safe: true });

    const done = await (await reset({ confirmation: 'SUPPRIMER' })).json();
    expect(done.success).toBe(true);
    expect(await countRows('members')).toBe(0);

    const { archive: stored } = await (await adminFetch(`/api/admin/archives/${YEAR}`)).json();
    expect(stored.members.map(m => m.first_name)).toContain('Late');
  });

  it('the archive counts whatever year it was filed under', async () => {
    await seedEvent();
    await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('event_year', '2040')").run();
    await archive({ year: YEAR });

    expect(await check()).toMatchObject({ year: 2040, archiveCurrent: true, archiveYear: YEAR, safe: true });
    expect((await (await reset({ confirmation: 'SUPPRIMER' })).json()).success).toBe(true);
  });

  it('createArchiveFirst + force refuses (deletes nothing) when the year already has a different archive', async () => {
    const team = await seedEvent();
    await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('event_year', ?)").bind(String(YEAR)).run();
    await archive({ year: YEAR });
    await env.DB.prepare('DELETE FROM members WHERE id = ?').bind(team.memberIds[0]).run();

    const data = await (await reset({ confirmation: 'SUPPRIMER', force: true, createArchiveFirst: true })).json();

    expect(data.warning).toBe('archive_outdated');
    expect(await countRows('members')).toBe(3);
    const { archive: stored } = await (await adminFetch(`/api/admin/archives/${YEAR}`)).json();
    expect(stored.members).toHaveLength(4);
  });

  it('an empty database (only the Organisation team) can be reset without an archive', async () => {
    await seedTeam({ name: 'Organisation', password: 'orga', members: 0 });
    expect((await check()).safe).toBe(true);
    expect((await (await reset({ confirmation: 'SUPPRIMER' })).json()).success).toBe(true);
  });

  it('a reset opens the pizza changes again for the next edition', async () => {
    await seedEvent();
    await adminFetch('/api/admin/settings', { method: 'PUT', body: { pizza_changes_open: false } });
    await archive({ year: YEAR });

    await reset({ confirmation: 'SUPPRIMER' });

    const { config } = await (await SELF.fetch(`${BASE}/api/config`)).json();
    expect(config.pizzaChangesOpen).toBe(true);
  });

  it('replace on a year without an archive just creates it', async () => {
    await seedEvent();
    const response = await archive({ year: YEAR, replace: true });
    expect(response.status).toBe(201);
    expect(await countRows('archives')).toBe(1);
  });
});

describe('edition year of the data on screen', () => {
  const eventYear = async () => (await (await adminFetch('/api/admin/event-year')).json()).year;

  // NDI 2026: Thursday 3 December. On or before NDI day: that edition; after: the next one.
  it.each([
    ['registered in November 2026', '2026-11-20 15:52:39', 2026],
    ['registered on NDI day itself', '2026-12-03 18:00:00', 2026],
    ['registered after NDI day', '2026-12-05 10:00:00', 2027]
  ])('is the edition the registrations are for: %s', async (_label, createdAt, year) => {
    const team = await seedTeam({ members: 1 });
    await env.DB.prepare('UPDATE members SET created_at = ? WHERE team_id = ?').bind(createdAt, team.id).run();
    expect(await eventYear()).toBe(year);
  });

  it('the most recent registration wins, and the Organisation members do not count', async () => {
    const org = await seedTeam({ name: 'Organisation', password: 'orga', members: 1 });
    await env.DB.prepare("UPDATE members SET created_at = '2030-01-01 10:00:00' WHERE team_id = ?").bind(org.id).run();
    const old = await seedTeam({ members: 1 });
    await env.DB.prepare("UPDATE members SET created_at = '2025-10-01 10:00:00' WHERE team_id = ?").bind(old.id).run();
    const recent = await seedTeam({ members: 1 });
    await env.DB.prepare("UPDATE members SET created_at = '2026-11-02 10:00:00' WHERE team_id = ?").bind(recent.id).run();

    expect(await eventYear()).toBe(2026);
  });

  it('the event_year setting still wins', async () => {
    const team = await seedTeam({ members: 1 });
    await env.DB.prepare("UPDATE members SET created_at = '2026-11-20 10:00:00' WHERE team_id = ?").bind(team.id).run();
    await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('event_year', '2031')").run();
    expect(await eventYear()).toBe(2031);
  });
});
