import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { toBoolean } from '../src/lib/validation.js';
import { setupSchema, clearAllTables, adminFetch } from './helpers.js';

describe('toBoolean', () => {
  it('does not treat the string "false" (or "non", "0", "") as true', () => {
    for (const v of ['false', 'FALSE', 'non', '0', '', ' ', 'no', null, undefined, 0, [], {}]) {
      expect(toBoolean(v)).toBe(false);
    }
  });
  it('accepts the usual truthy spellings', () => {
    for (const v of [true, 1, '1', 'true', 'TRUE', ' yes ', 'Oui', 'o']) {
      expect(toBoolean(v)).toBe(true);
    }
  });
});

describe('admin responses never expose password hashes', () => {
  beforeAll(async () => {
    await setupSchema();
    await clearAllTables();
    const team = await env.DB.prepare("INSERT INTO teams (name, description, password_hash) VALUES ('Leak Probe', '', 'abcd:efgh')").run();
    await env.DB.prepare("INSERT INTO members (team_id, first_name, last_name, email) VALUES (?, 'Leak', 'Probe', 'leak@example.com')").bind(team.meta.last_row_id).run();
  });

  for (const path of ['/api/admin/stats', '/api/admin/members', '/api/admin/export', '/api/admin/export-official']) {
    it(`GET ${path}`, async () => {
      const res = await adminFetch(path);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).not.toContain('password_hash');
      expect(text).not.toContain('abcd:efgh');
    });
  }
});
