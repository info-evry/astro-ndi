/**
 * Payment API Integration Tests
 * Tests for online payment flow with SumUp integration
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';

// Admin token from env (should match wrangler.toml test config)
const ADMIN_TOKEN = 'test-admin-token';

// Helper to create auth header
const authHeader = {
  'Authorization': `Bearer ${ADMIN_TOKEN}`
};

beforeAll(async () => {
  // Create tables - base tables
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS teams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, description TEXT DEFAULT '', password_hash TEXT DEFAULT '', room TEXT DEFAULT NULL, created_at TEXT DEFAULT (datetime('now')))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY AUTOINCREMENT, team_id INTEGER NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL, bac_level INTEGER DEFAULT 0, is_leader INTEGER DEFAULT 0, food_diet TEXT DEFAULT '', checked_in INTEGER DEFAULT 0, checked_in_at TEXT DEFAULT NULL, payment_status TEXT DEFAULT 'unpaid', payment_method TEXT DEFAULT NULL, checkout_id TEXT DEFAULT NULL, transaction_id TEXT DEFAULT NULL, registration_tier TEXT DEFAULT NULL, payment_amount INTEGER DEFAULT NULL, payment_tier TEXT DEFAULT NULL, payment_confirmed_at TEXT DEFAULT NULL, created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE, UNIQUE(first_name, last_name))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, description TEXT DEFAULT '', updated_at TEXT DEFAULT (datetime('now')))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS payment_events (id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER NOT NULL, checkout_id TEXT, event_type TEXT NOT NULL, amount INTEGER NOT NULL, tier TEXT NOT NULL, metadata TEXT, created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE)`);

  // Create Organisation team
  await env.DB.exec(`INSERT OR IGNORE INTO teams (name, description, password_hash) VALUES ('Organisation', 'Équipe organisatrice', '')`);
});

// Helper to create a test member
async function createTestMember(overrides = {}) {
  const teamName = overrides.teamName || `Payment Team ${Date.now()}`;
  const firstName = overrides.firstName || `Test${Date.now()}`;
  const lastName = overrides.lastName || 'User';

  const response = await SELF.fetch('http://localhost/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      createNewTeam: true,
      teamName,
      teamPassword: 'testpass123',
      members: [{
        firstName,
        lastName,
        email: `${firstName.toLowerCase()}@test.com`,
        bacLevel: 3,
        isLeader: true,
        foodDiet: ''
      }]
    })
  });

  const data = await response.json();
  return { team: data.team, member: data.members[0] };
}

// Helper to set payment settings
async function setPaymentSettings(settings = {}) {
  const defaults = {
    payment_enabled: 'true',
    price_tier1: '500',
    price_tier2: '700',
    tier1_cutoff_days: '7',
    registration_deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  };

  for (const [key, value] of Object.entries({ ...defaults, ...settings })) {
    await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .bind(key, value)
      .run();
  }
}

describe('Payment API - GET /api/payment/pricing', () => {
  beforeEach(async () => {
    await setPaymentSettings();
  });

  it('returns current pricing information', async () => {
    const response = await SELF.fetch('http://localhost/api/payment/pricing');

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.enabled).toBe(true);
    expect(data.currentTier).toBeDefined();
    expect(data.currentPrice).toBeDefined();
    expect(data.tier1.price).toBe(500);
    expect(data.tier2.price).toBe(700);
  });

  it('returns tier1 when before cutoff', async () => {
    // Set deadline 30 days from now
    await setPaymentSettings({
      registration_deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });

    const response = await SELF.fetch('http://localhost/api/payment/pricing');
    const data = await response.json();

    expect(data.currentTier).toBe('tier1');
    expect(data.currentPrice).toBe(500);
  });

  it('returns tier2 when within cutoff period', async () => {
    // Set deadline 3 days from now
    await setPaymentSettings({
      registration_deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    });

    const response = await SELF.fetch('http://localhost/api/payment/pricing');
    const data = await response.json();

    expect(data.currentTier).toBe('tier2');
    expect(data.currentPrice).toBe(700);
  });

  it('includes days until deadline', async () => {
    const deadline = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    await setPaymentSettings({
      registration_deadline: deadline.toISOString()
    });

    const response = await SELF.fetch('http://localhost/api/payment/pricing');
    const data = await response.json();

    expect(data.daysUntilDeadline).toBeGreaterThanOrEqual(9);
    expect(data.daysUntilDeadline).toBeLessThanOrEqual(11);
  });

  it('handles disabled payments', async () => {
    await setPaymentSettings({ payment_enabled: 'false' });

    const response = await SELF.fetch('http://localhost/api/payment/pricing');
    const data = await response.json();

    expect(data.enabled).toBe(false);
  });
});

describe('Payment API - POST /api/payment/checkout', () => {
  beforeEach(async () => {
    await setPaymentSettings();
  });

  it('rejects request without memberId', async () => {
    const response = await SELF.fetch('http://localhost/api/payment/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('memberId');
  });

  it('rejects request for non-existent member', async () => {
    const response = await SELF.fetch('http://localhost/api/payment/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: 99999 })
    });

    expect(response.status).toBe(404);
  });

  it('rejects checkout when payments are disabled', async () => {
    const { member } = await createTestMember({ teamName: `Team Disabled ${Date.now()}` });

    await setPaymentSettings({ payment_enabled: 'false' });

    const response = await SELF.fetch('http://localhost/api/payment/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: member.id })
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('disabled');
  });

  it('rejects checkout for already paid member', async () => {
    const { member } = await createTestMember({ teamName: `Team Paid ${Date.now()}` });

    // Mark member as paid
    await env.DB.prepare('UPDATE members SET payment_status = ? WHERE id = ?')
      .bind('paid', member.id)
      .run();

    await setPaymentSettings({ payment_enabled: 'true' });

    const response = await SELF.fetch('http://localhost/api/payment/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: member.id })
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('status');
  });

  it('rejects checkout when SumUp API key is missing', async () => {
    const { member } = await createTestMember({ teamName: `Team NoKey ${Date.now()}` });

    await setPaymentSettings({ payment_enabled: 'true' });

    // Note: In test env, SUMUP_API_KEY should not be set
    const response = await SELF.fetch('http://localhost/api/payment/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: member.id })
    });

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('API key');
  });
});

describe('Payment API - POST /api/payment/verify', () => {
  it('rejects request without checkoutId', async () => {
    const response = await SELF.fetch('http://localhost/api/payment/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('checkoutId');
  });

  it('rejects request for unknown checkout', async () => {
    const response = await SELF.fetch('http://localhost/api/payment/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkoutId: 'non-existent-checkout-id' })
    });

    expect(response.status).toBe(404);
  });
});

describe('Payment API - POST /api/payment/delayed', () => {
  beforeEach(async () => {
    await setPaymentSettings();
  });

  it('rejects request without memberId', async () => {
    const response = await SELF.fetch('http://localhost/api/payment/delayed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('memberId');
  });

  it('rejects request for non-existent member', async () => {
    const response = await SELF.fetch('http://localhost/api/payment/delayed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: 99999 })
    });

    expect(response.status).toBe(404);
  });

  it('marks member payment as delayed', async () => {
    const { member } = await createTestMember({ teamName: `Team Delayed ${Date.now()}` });

    const response = await SELF.fetch('http://localhost/api/payment/delayed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: member.id })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.status).toBe('delayed');
    expect(data.tier).toBeDefined();
  });

  it('sets correct registration tier', async () => {
    const { member } = await createTestMember({ teamName: `Team Tier ${Date.now()}` });

    // Ensure tier1 (deadline far in future)
    await setPaymentSettings({
      registration_deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });

    const response = await SELF.fetch('http://localhost/api/payment/delayed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: member.id })
    });

    const data = await response.json();
    expect(data.tier).toBe('tier1');

    // Verify in database
    const dbMember = await env.DB.prepare('SELECT * FROM members WHERE id = ?')
      .bind(member.id)
      .first();
    expect(dbMember.payment_status).toBe('delayed');
    expect(dbMember.payment_method).toBe('on_site');
    expect(dbMember.registration_tier).toBe('tier1');
  });

  it('logs payment event', async () => {
    const { member } = await createTestMember({ teamName: `Team Event ${Date.now()}` });

    await SELF.fetch('http://localhost/api/payment/delayed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: member.id })
    });

    // Check payment event was logged
    const events = await env.DB.prepare('SELECT * FROM payment_events WHERE member_id = ?')
      .bind(member.id)
      .all();

    expect(events.results).toHaveLength(1);
    expect(events.results[0].event_type).toBe('payment_delayed');
    expect(events.results[0].amount).toBe(0);
  });
});

describe('Payment API - POST /api/payment/callback', () => {
  it('acknowledges callback without checkout info', async () => {
    const response = await SELF.fetch('http://localhost/api/payment/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.received).toBe(true);
  });

  it('acknowledges callback for unknown checkout', async () => {
    const response = await SELF.fetch('http://localhost/api/payment/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'unknown-checkout-id',
        checkout_reference: 'ndi-99999-12345',
        status: 'PAID'
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.received).toBe(true);
  });
});

describe('Payment Flow - Integration', () => {
  beforeEach(async () => {
    await setPaymentSettings();
  });

  it('complete delayed payment flow', async () => {
    // Step 1: Create member via registration
    const { team, member } = await createTestMember({
      teamName: `Integration Team ${Date.now()}`,
      firstName: `Delayed${Date.now()}`
    });

    expect(team).toBeDefined();
    expect(member).toBeDefined();

    // Step 2: Mark payment as delayed
    const delayedResponse = await SELF.fetch('http://localhost/api/payment/delayed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: member.id })
    });

    expect(delayedResponse.status).toBe(200);
    const delayedData = await delayedResponse.json();
    expect(delayedData.success).toBe(true);
    expect(delayedData.status).toBe('delayed');

    // Step 3: Verify member state in database
    const dbMember = await env.DB.prepare('SELECT * FROM members WHERE id = ?')
      .bind(member.id)
      .first();

    expect(dbMember.payment_status).toBe('delayed');
    expect(dbMember.payment_method).toBe('on_site');
    expect(dbMember.registration_tier).toBeDefined();

    // Step 4: Verify payment event was logged
    const events = await env.DB.prepare('SELECT * FROM payment_events WHERE member_id = ? ORDER BY created_at DESC')
      .bind(member.id)
      .all();

    expect(events.results.length).toBeGreaterThanOrEqual(1);
    expect(events.results[0].event_type).toBe('payment_delayed');
  });

  it('pricing reflects current tier correctly', async () => {
    // Set tier1 (early bird)
    await setPaymentSettings({
      registration_deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      tier1_cutoff_days: '7'
    });

    const tier1Response = await SELF.fetch('http://localhost/api/payment/pricing');
    const tier1Data = await tier1Response.json();
    expect(tier1Data.currentTier).toBe('tier1');
    expect(tier1Data.currentPrice).toBe(500);

    // Set tier2 (within cutoff)
    await setPaymentSettings({
      registration_deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      tier1_cutoff_days: '7'
    });

    const tier2Response = await SELF.fetch('http://localhost/api/payment/pricing');
    const tier2Data = await tier2Response.json();
    expect(tier2Data.currentTier).toBe('tier2');
    expect(tier2Data.currentPrice).toBe(700);
  });

  it('payment status affects attendance display', async () => {
    // Create members with different payment states
    const { member: paidMember } = await createTestMember({
      teamName: `Paid Team ${Date.now()}`,
      firstName: `Paid${Date.now()}`
    });
    const { member: delayedMember } = await createTestMember({
      teamName: `Delayed Team ${Date.now()}`,
      firstName: `Delayed${Date.now()}`
    });

    // Mark first as paid
    await env.DB.prepare(`
      UPDATE members
      SET payment_status = 'paid',
          payment_method = 'online',
          payment_amount = 500,
          registration_tier = 'tier1',
          payment_tier = 'tier1'
      WHERE id = ?
    `).bind(paidMember.id).run();

    // Mark second as delayed
    await SELF.fetch('http://localhost/api/payment/delayed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: delayedMember.id })
    });

    // Get attendance data
    const attendanceResponse = await SELF.fetch('http://localhost/api/admin/attendance', {
      headers: authHeader
    });

    expect(attendanceResponse.status).toBe(200);
    const attendance = await attendanceResponse.json();

    // Find our members
    const paidData = attendance.members.find(m => m.id === paidMember.id);
    const delayedData = attendance.members.find(m => m.id === delayedMember.id);

    expect(paidData.payment_status).toBe('paid');
    expect(paidData.payment_amount).toBe(500);

    expect(delayedData.payment_status).toBe('delayed');
    expect(delayedData.payment_method).toBe('on_site');
  });
});

describe('Payment Database Operations', () => {
  beforeEach(async () => {
    await setPaymentSettings();
  });

  it('payment_events table records all events', async () => {
    const { member } = await createTestMember({
      teamName: `Events Team ${Date.now()}`,
      firstName: `Events${Date.now()}`
    });

    // Trigger delayed payment
    await SELF.fetch('http://localhost/api/payment/delayed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: member.id })
    });

    // Check event structure
    const event = await env.DB.prepare('SELECT * FROM payment_events WHERE member_id = ?')
      .bind(member.id)
      .first();

    expect(event.member_id).toBe(member.id);
    expect(event.event_type).toBe('payment_delayed');
    expect(event.amount).toBe(0);
    expect(event.tier).toBeDefined();
    expect(event.created_at).toBeDefined();
  });

  it('member payment fields are properly set', async () => {
    const { member } = await createTestMember({
      teamName: `Fields Team ${Date.now()}`,
      firstName: `Fields${Date.now()}`
    });

    // Check initial state
    const initialMember = await env.DB.prepare('SELECT * FROM members WHERE id = ?')
      .bind(member.id)
      .first();

    expect(initialMember.payment_status).toBe('unpaid');
    expect(initialMember.payment_method).toBeNull();
    expect(initialMember.checkout_id).toBeNull();

    // Mark as delayed
    await SELF.fetch('http://localhost/api/payment/delayed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: member.id })
    });

    // Check updated state
    const updatedMember = await env.DB.prepare('SELECT * FROM members WHERE id = ?')
      .bind(member.id)
      .first();

    expect(updatedMember.payment_status).toBe('delayed');
    expect(updatedMember.payment_method).toBe('on_site');
    expect(updatedMember.registration_tier).toBeDefined();
  });
});

describe('Payment Settings Validation', () => {
  it('handles missing registration deadline gracefully', async () => {
    // Clear deadline
    await env.DB.prepare('DELETE FROM settings WHERE key = ?')
      .bind('registration_deadline')
      .run();

    const response = await SELF.fetch('http://localhost/api/payment/pricing');
    const data = await response.json();

    // Should default to tier2 when no deadline
    expect(data.currentTier).toBe('tier2');
    expect(data.daysUntilDeadline).toBeNull();
  });

  it('uses default prices when not configured', async () => {
    // Clear price settings
    await env.DB.prepare('DELETE FROM settings WHERE key IN (?, ?)')
      .bind('price_tier1', 'price_tier2')
      .run();

    const response = await SELF.fetch('http://localhost/api/payment/pricing');
    const data = await response.json();

    // Should use defaults
    expect(data.tier1.price).toBe(500);
    expect(data.tier2.price).toBe(700);
  });

  it('uses default cutoff days when not configured', async () => {
    // Clear cutoff setting
    await env.DB.prepare('DELETE FROM settings WHERE key = ?')
      .bind('tier1_cutoff_days')
      .run();

    // Set a deadline far in future
    await setPaymentSettings({
      registration_deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
    });

    const response = await SELF.fetch('http://localhost/api/payment/pricing');
    const data = await response.json();

    // Default is 7 days, so 5 days before deadline = tier2
    expect(data.currentTier).toBe('tier2');
  });
});
