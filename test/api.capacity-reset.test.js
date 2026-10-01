/**
 * The Organisation team is neither counted against the capacity nor deleted by
 * a data reset: one figure (participants excluding the Organisation team) is
 * used by the registration capacity check, the public spots and the admin stats.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import {
  setupSchema, clearAllTables, seedTeam, adminFetch, register, memberPayload, countRows, uniq, BASE
} from './helpers.js';

beforeAll(setupSchema);
beforeEach(clearAllTables);

const json = (response) => response.json();
const setMaxTotal = (value) => adminFetch('/api/admin/settings', { method: 'PUT', body: { max_total_participants: value } });
const publicStats = async () => (await json(await SELF.fetch(`${BASE}/api/stats`))).stats;

const newTeamBody = (members = 1) => ({
  createNewTeam: true,
  teamName: uniq('Team'),
  teamPassword: 'capacity-pw',
  members: Array.from({ length: members }, (_, i) => memberPayload({ isLeader: i === 0 }))
});

describe('capacity ignores the Organisation team', () => {
  it('lets the last spots be taken even when the organisers fill the database', async () => {
    await seedTeam({ name: 'Organisation', password: '', members: 6 });
    await seedTeam({ members: 1 });
    await setMaxTotal(3);

    expect((await publicStats()).available_spots).toBe(2);

    expect((await register(newTeamBody(2))).status).toBe(200);
    const stats = await publicStats();
    expect(stats).toMatchObject({ total_participants: 3, max_participants: 3, available_spots: 0 });

    const full = await register(newTeamBody(1));
    expect(full.status).toBe(400);
    expect((await json(full)).code).toBe('capacity_exceeded');
  });

  it('the spots shown publicly, the admin statistics and the capacity check agree', async () => {
    await seedTeam({ name: 'Organisation', password: '', members: 4 });
    await seedTeam({ members: 2 });
    await setMaxTotal(10);

    const admin = (await json(await adminFetch('/api/admin/stats'))).stats;
    const publicView = await publicStats();
    expect(admin.total_participants).toBe(2);
    expect(admin.available_spots).toBe(publicView.available_spots);
    expect(publicView.available_spots).toBe(8);

    // exactly the displayed number of spots can still be registered, one more cannot
    expect((await register(newTeamBody(9))).status).toBe(400);
    expect((await register(newTeamBody(8))).status).toBe(200);
    expect((await publicStats()).available_spots).toBe(0);
  });

  it('joining the Organisation team is not limited by the capacity', async () => {
    const org = await seedTeam({ name: 'Organisation', password: 'org-password', members: 1 });
    await seedTeam({ members: 2 });
    await setMaxTotal(2);

    const join = await register({ createNewTeam: false, teamId: org.id, teamPassword: 'org-password', members: [memberPayload()] });
    expect(join.status).toBe(200);
    expect((await publicStats()).available_spots).toBe(0);
  });
});

describe('POST /api/admin/reset keeps the Organisation team', () => {
  const reset = (body) => adminFetch('/api/admin/reset', { method: 'POST', body });

  async function seedEvent() {
    const org = await seedTeam({ name: 'Organisation', password: '', members: 2 });
    const teams = [await seedTeam({ members: 2 }), await seedTeam({ members: 1 })];
    await env.DB.prepare('INSERT INTO payment_events (member_id, event_type, amount, tier) VALUES (?, ?, ?, ?)')
      .bind(teams[0].memberIds[0], 'payment_delayed', 0, 'tier1').run();
    return { org, teams };
  }

  it('deletes every member, payment event and other team, but not the Organisation team itself', async () => {
    const { org } = await seedEvent();

    const response = await reset({ confirmation: 'SUPPRIMER', force: true });
    expect(response.status).toBe(200);
    expect((await json(response)).deleted).toEqual({ teams: 2, members: 5, payments: 1 });

    expect(await countRows('teams')).toBe(1);
    expect(await countRows('teams', 'WHERE id = ? AND name = ?', org.id, 'Organisation')).toBe(1);
    expect(await countRows('members')).toBe(0);
    expect(await countRows('payment_events')).toBe(0);
  });

  it('never touches the pizza catalogue nor the other settings', async () => {
    await seedEvent();
    const pizzas = [
      { id: '0-rien', name: 'Aucune', description: '' },
      { id: 'reine', name: 'Reine', description: 'Tomate, jambon' }
    ];
    expect((await adminFetch('/api/admin/settings', { method: 'PUT', body: { pizzas, max_team_size: 9, school_name: 'Test School' } })).status).toBe(200);
    const snapshot = async () => (await env.DB.prepare('SELECT key, value FROM settings ORDER BY key').all()).results;
    const before = await snapshot();

    expect((await reset({ confirmation: 'SUPPRIMER', force: true, createArchiveFirst: true })).status).toBe(200);

    expect(await snapshot()).toEqual(before);
    const { config } = await json(await SELF.fetch(`${BASE}/api/config`));
    expect(config.pizzas).toEqual(pizzas);
  });

  it('the Organisation team is not event data: the safety check ignores it', async () => {
    await seedTeam({ name: 'Organisation', password: '', members: 0 });

    const check = await json(await adminFetch('/api/admin/reset/check'));
    expect(check.counts.teams).toBe(0);
    expect(check.has_data).toBe(false);
    expect(check.safe).toBe(true);

    // nothing but the Organisation team: there is nothing to archive
    const archive = await adminFetch('/api/admin/archives', { method: 'POST', body: { year: 2030 } });
    expect(archive.status).toBe(400);
    expect((await json(archive)).code).toBe('no_data');
  });

  it('after a reset the database counts as empty and a second reset deletes nothing', async () => {
    await seedEvent();
    await reset({ confirmation: 'SUPPRIMER', force: true });

    const check = await json(await adminFetch('/api/admin/reset/check'));
    expect(check).toMatchObject({ has_data: false, counts: { teams: 0, members: 0, payments: 0 } });

    const again = await json(await reset({ confirmation: 'SUPPRIMER', force: true }));
    expect(again.deleted).toEqual({ teams: 0, members: 0, payments: 0 });
    expect(await countRows('teams', 'WHERE name = ?', 'Organisation')).toBe(1);
  });

  it('archives the data first when asked, and still keeps the Organisation team', async () => {
    await seedEvent();

    const response = await reset({ confirmation: 'SUPPRIMER', force: true, createArchiveFirst: true });
    expect((await json(response)).archiveCreated).toBe(true);
    expect(await countRows('archives')).toBe(1);
    expect(await countRows('teams', 'WHERE name = ?', 'Organisation')).toBe(1);
  });

  it('requires the confirmation word, and a body that is a JSON object when there is one', async () => {
    await seedEvent();

    const noBody = await adminFetch('/api/admin/reset', { method: 'POST' });
    expect(noBody.status).toBe(400);
    expect((await json(noBody)).code).toBe('confirmation_required');
    expect((await reset({ confirmation: 'oui' })).status).toBe(400);

    for (const body of ['null', '[]', '{nope']) {
      const response = await reset(body);
      expect(response.status).toBe(400);
      expect((await json(response)).code).toBe('invalid_body');
    }
    expect(await countRows('members')).toBe(5);
  });
});
