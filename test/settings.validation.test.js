/**
 * Admin settings: key whitelist, per-key validation bounds and the pizza /
 * BAC level list validation.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { setupSchema, clearAllTables, adminFetch, countRows, BASE, JSON_HEADERS } from './helpers.js';

beforeAll(setupSchema);
beforeEach(clearAllTables);

const put = (body) => adminFetch('/api/admin/settings', { method: 'PUT', body });
const stored = async (key) => (await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first())?.value ?? null;

describe('PUT /api/admin/settings - authorization and body', () => {
  it('requires a valid admin token and writes nothing without one', async () => {
    const response = await SELF.fetch(`${BASE}/api/admin/settings`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ max_team_size: 5 })
    });
    expect(response.status).toBe(401);
    expect(await countRows('settings')).toBe(0);
  });

  it.each(['{not json', 'null', '[]', '12', '"text"'])('answers 400 for the body %s', async (body) => {
    const response = await put(body);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Corps de requête invalide', code: 'invalid_body' });
  });

  it('accepts an empty object as a no-op', async () => {
    const response = await put({});
    expect(await response.json()).toEqual({ success: true, updated: [] });
    expect(await countRows('settings')).toBe(0);
  });
});

describe('PUT /api/admin/settings - key whitelist', () => {
  it('rejects unknown keys and names them', async () => {
    const response = await put({ max_team_size: 5, evil_key: 1, another: 2 });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Clés inconnues : evil_key, another');
  });

  it('applies nothing when one key of the batch is invalid', async () => {
    await put({ max_team_size: 7 });

    const response = await put({ max_team_size: 9, min_team_size: 0 });
    expect(response.status).toBe(400);
    expect(await stored('max_team_size')).toBe('7');
    expect(await stored('min_team_size')).toBeNull();
  });

  it.each(['admin_token', 'ADMIN_TOKEN', 'event_year', 'constructor', 'toString', ''])('does not allow writing the key "%s"', async (key) => {
    const response = await put({ [key]: 'x' });
    expect(response.status).toBe(400);
    expect(await countRows('settings')).toBe(0);
  });

  it('rejects a __proto__ key sent as raw JSON', async () => {
    const response = await put('{"__proto__": {"max_team_size": 5}}');
    expect(response.status).toBe(400);
    expect(await countRows('settings')).toBe(0);
  });

  it('never exposes the admin token through GET /api/admin/settings', async () => {
    await env.CONFIG.put('admin_token', 'kv-secret-token');
    try {
      await put({ max_team_size: 5 });
      const text = await (await adminFetch('/api/admin/settings', { headers: { Authorization: 'Bearer kv-secret-token' } })).text();
      expect(text).not.toContain('kv-secret-token');
    } finally {
      await env.CONFIG.delete('admin_token');
    }
  });
});

describe('PUT /api/admin/settings - numeric bounds', () => {
  const bounds = [
    ['max_team_size', 1, 100],
    ['max_total_participants', 1, 10_000],
    ['min_team_size', 1, 50],
    ['price_asso_member', 0, 100_000],
    ['price_non_member', 0, 100_000],
    ['price_late', 0, 100_000],
    ['price_tier1', 0, 100_000],
    ['price_tier2', 0, 100_000],
    ['tier1_cutoff_days', 1, 365],
    ['gdpr_retention_years', 1, 10]
  ];

  it.each(bounds)('%s accepts %i and %i and stores them as strings', async (key, min, max) => {
    expect((await put({ [key]: min })).status).toBe(200);
    expect(await stored(key)).toBe(String(min));

    expect((await put({ [key]: max })).status).toBe(200);
    expect(await stored(key)).toBe(String(max));

    expect((await put({ [key]: String(min + 1) })).status).toBe(200);
    expect(await stored(key)).toBe(String(min + 1));
  });

  it.each(bounds)('%s rejects values outside [%i, %i] and keeps the old value', async (key, min, max) => {
    await put({ [key]: min });

    for (const bad of [min - 1, max + 1, 1e12, -1e12]) {
      const response = await put({ [key]: bad });
      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain(`Valeur invalide pour ${key}`);
    }
    expect(await stored(key)).toBe(String(min));
  });

  it.each([
    ['not a number', 'abc'],
    ['trailing garbage', '10abc'],
    ['decimal number', 1.5],
    ['decimal string', '2.5'],
    ['boolean', true],
    ['null', null],
    ['array', [5]],
    ['object', { value: 5 }],
    ['empty string', ''],
    ['exponent notation', '1e1'],
    ['NaN-like', 'NaN']
  ])('rejects %s for max_team_size', async (_label, value) => {
    const response = await put({ max_team_size: value });
    expect(response.status).toBe(400);
    expect(await stored('max_team_size')).toBeNull();
  });

  it('normalizes a padded numeric string before storing it', async () => {
    expect((await put({ max_team_size: ' 12 ' })).status).toBe(200);
    expect(await stored('max_team_size')).toBe('12');
  });
});

describe('PUT /api/admin/settings - scalar settings', () => {
  it.each([
    [true, 'true'],
    [false, 'false'],
    ['true', 'true'],
    ['false', 'false']
  ])('payment_enabled accepts %j', async (value, expected) => {
    expect((await put({ payment_enabled: value })).status).toBe(200);
    expect(await stored('payment_enabled')).toBe(expected);
  });

  it.each(['yes', 'TRUE', 1, 0, null, 'on', {}])('payment_enabled rejects %j', async (value) => {
    expect((await put({ payment_enabled: value })).status).toBe(400);
    expect(await stored('payment_enabled')).toBeNull();
  });

  it.each(['', '2031-06-15T20:00:00.000Z', '2031-06-15'])('registration_deadline accepts %j', async (value) => {
    expect((await put({ registration_deadline: value })).status).toBe(200);
    expect(await stored('registration_deadline')).toBe(value);
  });

  it.each(['not a date', 12_345, null, true, []])('registration_deadline rejects %j', async (value) => {
    expect((await put({ registration_deadline: value })).status).toBe(400);
  });

  it.each(['00:00', '09:30', '19:00', '23:59'])('late_cutoff_time accepts %s', async (value) => {
    expect((await put({ late_cutoff_time: value })).status).toBe(200);
    expect(await stored('late_cutoff_time')).toBe(value);
  });

  it.each(['9:00', '24:00', '25:00', '12:60', '99:99', '19:00:00', '19h00', '', 1900, null])('late_cutoff_time rejects %j', async (value) => {
    expect((await put({ late_cutoff_time: value })).status).toBe(400);
    expect(await stored('late_cutoff_time')).toBeNull();
  });

  it('school_name accepts up to 256 characters, including markup (stored as text)', async () => {
    expect((await put({ school_name: 'S'.repeat(256) })).status).toBe(200);
    expect((await put({ school_name: '<script>alert(1)</script> "École"' })).status).toBe(200);
    expect(await stored('school_name')).toBe('<script>alert(1)</script> "École"');
  });

  it.each([['too long', 'S'.repeat(257)], ['number', 5], ['null', null], ['object', {}]])('school_name rejects %s', async (_label, value) => {
    expect((await put({ school_name: value })).status).toBe(400);
  });
});

describe('PUT /api/admin/settings - pizza list', () => {
  const pizza = (overrides = {}) => ({ id: 'reine', name: 'Reine', description: 'Tomate, jambon', ...overrides });

  it('stores a valid list as JSON and GET returns it parsed', async () => {
    const list = [pizza(), pizza({ id: 'none', name: 'Aucune', description: undefined })];
    expect((await put({ pizzas: list })).status).toBe(200);

    expect(JSON.parse(await stored('pizzas'))).toEqual(JSON.parse(JSON.stringify(list)));
    const { settings } = await (await adminFetch('/api/admin/settings')).json();
    expect(settings.pizzas).toEqual(JSON.parse(JSON.stringify(list)));
  });

  it('accepts an empty list', async () => {
    expect((await put({ pizzas: [] })).status).toBe(200);
    expect(await stored('pizzas')).toBe('[]');
  });

  it.each([
    ['a string', '[{"id":"a","name":"A"}]'],
    ['an object', { id: 'a', name: 'A' }],
    ['null', null],
    ['a number', 3]
  ])('rejects %s instead of an array', async (_label, value) => {
    const response = await put({ pizzas: value });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('Doit être un tableau');
  });

  it.each([
    ['null entry', [null]],
    ['string entry', ['reine']],
    ['number entry', [5]],
    ['nested array entry', [[]]],
    ['missing id', [{ name: 'A' }]],
    ['empty id', [{ id: '', name: 'A' }]],
    ['numeric id', [{ id: 5, name: 'A' }]],
    ['missing name', [{ id: 'a' }]],
    ['empty name', [{ id: 'a', name: '' }]],
    ['numeric name', [{ id: 'a', name: 7 }]],
    ['numeric description', [{ id: 'a', name: 'A', description: 7 }]],
    ['second entry invalid', [pizza(), { id: 'b' }]]
  ])('rejects a list with a %s with a 400 (never a 500)', async (_label, list) => {
    const response = await put({ pizzas: list });
    expect(response.status).toBe(400);
    expect(await stored('pizzas')).toBeNull();
  });

  it('names the index of the first bad entry', async () => {
    const response = await put({ pizzas: [pizza(), pizza({ id: 'x' }), { id: 'bad' }] });
    expect((await response.json()).error).toContain('index 2');
  });

  it('keeps hostile text as text', async () => {
    const hostile = pizza({ id: 'x', name: '"><img src=x onerror=alert(1)>', description: "'; DROP TABLE settings; --" });
    expect((await put({ pizzas: [hostile] })).status).toBe(200);
    expect(JSON.parse(await stored('pizzas'))).toEqual([hostile]);
    expect(await countRows('settings')).toBe(1);
  });

  it('feeds the public config endpoint', async () => {
    await put({ pizzas: [pizza({ id: 'only-one', name: 'Only One' })] });
    const { config } = await (await SELF.fetch(`${BASE}/api/config`)).json();
    expect(config.pizzas.map(p => p.id)).toEqual(['only-one']);
  });
});

describe('PUT /api/admin/settings - BAC levels', () => {
  it('stores a valid list', async () => {
    const levels = [{ value: 0, label: 'Non bachelier' }, { value: 3, label: 'BAC+3' }];
    expect((await put({ bac_levels: levels })).status).toBe(200);
    expect(JSON.parse(await stored('bac_levels'))).toEqual(levels);
  });

  it.each([
    ['not an array', { value: 1, label: 'x' }],
    ['null entry', [null]],
    ['string entry', ['BAC+1']],
    ['string value', [{ value: '1', label: 'x' }]],
    ['missing value', [{ label: 'x' }]],
    ['missing label', [{ value: 1 }]],
    ['empty label', [{ value: 1, label: '' }]],
    ['numeric label', [{ value: 1, label: 4 }]]
  ])('rejects %s with a 400', async (_label, value) => {
    const response = await put({ bac_levels: value });
    expect(response.status).toBe(400);
    expect(await stored('bac_levels')).toBeNull();
  });
});

describe('GET /api/admin/settings', () => {
  it('requires authorization', async () => {
    expect((await SELF.fetch(`${BASE}/api/admin/settings`)).status).toBe(401);
  });

  it('returns every stored value as a string, plus the raw rows', async () => {
    await put({ max_team_size: 8, payment_enabled: true, school_name: 'Test School' });

    const data = await (await adminFetch('/api/admin/settings')).json();
    expect(data.settings).toMatchObject({ max_team_size: '8', payment_enabled: 'true', school_name: 'Test School' });
    expect(data.raw.map(r => r.key)).toEqual(['max_team_size', 'payment_enabled', 'school_name']);
  });

  it('returns invalid stored JSON for list settings as the raw string instead of failing', async () => {
    await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('pizzas', '{broken')").run();

    const response = await adminFetch('/api/admin/settings');
    expect(response.status).toBe(200);
    expect((await response.json()).settings.pizzas).toBe('{broken');
  });
});
