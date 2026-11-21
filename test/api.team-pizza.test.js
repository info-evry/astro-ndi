/**
 * Changing a pizza after registering: PUT /api/teams/:id/members/:memberId/pizza.
 *
 * The team's code secret (the one that opens the team view) is the only
 * credential; the organisers can close the changes from the settings.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import {
  setupSchema, clearAllTables, seedTeam, adminFetch, postJson, putJson, uniq
} from './helpers.js';

beforeAll(setupSchema);
beforeEach(clearAllTables);

let ipCounter = 0;
/** Each call comes from its own IP: the endpoint is rate limited per client. */
const changePizza = (teamId, memberId, body) => {
  ipCounter += 1;
  return putJson(`/api/teams/${teamId}/members/${memberId}/pizza`, body, {
    'CF-Connecting-IP': `203.0.113.${(ipCounter % 250) + 1}`
  });
};

const foodOf = async (memberId) =>
  (await env.DB.prepare('SELECT food_diet FROM members WHERE id = ?').bind(memberId).first()).food_diet;

async function setPizzas(pizzas) {
  const response = await adminFetch('/api/admin/settings', { method: 'PUT', body: { pizzas } });
  expect(response.status).toBe(200);
}

describe('PUT /api/teams/:id/members/:memberId/pizza', () => {
  it('changes the pizza of a member with the team code secret', async () => {
    const team = await seedTeam({ password: 'team-secret', members: 2 });

    const response = await changePizza(team.id, team.memberIds[1], { password: 'team-secret', foodDiet: 'reine' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, member: { id: team.memberIds[1], foodDiet: 'reine' } });
    expect(await foodOf(team.memberIds[1])).toBe('reine');
    expect(await foodOf(team.memberIds[0])).toBe('');
  });

  it('sees the catalogue the organisers edited, not the defaults', async () => {
    await setPizzas([
      { id: '0-rien', name: 'Aucune', description: '' },
      { id: '4_fromages', name: '4 Fromages', description: '' }
    ]);
    const team = await seedTeam({ password: 'team-secret' });

    expect((await changePizza(team.id, team.memberIds[0], { password: 'team-secret', foodDiet: '4_fromages' })).status).toBe(200);
    expect((await changePizza(team.id, team.memberIds[0], { password: 'team-secret', foodDiet: 'reine' })).status).toBe(400);
    expect(await foodOf(team.memberIds[0])).toBe('4_fromages');
  });

  it('accepts "no pizza" as a choice', async () => {
    const team = await seedTeam({ password: 'team-secret' });
    await changePizza(team.id, team.memberIds[0], { password: 'team-secret', foodDiet: 'reine' });

    const response = await changePizza(team.id, team.memberIds[0], { password: 'team-secret', foodDiet: '0-rien' });

    expect(response.status).toBe(200);
    expect(await foodOf(team.memberIds[0])).toBe('0-rien');
  });

  it('works for the Organisation team too', async () => {
    const org = await seedTeam({ name: 'Organisation', password: 'orga-secret' });

    expect((await changePizza(org.id, org.memberIds[0], { password: 'orga-secret', foodDiet: 'reine' })).status).toBe(200);
  });

  it('requires the code secret', async () => {
    const team = await seedTeam({ password: 'team-secret' });

    for (const password of [undefined, '', '   ']) {
      const response = await changePizza(team.id, team.memberIds[0], { password, foodDiet: 'reine' });
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe('password_required');
    }
    expect(await foodOf(team.memberIds[0])).toBe('');
  });

  it('answers 403 for a wrong code secret and changes nothing', async () => {
    const team = await seedTeam({ password: 'team-secret' });
    const other = await seedTeam({ password: 'other-secret' });

    for (const password of ['wrong', other.password]) {
      const response = await changePizza(team.id, team.memberIds[0], { password, foodDiet: 'reine' });
      expect(response.status).toBe(403);
    }
    expect(await foodOf(team.memberIds[0])).toBe('');
  });

  it('says so when the team has no code secret yet', async () => {
    const team = await seedTeam({ password: '' });

    const response = await changePizza(team.id, team.memberIds[0], { password: 'anything', foodDiet: 'reine' });

    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('password_not_set');
  });

  it("does not touch a member of another team, even with a valid code secret", async () => {
    const team = await seedTeam({ password: 'team-secret' });
    const other = await seedTeam({ password: 'other-secret' });

    const response = await changePizza(team.id, other.memberIds[0], { password: 'team-secret', foodDiet: 'reine' });

    expect(response.status).toBe(404);
    expect(await foodOf(other.memberIds[0])).toBe('');
  });

  it('answers 404 for an unknown team or member and 400 for malformed ids', async () => {
    const team = await seedTeam({ password: 'team-secret' });

    expect((await changePizza(987_654, team.memberIds[0], { password: 'team-secret', foodDiet: 'reine' })).status).toBe(404);
    expect((await changePizza(team.id, 987_654, { password: 'team-secret', foodDiet: 'reine' })).status).toBe(404);
    expect((await changePizza('abc', team.memberIds[0], { password: 'team-secret', foodDiet: 'reine' })).status).toBe(400);
    expect((await changePizza(team.id, 'abc', { password: 'team-secret', foodDiet: 'reine' })).status).toBe(400);
  });

  it('rejects a pizza that is not in the catalogue, or not a string', async () => {
    const team = await seedTeam({ password: 'team-secret' });

    for (const foodDiet of ['does-not-exist', 42, null, undefined, ['reine'], { id: 'reine' }]) {
      const response = await changePizza(team.id, team.memberIds[0], { password: 'team-secret', foodDiet });
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe('Le choix de pizza est invalide');
    }
    expect(await foodOf(team.memberIds[0])).toBe('');
  });

  it('refuses once the pizza has been handed out', async () => {
    const team = await seedTeam({ password: 'team-secret', members: 2 });
    await env.DB.prepare('UPDATE members SET food_diet = ?, pizza_received = 1 WHERE id = ?').bind('reine', team.memberIds[0]).run();

    const refused = await changePizza(team.id, team.memberIds[0], { password: 'team-secret', foodDiet: '0-rien' });
    expect(refused.status).toBe(409);
    expect((await refused.json()).code).toBe('pizza_already_given');
    expect(await foodOf(team.memberIds[0])).toBe('reine');

    // the others of the team are not affected
    expect((await changePizza(team.id, team.memberIds[1], { password: 'team-secret', foodDiet: 'reine' })).status).toBe(200);
  });

  it('refuses while the organisers have closed the changes, and again once they reopen them', async () => {
    const team = await seedTeam({ password: 'team-secret' });

    expect((await adminFetch('/api/admin/settings', { method: 'PUT', body: { pizza_changes_open: false } })).status).toBe(200);
    const closed = await changePizza(team.id, team.memberIds[0], { password: 'team-secret', foodDiet: 'reine' });
    expect(closed.status).toBe(403);
    expect((await closed.json()).code).toBe('pizza_changes_closed');
    expect(await foodOf(team.memberIds[0])).toBe('');

    expect((await adminFetch('/api/admin/settings', { method: 'PUT', body: { pizza_changes_open: true } })).status).toBe(200);
    expect((await changePizza(team.id, team.memberIds[0], { password: 'team-secret', foodDiet: 'reine' })).status).toBe(200);
  });

  it('is rate limited per client like the team view', async () => {
    const team = await seedTeam({ password: 'team-secret' });
    const ip = { 'CF-Connecting-IP': '198.51.100.77' };
    const attempt = () => putJson(`/api/teams/${team.id}/members/${team.memberIds[0]}/pizza`, { password: 'bad', foodDiet: 'reine' }, ip);

    const statuses = [];
    for (let i = 0; i < 25; i++) statuses.push((await attempt()).status);

    expect(statuses).toContain(429);
  });
});

describe('what the public endpoints tell the page', () => {
  it('GET /api/config says whether pizza changes are open (open by default)', async () => {
    const read = async () => (await (await SELF.fetch('http://localhost/api/config')).json()).config.pizzaChangesOpen;

    expect(await read()).toBe(true);
    await adminFetch('/api/admin/settings', { method: 'PUT', body: { pizza_changes_open: false } });
    expect(await read()).toBe(false);
  });

  it('the team view carries the pizza state of each member', async () => {
    const team = await seedTeam({ password: 'team-secret', members: 2 });
    await env.DB.prepare('UPDATE members SET food_diet = ?, pizza_received = 1 WHERE id = ?').bind('reine', team.memberIds[0]).run();

    const data = await (await postJson(`/api/teams/${team.id}/view`, { password: 'team-secret' })).json();

    const byId = Object.fromEntries(data.team.members.map(m => [m.id, m]));
    expect(byId[team.memberIds[0]]).toMatchObject({ foodDiet: 'reine', pizzaReceived: true });
    expect(byId[team.memberIds[1]]).toMatchObject({ foodDiet: '', pizzaReceived: false });
    expect(data.team.pizzaChangesOpen).toBe(true);
  });

  it('the team view and the registration say when a team has no code secret', async () => {
    const team = await seedTeam({ name: `Sans-code-${uniq('')}`, password: '' });

    const view = await postJson(`/api/teams/${team.id}/view`, { password: 'x' });
    expect(view.status).toBe(403);
    expect((await view.json()).code).toBe('password_not_set');

    const join = await postJson('/api/register', {
      createNewTeam: false, teamId: team.id, teamPassword: 'x',
      members: [{ firstName: 'A', lastName: uniq('B'), email: `${uniq('e')}@example.com`, bacLevel: 1, foodDiet: '' }]
    }, { 'CF-Connecting-IP': '198.51.100.78' });
    expect(join.status).toBe(403);
    expect((await join.json()).code).toBe('password_not_set');
  });
});
