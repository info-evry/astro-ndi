/**
 * The pizza catalogue is saved as a whole list. A page that was opened before
 * someone else changed the list must not overwrite their change: every save
 * says which list it was based on (`pizzas_expected`), and the server refuses
 * a save based on a list that is no longer the stored one.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { setupSchema, clearAllTables, adminFetch } from './helpers.js';

beforeAll(setupSchema);
beforeEach(clearAllTables);

const NONE = { id: '0-rien', name: 'Aucune', description: '' };
const REINE = { id: 'reine', name: 'Reine', description: 'Tomate, jambon' };
const CHEVRE = { id: 'chevre', name: 'Chèvre', description: 'Miel' };

const put = (body) => adminFetch('/api/admin/settings', { method: 'PUT', body });
const stored = async () => {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'pizzas'").first();
  return row ? JSON.parse(row.value) : null;
};

describe('PUT /api/admin/settings { pizzas }', () => {
  it('saves when based on the stored list (an empty one counts as [])', async () => {
    expect((await put({ pizzas: [NONE], pizzas_expected: [] })).status).toBe(200);
    expect((await put({ pizzas: [NONE, REINE], pizzas_expected: [NONE] })).status).toBe(200);
    expect(await stored()).toEqual([NONE, REINE]);
  });

  it('refuses a save based on an outdated list, says what is stored, and keeps the other change', async () => {
    await put({ pizzas: [NONE], pizzas_expected: [] });
    // tab A adds Reine
    expect((await put({ pizzas: [NONE, REINE], pizzas_expected: [NONE] })).status).toBe(200);

    // tab B, opened before, adds Chèvre to the list it still shows
    const response = await put({ pizzas: [NONE, CHEVRE], pizzas_expected: [NONE] });

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe('stale_pizzas');
    expect(body.pizzas).toEqual([NONE, REINE]);
    expect(await stored()).toEqual([NONE, REINE]);
  });

  it('a stale list also blocks the other keys of the same save (all or nothing)', async () => {
    await put({ pizzas: [NONE, REINE], pizzas_expected: [] });

    const response = await put({ pizzas: [NONE], pizzas_expected: [NONE, CHEVRE], max_team_size: 3 });

    expect(response.status).toBe(409);
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'max_team_size'").first();
    expect(row).toBeNull();
  });

  it('requires the list the change is based on', async () => {
    const response = await put({ pizzas: [NONE] });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('pizzas_expected_required');
    expect(await stored()).toBeNull();
  });

  it('rejects a malformed expected list', async () => {
    for (const pizzas_expected of ['x', 3, { a: 1 }, null]) {
      const response = await put({ pizzas: [NONE], pizzas_expected });
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe('pizzas_expected_required');
    }
  });

  it('caps pizza names and descriptions like the admin form does', async () => {
    const long = { id: 'long', name: 'n'.repeat(101), description: '' };
    const nameResponse = await put({ pizzas: [NONE, long], pizzas_expected: [] });
    expect(nameResponse.status).toBe(400);
    expect((await nameResponse.json()).error).toContain('100 caractères');
    const longDesc = { id: 'desc', name: 'Ok', description: 'd'.repeat(257) };
    const descResponse = await put({ pizzas: [NONE, longDesc], pizzas_expected: [] });
    expect(descResponse.status).toBe(400);
    expect((await descResponse.json()).error).toContain('256 caractères');
    expect(await stored()).toBeNull();
    // exactly at the caps is fine
    const atCaps = { id: 'caps', name: 'n'.repeat(100), description: 'd'.repeat(256) };
    expect((await put({ pizzas: [NONE, atCaps], pizzas_expected: [] })).status).toBe(200);
  });

  it('a save without pizzas needs no expected list', async () => {
    expect((await put({ max_team_size: 9 })).status).toBe(200);
  });
});
