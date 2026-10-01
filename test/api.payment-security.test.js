/**
 * Payment endpoints - authorization, input validation and SumUp flows
 *
 * Complements api.payment.test.js. Flows that need SUMUP_API_KEY call the
 * handlers directly with an augmented env (the SELF worker env cannot be
 * mutated from tests) and stub the SumUp HTTP API with a mocked fetch.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { createCheckout, verifyPayment, paymentCallback, markPaymentDelayed } from '../src/features/payment/payment.api.js';
import { setupSchema, clearAllTables, seedTeam, postJson, adminFetch, countRows, uniq, BASE, JSON_HEADERS } from './helpers.js';

beforeAll(setupSchema);
beforeEach(clearAllTables);
afterEach(() => vi.restoreAllMocks());

const SUMUP_ENV = { SUMUP_API_KEY: 'test-sumup-key', SUMUP_MERCHANT_CODE: 'MERCHANT123', SITE_URL: 'https://site.test' };

async function setSettings(values = {}) {
  const settings = {
    payment_enabled: 'true',
    price_tier1: '500',
    price_tier2: '700',
    tier1_cutoff_days: '7',
    registration_deadline: new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString(),
    ...values
  };
  for (const [key, value] of Object.entries(settings)) {
    await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(key, value).run();
  }
}

async function memberRow(id) {
  return env.DB.prepare('SELECT * FROM members WHERE id = ?').bind(id).first();
}

/** Team + one member; returns ids and the team password. */
async function seedPayer(memberOverrides = {}) {
  const team = await seedTeam({ password: uniq('pw-') });
  const memberId = team.memberIds[0];
  const assignments = Object.entries(memberOverrides);
  if (assignments.length > 0) {
    const setClause = assignments.map(([column]) => `${column} = ?`).join(', ');
    await env.DB.prepare(`UPDATE members SET ${setClause} WHERE id = ?`)
      .bind(...assignments.map(([, value]) => value), memberId).run();
  }
  return { teamId: team.id, memberId, password: team.password };
}

function jsonRequest(path, body, headers = {}) {
  return new Request(`${BASE}${path}`, {
    method: 'POST',
    headers: { ...JSON_HEADERS, ...headers },
    body: JSON.stringify(body)
  });
}

function mockSumUp(responder) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const { status = 200, body } = await responder(String(url), init);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  });
}

describe('Payment authorization (checkout / verify / delayed)', () => {
  const endpoints = [
    ['checkout', (m) => ({ memberId: m.memberId })],
    ['delayed', (m) => ({ memberId: m.memberId })],
    ['verify', () => ({ checkoutId: 'co-auth' })]
  ];

  beforeEach(async () => {
    await setSettings();
  });

  it.each(endpoints)('%s answers 403 without a team password or admin token', async (name, buildBody) => {
    const payer = await seedPayer({ checkout_id: 'co-auth' });
    const response = await postJson(`/api/payment/${name}`, buildBody(payer));
    expect(response.status).toBe(403);
  });

  it.each(endpoints)("%s answers 403 with another team's (valid) password", async (name, buildBody) => {
    const payer = await seedPayer({ checkout_id: 'co-auth' });
    const other = await seedPayer();

    const response = await postJson(`/api/payment/${name}`, { ...buildBody(payer), teamPassword: other.password });
    expect(response.status).toBe(403);
  });

  it.each(endpoints)('%s answers 403 for empty or non-string passwords', async (name, buildBody) => {
    const payer = await seedPayer({ checkout_id: 'co-auth' });

    for (const teamPassword of ['', 123, ['x'], { a: 1 }, null, true]) {
      const response = await postJson(`/api/payment/${name}`, { ...buildBody(payer), teamPassword });
      expect(response.status).toBe(403);
    }
  });

  it.each(endpoints)('%s answers 403 for a wrong admin token without team password', async (name, buildBody) => {
    const payer = await seedPayer({ checkout_id: 'co-auth' });
    const response = await postJson(`/api/payment/${name}`, buildBody(payer), { Authorization: 'Bearer wrong-token' });
    expect(response.status).toBe(403);
  });

  it.each(endpoints)('%s lets an admin through the authorization check', async (name, buildBody) => {
    const payer = await seedPayer({ checkout_id: 'co-auth' });
    const response = await adminFetch(`/api/payment/${name}`, { method: 'POST', body: buildBody(payer) });
    expect(response.status).not.toBe(403);
  });

  it('a rejected delayed request does not mutate the member or log an event', async () => {
    const payer = await seedPayer();
    const other = await seedPayer();

    await postJson('/api/payment/delayed', { memberId: payer.memberId, teamPassword: other.password });

    const row = await memberRow(payer.memberId);
    expect(row.payment_status).toBe('unpaid');
    expect(row.payment_method).toBeNull();
    expect(await countRows('payment_events')).toBe(0);
  });
});

describe('POST /api/payment/delayed', () => {
  beforeEach(async () => {
    await setSettings();
  });

  it('answers 409 once the member has already paid and leaves the row untouched', async () => {
    const payer = await seedPayer({ payment_status: 'paid', payment_method: 'online', payment_amount: 500 });

    const response = await postJson('/api/payment/delayed', { memberId: payer.memberId, teamPassword: payer.password });
    expect(response.status).toBe(409);

    const row = await memberRow(payer.memberId);
    expect(row.payment_status).toBe('paid');
    expect(row.payment_method).toBe('online');
    expect(await countRows('payment_events')).toBe(0);
  });

  it('marks the member delayed / on_site with the right tier and logs the event', async () => {
    const payer = await seedPayer();

    const response = await postJson('/api/payment/delayed', { memberId: payer.memberId, teamPassword: payer.password });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, status: 'delayed', tier: 'tier1' });

    const row = await memberRow(payer.memberId);
    expect(row.payment_status).toBe('delayed');
    expect(row.payment_method).toBe('on_site');
    expect(row.registration_tier).toBe('tier1');

    const event = await env.DB.prepare('SELECT * FROM payment_events WHERE member_id = ?').bind(payer.memberId).first();
    expect(event.event_type).toBe('payment_delayed');
    expect(event.amount).toBe(0);
  });

  it('uses tier2 inside the cutoff window', async () => {
    await setSettings({ registration_deadline: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString() });
    const payer = await seedPayer();

    const response = await postJson('/api/payment/delayed', { memberId: payer.memberId, teamPassword: payer.password });
    expect((await response.json()).tier).toBe('tier2');
  });
});

describe('Payment endpoints - malformed input', () => {
  it.each(['checkout', 'verify', 'delayed'])('%s answers 400 for invalid JSON', async (name) => {
    const response = await postJson(`/api/payment/${name}`, '{not json');
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid JSON body' });
  });

  it.each(['checkout', 'verify', 'delayed'])('%s answers 400 for null / array / scalar bodies', async (name) => {
    for (const body of ['null', '[]', '7']) {
      const response = await postJson(`/api/payment/${name}`, body);
      expect(response.status).toBe(400);
    }
  });

  it.each(['checkout', 'delayed'])('%s rejects a memberId that is not a number or string', async (name) => {
    for (const memberId of [{ a: 1 }, [1], true]) {
      const response = await postJson(`/api/payment/${name}`, { memberId });
      expect(response.status).toBe(400);
    }
  });

  it('verify rejects a checkoutId that is not a string', async () => {
    for (const checkoutId of [{ a: 1 }, [1], 12]) {
      const response = await postJson('/api/payment/verify', { checkoutId });
      expect(response.status).toBe(400);
    }
  });

  it.each(['checkout', 'delayed'])('%s answers 404 for non-numeric, negative and huge member ids', async (name) => {
    for (const memberId of ['abc', '1; DROP TABLE members', -5, 1e30, '99999999999999999999']) {
      const response = await postJson(`/api/payment/${name}`, { memberId });
      expect(response.status).toBe(404);
    }
    expect(await countRows('members')).toBe(0);
  });

  it.each(['checkout', 'delayed'])('%s treats memberId 0 as missing', async (name) => {
    const response = await postJson(`/api/payment/${name}`, { memberId: 0 });
    expect(response.status).toBe(400);
  });

  it('accepts a numeric-string memberId for an existing member', async () => {
    const payer = await seedPayer();
    const response = await postJson('/api/payment/delayed', { memberId: String(payer.memberId), teamPassword: payer.password });
    expect(response.status).toBe(200);
  });

  it('verify answers 404 for an unknown checkout id', async () => {
    const response = await postJson('/api/payment/verify', { checkoutId: 'does-not-exist' });
    expect(response.status).toBe(404);
  });
});

describe('Payment rate limiting', () => {
  it('limits checkout/verify/delayed to 20 requests per window', async () => {
    const headers = { 'CF-Connecting-IP': '203.0.113.99' };
    let last;
    for (let i = 0; i < 21; i++) {
      last = await postJson('/api/payment/delayed', { memberId: 0 }, headers);
      if (i < 20) expect(last.status).toBe(400);
    }
    expect(last.status).toBe(429);
    expect(last.headers.get('Retry-After')).toBeTruthy();
  });

  it('never rate limits pricing or the SumUp callback', async () => {
    const headers = { 'CF-Connecting-IP': '203.0.113.98' };
    for (let i = 0; i < 25; i++) {
      const pricing = await SELF.fetch(`${BASE}/api/payment/pricing`, { headers });
      expect(pricing.status).toBe(200);
      const callback = await postJson('/api/payment/callback', {}, headers);
      expect(callback.status).toBe(200);
    }
  });
});

describe('POST /api/payment/callback without SUMUP_API_KEY', () => {
  it('acknowledges but never mutates a pending member', async () => {
    const payer = await seedPayer({ payment_status: 'pending', checkout_id: 'co-pending', registration_tier: 'tier1' });

    const response = await postJson('/api/payment/callback', { id: 'co-pending', checkout_reference: 'ndi-1-1-aa', status: 'PAID' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, processed: false });

    const row = await memberRow(payer.memberId);
    expect(row.payment_status).toBe('pending');
    expect(row.transaction_id).toBeNull();
    expect(row.payment_amount).toBeNull();
    expect(await countRows('payment_events')).toBe(0);
  });

  it('acknowledges malformed JSON without touching the database', async () => {
    const response = await postJson('/api/payment/callback', '{not json');
    expect(response.status).toBe(200);
    expect((await response.json()).received).toBe(true);
    expect(await countRows('payment_events')).toBe(0);
  });
});

describe('Checkout creation (SumUp mocked)', () => {
  beforeEach(async () => {
    await setSettings();
  });

  it('creates a checkout, records it on the member and logs an event', async () => {
    const payer = await seedPayer();
    const fetchMock = mockSumUp(async () => ({ status: 201, body: { id: 'co-new-1', status: 'PENDING' } }));

    const response = await createCheckout(
      jsonRequest('/api/payment/checkout', { memberId: payer.memberId, teamPassword: payer.password }),
      { ...env, ...SUMUP_ENV }
    );
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toMatchObject({ checkoutId: 'co-new-1', amount: 500, amountFormatted: '5.00 €', tier: 'tier1' });
    expect(data.reference).toMatch(new RegExp(String.raw`^ndi-${payer.memberId}-\d+-[0-9a-f]{8}$`));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.sumup.com/v0.1/checkouts');
    expect(init.headers.Authorization).toBe('Bearer test-sumup-key');
    expect(JSON.parse(init.body)).toMatchObject({
      amount: 5,
      currency: 'EUR',
      merchant_code: 'MERCHANT123',
      return_url: 'https://site.test/api/payment/callback'
    });

    const row = await memberRow(payer.memberId);
    expect(row).toMatchObject({ payment_status: 'pending', payment_method: 'online', checkout_id: 'co-new-1', registration_tier: 'tier1' });

    const event = await env.DB.prepare('SELECT * FROM payment_events WHERE member_id = ?').bind(payer.memberId).first();
    expect(event).toMatchObject({ event_type: 'checkout_created', checkout_id: 'co-new-1', amount: 500, tier: 'tier1' });
  });

  it('charges the tier2 price inside the cutoff window', async () => {
    await setSettings({ registration_deadline: new Date(Date.now() + 24 * 3600 * 1000).toISOString() });
    const payer = await seedPayer();
    mockSumUp(async () => ({ status: 201, body: { id: 'co-new-2' } }));

    const response = await createCheckout(
      jsonRequest('/api/payment/checkout', { memberId: payer.memberId, teamPassword: payer.password }),
      { ...env, ...SUMUP_ENV }
    );
    const data = await response.json();
    expect(data).toMatchObject({ amount: 700, tier: 'tier2' });
  });

  it('keeps the tier already recorded on the member', async () => {
    await setSettings({ registration_deadline: new Date(Date.now() + 24 * 3600 * 1000).toISOString() });
    const payer = await seedPayer({ registration_tier: 'tier1' });
    mockSumUp(async () => ({ status: 201, body: { id: 'co-new-3' } }));

    const response = await createCheckout(
      jsonRequest('/api/payment/checkout', { memberId: payer.memberId, teamPassword: payer.password }),
      { ...env, ...SUMUP_ENV }
    );
    expect((await response.json()).tier).toBe('tier1');
  });

  it('answers 500 and leaves the member untouched when SumUp rejects the checkout', async () => {
    const payer = await seedPayer();
    mockSumUp(async () => ({ status: 401, body: { message: 'Invalid API key' } }));

    const response = await createCheckout(
      jsonRequest('/api/payment/checkout', { memberId: payer.memberId, teamPassword: payer.password }),
      { ...env, ...SUMUP_ENV }
    );
    expect(response.status).toBe(500);

    const row = await memberRow(payer.memberId);
    expect(row.payment_status).toBe('unpaid');
    expect(row.checkout_id).toBeNull();
    expect(await countRows('payment_events')).toBe(0);
  });

  it('answers 400 when online payments are disabled, before calling SumUp', async () => {
    await setSettings({ payment_enabled: 'false' });
    const payer = await seedPayer();
    const fetchMock = mockSumUp(async () => ({ body: {} }));

    const response = await createCheckout(
      jsonRequest('/api/payment/checkout', { memberId: payer.memberId, teamPassword: payer.password }),
      { ...env, ...SUMUP_ENV }
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 503 for the placeholder merchant code without calling SumUp', async () => {
    const payer = await seedPayer();
    const fetchMock = mockSumUp(async () => ({ body: {} }));

    const response = await createCheckout(
      jsonRequest('/api/payment/checkout', { memberId: payer.memberId, teamPassword: payer.password }),
      { ...env, ...SUMUP_ENV, SUMUP_MERCHANT_CODE: 'PLACEHOLDER_MERCHANT_CODE' }
    );
    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 500 when the merchant code is missing', async () => {
    const payer = await seedPayer();
    const response = await createCheckout(
      jsonRequest('/api/payment/checkout', { memberId: payer.memberId, teamPassword: payer.password }),
      { ...env, ...SUMUP_ENV, SUMUP_MERCHANT_CODE: '' }
    );
    expect(response.status).toBe(500);
  });

  it.each(['paid', 'refunded', 'delayed'])('answers 400 for a member whose payment status is %s', async (status) => {
    const payer = await seedPayer({ payment_status: status });

    const response = await createCheckout(
      jsonRequest('/api/payment/checkout', { memberId: payer.memberId, teamPassword: payer.password }),
      { ...env, ...SUMUP_ENV }
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('status');
  });
});

describe('Payment verification (SumUp mocked)', () => {
  const checkoutBody = (status, extra = {}) => ({
    id: 'co-verify',
    status,
    amount: 5,
    currency: 'EUR',
    checkout_reference: 'ndi-1-1-aa',
    ...extra
  });

  async function verify(payer, headers = {}) {
    return verifyPayment(
      jsonRequest('/api/payment/verify', { checkoutId: 'co-verify', teamPassword: payer.password }, headers),
      { ...env, ...SUMUP_ENV }
    );
  }

  it('marks the member as paid and logs a completed event', async () => {
    const payer = await seedPayer({ payment_status: 'pending', checkout_id: 'co-verify', registration_tier: 'tier1' });
    mockSumUp(async () => ({ body: checkoutBody('PAID', { transactions: [{ id: 'txn-1', status: 'SUCCESSFUL', amount: 5, currency: 'EUR' }] }) }));

    const response = await verify(payer);
    expect(await response.json()).toEqual({ success: true, status: 'paid', amount: 500, transactionId: 'txn-1' });

    const row = await memberRow(payer.memberId);
    expect(row).toMatchObject({ payment_status: 'paid', payment_amount: 500, transaction_id: 'txn-1', payment_tier: 'tier1' });
    expect(row.payment_confirmed_at).toBeTruthy();

    const event = await env.DB.prepare('SELECT * FROM payment_events WHERE member_id = ?').bind(payer.memberId).first();
    expect(event).toMatchObject({ event_type: 'payment_completed', amount: 500, checkout_id: 'co-verify' });
  });

  it('logs a failure without marking the member paid', async () => {
    const payer = await seedPayer({ payment_status: 'pending', checkout_id: 'co-verify', registration_tier: 'tier1' });
    mockSumUp(async () => ({ body: checkoutBody('FAILED') }));

    const data = await (await verify(payer)).json();
    expect(data).toMatchObject({ success: false, status: 'failed' });

    expect((await memberRow(payer.memberId)).payment_status).toBe('pending');
    const event = await env.DB.prepare('SELECT event_type FROM payment_events WHERE member_id = ?').bind(payer.memberId).first();
    expect(event.event_type).toBe('payment_failed');
  });

  it.each([
    ['EXPIRED', 'expired'],
    ['PENDING', 'pending']
  ])('reports %s as %s and mutates nothing', async (sumupStatus, expected) => {
    const payer = await seedPayer({ payment_status: 'pending', checkout_id: 'co-verify', registration_tier: 'tier1' });
    mockSumUp(async () => ({ body: checkoutBody(sumupStatus) }));

    const data = await (await verify(payer)).json();
    expect(data.status).toBe(expected);
    expect(data.success).toBe(false);
    expect((await memberRow(payer.memberId)).payment_status).toBe('pending');
    expect(await countRows('payment_events')).toBe(0);
  });

  it('answers 500 when SUMUP_API_KEY is missing, after the authorization check', async () => {
    const payer = await seedPayer({ checkout_id: 'co-verify' });
    const response = await postJson('/api/payment/verify', { checkoutId: 'co-verify', teamPassword: payer.password });
    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain('API key');
  });
});

describe('Payment callback (SumUp mocked)', () => {
  const paidCheckout = {
    id: 'co-hook',
    status: 'PAID',
    amount: 7,
    currency: 'EUR',
    transactions: [{ id: 'txn-hook', status: 'SUCCESSFUL', amount: 7, currency: 'EUR' }]
  };

  const callback = (body) => paymentCallback(jsonRequest('/api/payment/callback', body), { ...env, ...SUMUP_ENV });

  it('verifies with SumUp and marks the member paid', async () => {
    const payer = await seedPayer({ payment_status: 'pending', checkout_id: 'co-hook', registration_tier: 'tier2' });
    const fetchMock = mockSumUp(async () => ({ body: paidCheckout }));

    const data = await (await callback({ id: 'co-hook', status: 'PAID' })).json();
    expect(data).toEqual({ received: true, processed: true });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.sumup.com/v0.1/checkouts/co-hook');

    expect(await memberRow(payer.memberId)).toMatchObject({ payment_status: 'paid', payment_amount: 700, transaction_id: 'txn-hook' });
  });

  it('ignores the status claimed in the webhook body and trusts SumUp', async () => {
    const payer = await seedPayer({ payment_status: 'pending', checkout_id: 'co-hook' });
    mockSumUp(async () => ({ body: { ...paidCheckout, status: 'PENDING' } }));

    await callback({ id: 'co-hook', status: 'PAID' });
    expect((await memberRow(payer.memberId)).payment_status).toBe('pending');
  });

  it('is idempotent for an already paid member', async () => {
    const payer = await seedPayer({ payment_status: 'paid', checkout_id: 'co-hook', payment_amount: 700 });
    mockSumUp(async () => ({ body: paidCheckout }));

    await callback({ id: 'co-hook' });
    await callback({ id: 'co-hook' });
    expect(await countRows('payment_events')).toBe(0);
    expect((await memberRow(payer.memberId)).payment_amount).toBe(700);
  });

  it('acknowledges unknown checkouts without calling SumUp', async () => {
    const fetchMock = mockSumUp(async () => ({ body: paidCheckout }));
    const data = await (await callback({ id: 'nobody-knows' })).json();
    expect(data).toEqual({ received: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still acknowledges when SumUp is unreachable and leaves the member untouched', async () => {
    const payer = await seedPayer({ payment_status: 'pending', checkout_id: 'co-hook' });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    const response = await callback({ id: 'co-hook' });
    expect(response.status).toBe(200);
    expect((await response.json()).received).toBe(true);
    expect((await memberRow(payer.memberId)).payment_status).toBe('pending');
  });
});

describe('markPaymentDelayed called directly', () => {
  it('rejects the call when the member belongs to a team whose hash is empty', async () => {
    await setSettings();
    const team = await seedTeam({ password: '' });

    const response = await markPaymentDelayed(
      jsonRequest('/api/payment/delayed', { memberId: team.memberIds[0], teamPassword: 'anything' }),
      env
    );
    expect(response.status).toBe(403);
  });
});
