/**
 * Regression guard: no route may answer 5xx to hostile input.
 *
 * Every route registered in src/routes.js is hit, with and without the admin
 * token, with a matrix of hostile path params and request bodies (empty,
 * `null`, arrays, scalars, truncated JSON, a 5 MB body, prototype pollution
 * keys, unicode, huge ids, 5000-element arrays, ...). The assertions:
 *
 * - the status is never >= 500;
 * - every error (status >= 400) is JSON of the shape `{ error: string, code: string }`.
 *
 * Routes that cannot be driven to a 500 by input alone are not listed anywhere:
 * the only 500s of the API are real failures (broken D1, missing SumUp
 * credentials, ...), covered by the "broken database" test below.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { createRouter } from '../src/routes.js';
import {
  setupSchema, clearAllTables, seedTeam, ADMIN_HEADERS, JSON_HEADERS, BASE
} from './helpers.js';

beforeAll(setupSchema);

// ---------------------------------------------------------------------------
// Routes: introspected from the router, never listed by hand
// ---------------------------------------------------------------------------

/** `GET /api/admin/members/:id` style descriptors of every registered route. */
function listRoutes() {
  return createRouter().routes.map(route => ({
    method: route.method,
    path: route.pattern.source
      .slice(1, -1)
      .replaceAll(String.raw`\/`, '/')
      .replaceAll(/\(\?<(\w+)>\[\^\\?\/\]\+\)/g, ':$1')
  }));
}

const ROUTES = listRoutes();

// ---------------------------------------------------------------------------
// Hostile inputs
// ---------------------------------------------------------------------------

const HUGE_BODY = JSON.stringify({ filler: 'x'.repeat(5 * 1024 * 1024) });
const FIVE_THOUSAND_IDS = Array.from({ length: 5000 }, (_, i) => i + 1);

/** Values substituted for every `:param` of a path. */
const HOSTILE_PARAMS = ['abc', '0', '-1', '1.5', '99999999999999999999', '%00', '1e3', '%E2%9C%93', '__proto__', '2025'];

/** Hostile values placed in every body field the API reads. */
const HOSTILE_VALUES = [
  null, [], {}, 'str', '', ' ', 0, -1, 1.5, 1e30, '99999999999999999999', true, false, ['a'], [null], [{}],
  '__proto__', 'constructor', 'é🦄\u0000', 'x'.repeat(20_000), { __proto__: { admin: true } }, [-1, 0, 1.5, 'x']
];

const BODY_FIELDS = [
  'memberId', 'memberIds', 'teamId', 'teamIds', 'assignments', 'room', 'csv', 'name', 'description', 'password',
  'teamName', 'teamDescription', 'teamPassword', 'joinPassword', 'createNewTeam', 'members', 'firstName', 'lastName',
  'email', 'bacLevel', 'isLeader', 'foodDiet', 'paymentTier', 'paymentAmount', 'skipPayment', 'year', 'confirmation',
  'force', 'createArchiveFirst', 'checkoutId', 'checkout_reference', 'id', 'status',
  'max_team_size', 'max_total_participants', 'min_team_size', 'pizzas', 'bac_levels', 'school_name', 'price_asso_member',
  'price_non_member', 'price_late', 'late_cutoff_time', 'price_tier1', 'price_tier2', 'tier1_cutoff_days',
  'payment_enabled', 'registration_deadline', 'gdpr_retention_years'
];

/** Raw (string) request bodies. */
function rawBodies() {
  return [
    undefined,
    '',
    ' ',
    'null',
    '[]',
    '{}',
    '"str"',
    '42',
    'true',
    '{"x":',
    '{"__proto__":{"admin":true},"constructor":{"prototype":{"admin":true}}}',
    '{"memberIds":' + JSON.stringify(FIVE_THOUSAND_IDS) + '}',
    '{"assignments":' + JSON.stringify(FIVE_THOUSAND_IDS.map(teamId => ({ teamId, room: 'A' }))) + '}',
    '{"members":' + JSON.stringify(Array.from({ length: 500 }, () => ({ firstName: 'a' }))) + '}',
    JSON.stringify({ csv: 'a,b\n'.repeat(5000) }),
    JSON.stringify({ csv: 'firstName,lastName,email,teamName\n' + 'A,B,c@d.fr,T\n'.repeat(2500) }),
    JSON.stringify({ firstName: 'é🦄'.repeat(5000), name: '‮'.repeat(3000) }),
    HUGE_BODY
  ];
}

/** Bodies built by putting one hostile value in every known field. */
function fieldBodies() {
  return HOSTILE_VALUES.map(value => JSON.stringify(Object.fromEntries(BODY_FIELDS.map(field => [field, value]))));
}

/** Plausible-but-invalid objects: the shapes closest to a legal request. */
function nearMissBodies(ids) {
  return [
    { memberId: ids.member, teamPassword: 'x'.repeat(500) },
    { memberId: ids.member, paymentTier: 'asso_member', paymentAmount: -5 },
    { paymentTier: 'asso_member', paymentAmount: 1e12 },
    { paymentTier: 'nope', paymentAmount: 500 },
    { paymentTier: 'late' },
    { paymentAmount: 500 },
    { memberIds: [ids.member, ids.member, 'x'] },
    { memberIds: [ids.member, 0] },
    { assignments: [null] },
    { assignments: [{ teamId: ids.team, room: 5 }] },
    { assignments: [{ teamId: '1e3', room: 'A' }] },
    { room: 'x'.repeat(51) },
    { teamId: 999_999, firstName: 'A', lastName: 'B', email: 'a@b.fr' },
    { teamId: ids.team, firstName: 'A', lastName: 'B', email: 'not-an-email' },
    { teamId: ids.team, firstName: 'A', lastName: 'B', email: 'a@b.fr', foodDiet: 'unknown-pizza' },
    { name: 'x', password: 12_345 },
    { name: 'ab', description: { a: 1 } },
    { teamId: 999_999 },
    { year: 1999 },
    { year: 2101 },
    { year: '2025', confirmation: 'SUPPRIMER', force: true, createArchiveFirst: true },
    { csv: 'firstName,lastName,email,teamName\n"unterminated,quote' },
    { csv: 'only-a-header' },
    { csv: '\u0000\u0000;;;\n\n\n' },
    { checkoutId: 'x'.repeat(500) },
    { id: { $ne: 1 }, checkout_reference: ['x'] },
    { max_team_size: '10abc' },
    { price_late: 1e30 },
    { registration_deadline: 'not a date' },
    { late_cutoff_time: '25:61' },
    { pizzas: [{ id: 'x'.repeat(100), name: 'n' }] },
    { bac_levels: [{ value: 'x', label: 1 }] },
    { payment_enabled: 'maybe' },
    { createNewTeam: true, teamName: 'T', teamPassword: 'p', members: [{ firstName: 'a', lastName: 'b', email: 'a@b.fr', isLeader: true, foodDiet: 'zzz' }] },
    { createNewTeam: false, teamId: 'abc', teamPassword: 'p', members: [{}] },
    { password: 'x'.repeat(5000) }
  ].map(body => JSON.stringify(body));
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let requestCounter = 0;

/** A unique client IP per request, so no rate limit ever hides the handler. */
function nextIp() {
  requestCounter += 1;
  return `203.0.${(requestCounter >> 8) & 255}.${requestCounter & 255}`;
}

function send({ method, path, body, authed }) {
  const hasBody = method !== 'GET' && method !== 'HEAD' && body !== undefined;
  return SELF.fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...JSON_HEADERS,
      'CF-Connecting-IP': nextIp(),
      ...(authed ? ADMIN_HEADERS : {})
    },
    body: hasBody ? body : undefined
  });
}

/** Describe the problem with a response, or `null` if it is acceptable. */
async function problemWith(response) {
  if (response.status >= 500) return `status ${response.status}`;
  if (response.status < 400) return null;

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return `status ${response.status} with a non-JSON body: ${text.slice(0, 80)}`;
  }
  if (typeof data?.error !== 'string' || typeof data?.code !== 'string') {
    return `status ${response.status} with a body that is not { error, code }: ${text.slice(0, 120)}`;
  }
  return null;
}

let ids;

beforeEach(async () => {
  await clearAllTables();
  await env.DB.exec(`INSERT OR IGNORE INTO teams (name, description, password_hash) VALUES ('Organisation', 'Organisers', '')`);
  const team = await seedTeam({ members: 2 });
  ids = { team: team.id, member: team.memberIds[0] };
});

describe('router introspection', () => {
  it('finds every registered route with its parameters', () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(45);
    for (const route of ROUTES) {
      expect(route.path).toMatch(/^\/api\/[\w/:-]+$/);
    }
    expect(ROUTES).toContainEqual({ method: 'PUT', path: '/api/admin/members/:id' });
    expect(ROUTES).toContainEqual({ method: 'GET', path: '/api/admin/archives/:year/export' });
    expect(ROUTES).toContainEqual({ method: 'POST', path: '/api/payment/callback' });
  });
});

describe.each(['anonymous', 'admin'])('hostile input as %s', (who) => {
  const authed = who === 'admin';

  it.each(ROUTES.map(route => [`${route.method} ${route.path}`, route]))('%s never answers 5xx', async (_label, route) => {
    const violations = [];
    const check = async (description, request) => {
      const problem = await problemWith(await send({ ...route, authed, ...request }));
      if (problem) violations.push(`${description}: ${problem}`);
    };

    const params = route.path.includes(':')
      ? [...HOSTILE_PARAMS, String(ids.team), String(ids.member)]
      : [undefined];
    const hasBody = route.method === 'POST' || route.method === 'PUT';

    for (const param of params) {
      const path = param === undefined ? route.path : route.path.replaceAll(/:\w+/g, param);
      await check(`${route.method} ${path} (no body)`, { path });

      if (!hasBody) continue;
      const bodies = [...rawBodies(), ...fieldBodies(), ...nearMissBodies(ids)];
      // Every hostile body against the first valid-looking path; the full
      // product would only repeat the same handler code.
      const bodyPaths = param === undefined || param === String(ids.team) || param === String(ids.member) || param === 'abc';
      if (!bodyPaths) continue;
      for (const [index, body] of bodies.entries()) {
        await check(`${route.method} ${path} body #${index} ${String(body).slice(0, 60)}`, { path, body });
      }
    }

    expect(violations).toEqual([]);
  }, 120_000);
});

describe('broken database', () => {
  it('answers a 500 { error, code } without leaking the cause', async () => {
    const brokenEnv = {
      ADMIN_TOKEN: 'broken-db-token',
      DB: {
        prepare() {
          throw new Error('SECRET internal detail: D1 exploded');
        },
        batch() {
          throw new Error('SECRET internal detail: D1 exploded');
        }
      }
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const paths = ['/api/admin/stats', '/api/admin/members', '/api/admin/attendance', '/api/admin/pizza', '/api/admin/rooms',
      '/api/admin/archives', '/api/admin/export', '/api/teams', '/api/stats', '/api/payment/pricing'];
    for (const path of paths) {
      const request = new Request(`${BASE}/nuit-de-linfo${path}`, { headers: { Authorization: 'Bearer broken-db-token' } });
      const response = await createRouter().handle(request, brokenEnv);
      expect(response.status, path).toBe(500);
      const text = await response.text();
      expect(JSON.parse(text).code, path).toBe('internal_error');
      expect(typeof JSON.parse(text).error, path).toBe('string');
      expect(text).not.toContain('SECRET');
    }
    expect(consoleError).toHaveBeenCalled();
  });
});
