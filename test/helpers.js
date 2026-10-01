/**
 * Shared helpers for the worker-pool test files.
 *
 * Storage is shared between the tests of one file, so fixtures built with
 * these helpers use unique names and each file cleans up in beforeEach.
 */
import { env, SELF } from 'cloudflare:test';
import { hashPassword } from '../src/shared/crypto.js';

export const ADMIN_TOKEN = 'test-admin-token';
export const ADMIN_HEADERS = { Authorization: `Bearer ${ADMIN_TOKEN}` };
export const JSON_HEADERS = { 'Content-Type': 'application/json' };
export const BASE = 'http://localhost';

/** Full production-like schema (base tables + every migration). */
export async function setupSchema() {
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS teams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, description TEXT DEFAULT '', password_hash TEXT DEFAULT '', room TEXT DEFAULT NULL, created_at TEXT DEFAULT (datetime('now')))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY AUTOINCREMENT, team_id INTEGER NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL, bac_level INTEGER DEFAULT 0, is_leader INTEGER DEFAULT 0, food_diet TEXT DEFAULT '', checked_in INTEGER DEFAULT 0, checked_in_at TEXT DEFAULT NULL, pizza_received INTEGER DEFAULT 0, pizza_received_at TEXT DEFAULT NULL, payment_status TEXT DEFAULT 'unpaid', payment_method TEXT DEFAULT NULL, checkout_id TEXT DEFAULT NULL, transaction_id TEXT DEFAULT NULL, registration_tier TEXT DEFAULT NULL, payment_amount INTEGER DEFAULT NULL, payment_tier TEXT DEFAULT NULL, payment_confirmed_at TEXT DEFAULT NULL, created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE, UNIQUE(first_name, last_name))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, description TEXT DEFAULT '', updated_at TEXT DEFAULT (datetime('now')))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS payment_events (id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER NOT NULL, checkout_id TEXT, event_type TEXT NOT NULL, amount INTEGER NOT NULL, tier TEXT NOT NULL, metadata TEXT, created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE)`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS archives (id INTEGER PRIMARY KEY AUTOINCREMENT, event_year INTEGER NOT NULL UNIQUE, archived_at TEXT NOT NULL DEFAULT (datetime('now')), expiration_date TEXT NOT NULL, is_expired INTEGER DEFAULT 0, teams_json TEXT NOT NULL, members_json TEXT NOT NULL, payment_events_json TEXT, stats_json TEXT NOT NULL, total_teams INTEGER NOT NULL, total_participants INTEGER NOT NULL, total_revenue INTEGER DEFAULT 0, data_hash TEXT NOT NULL)`);
}

/** Remove all rows from every table (children first). */
export async function clearAllTables() {
  for (const table of ['payment_events', 'members', 'teams', 'settings', 'archives']) {
    await env.DB.exec(`DELETE FROM ${table}`);
  }
}

let counter = 0;

/** Unique, order-independent identifier for fixtures (names are UNIQUE in the schema). */
export function uniq(prefix = 'x') {
  counter += 1;
  const random = crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
  return `${prefix}${counter}${random}`;
}

function serializeBody(body) {
  if (body === undefined || typeof body === 'string') return body;
  return JSON.stringify(body);
}

/** Fetch an admin endpoint with the test admin token. */
export function adminFetch(path, { method = 'GET', body, headers = {} } = {}) {
  return SELF.fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...ADMIN_HEADERS,
      // the admin client always sends JSON; Astro's origin check rejects
      // body-less non-GET requests that lack a JSON content type
      ...JSON_HEADERS,
      ...headers
    },
    body: serializeBody(body)
  });
}

/** POST JSON to a public endpoint. */
export function postJson(path, body, headers = {}) {
  return SELF.fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { ...JSON_HEADERS, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}

let ipCounter = 0;

/**
 * POST /api/register from a unique client IP so the per-IP rate limit
 * (5 registrations / 10 min) never interferes with fixture creation.
 */
export function register(body) {
  ipCounter += 1;
  const ip = `198.51.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
  return postJson('/api/register', body, { 'CF-Connecting-IP': ip });
}

/** Build a valid member payload. */
export function memberPayload(overrides = {}) {
  const id = uniq('m');
  return {
    firstName: `First${id}`,
    lastName: `Last${id}`,
    email: `${id}@example.com`,
    bacLevel: 1,
    isLeader: false,
    foodDiet: '',
    ...overrides
  };
}

/**
 * Insert a team (and members) straight into D1.
 * @returns {Promise<{id: number, name: string, password: string, memberIds: number[]}>}
 */
export async function seedTeam({ name = uniq('Team'), password = 'seed-password', passwordHash, members = 1, description = '' } = {}) {
  const hash = passwordHash ?? (password ? await hashPassword(password) : '');
  const result = await env.DB.prepare('INSERT INTO teams (name, description, password_hash) VALUES (?, ?, ?)')
    .bind(name, description, hash).run();
  const id = result.meta.last_row_id;

  const memberIds = [];
  for (let i = 0; i < members; i++) {
    const tag = uniq('s');
    const memberResult = await env.DB.prepare(
      'INSERT INTO members (team_id, first_name, last_name, email, bac_level, is_leader, food_diet) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, `Seed${tag}`, `Member${tag}`, `${tag}@example.com`, 2, i === 0 ? 1 : 0, '').run();
    memberIds.push(memberResult.meta.last_row_id);
  }
  return { id, name, password, memberIds };
}

export async function countRows(table, where = '', ...binds) {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS c FROM ${table} ${where}`).bind(...binds).first();
  return row.c;
}

/** Insert many members into one team in a single D1 batch; returns their ids. */
export async function seedManyMembers(teamId, count) {
  const tag = uniq('bulk');
  const statements = Array.from({ length: count }, (_, i) =>
    env.DB.prepare('INSERT INTO members (team_id, first_name, last_name, email) VALUES (?, ?, ?, ?)')
      .bind(teamId, `${tag}F${i}`, `${tag}L${i}`, `${tag}-${i}@example.com`)
  );
  const results = [];
  // D1 batches stay well below the statement limit at this size
  for (let i = 0; i < statements.length; i += 50) {
    results.push(...await env.DB.batch(statements.slice(i, i + 50)));
  }
  return results.map(r => r.meta.last_row_id);
}
