/**
 * Global test setup - runs before every test in every test file.
 *
 * Clears the RATE_LIMIT KV namespace before each test so that rate limiting
 * introduced by the `createRateLimiter` router middleware does not leak
 * counters between tests and cause unrelated tests to unexpectedly hit
 * 429 responses.
 */
import { beforeEach } from 'vitest';
import { env } from 'cloudflare:test';

beforeEach(async () => {
  if (!env.RATE_LIMIT) return;

  const list = await env.RATE_LIMIT.list();
  await Promise.all(list.keys.map((key) => env.RATE_LIMIT.delete(key.name)));
});
