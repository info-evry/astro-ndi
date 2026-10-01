/**
 * The public page (GET /nuit-de-linfo/) is rendered per request:
 * - edition, date and deadlines come from the clock (never baked at deploy time);
 * - the tariff cards show the on-site prices of the admin settings;
 * - no online payment section, no "featured" tariff, "code secret" vocabulary.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { setupSchema, clearAllTables, adminFetch, BASE } from './helpers.js';

beforeAll(setupSchema);
beforeEach(clearAllTables);
afterEach(() => vi.useRealTimers());

const PAGE = `${BASE}/nuit-de-linfo/`;

/** Fetch the page with the worker clock set to `iso` (Date only: timers and I/O keep working). */
async function pageAt(iso) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
  const response = await SELF.fetch(PAGE);
  expect(response.status).toBe(200);
  const html = await response.text();
  vi.useRealTimers();
  return html;
}

/** The three tariff cards of the `#tarifs` section, as `{ amount, classes }`. */
function tariffCards(html) {
  const section = html.slice(html.indexOf('id="tarifs"'), html.indexOf('id="capacity-warning"'));
  return [...section.matchAll(/<div class="([^"]*pricing-card[^"]*)"[^>]*>\s*<div class="pricing-amount"[^>]*>([^<]*)</g)]
    .map(([, classes, amount]) => ({ classes: classes.replaceAll(/astro-\w+/g, '').trim().split(/\s+/).sort(), amount }));
}

describe('edition, dates and deadlines follow the clock', () => {
  it.each([
    ['mid 2026', '2026-06-15T12:00:00+02:00'],
    ['NDI day 2026', '2026-12-03T23:00:00+01:00'],
    ['the very end of NDI 2026 (Friday 08:04:00)', '2026-12-04T08:04:00+01:00']
  ])('%s shows the 2026 edition', async (_label, iso) => {
    const html = await pageAt(iso);
    expect(html).toContain('20ème édition');
    expect(html).toContain('Jeudi 3 décembre 2026, 16h34');
    expect(html).not.toContain('21ème édition');
  });

  it.each([
    ['one second after the end of NDI 2026', '2026-12-04T08:04:01+01:00'],
    ['the next day', '2026-12-05T10:00:00+01:00'],
    ['New Year 2027', '2027-01-01T00:30:00+01:00']
  ])('%s shows the 2027 edition (Thursday December 2nd)', async (_label, iso) => {
    const html = await pageAt(iso);
    expect(html).toContain('21ème édition');
    expect(html).toContain('Jeudi 2 décembre 2027, 16h34');
    expect(html).not.toContain('20ème édition');
    expect(html).not.toContain('3 décembre 2026');
  });

  it('puts the computed year and edition in the meta description', async () => {
    const before = await pageAt('2026-12-01T12:00:00+01:00');
    expect(before).toContain('content="Inscription des équipes pour la Nuit de l\'Info 2026 - 20ème édition"');
    const after = await pageAt('2026-12-04T09:00:00+01:00');
    expect(after).toContain('content="Inscription des équipes pour la Nuit de l\'Info 2027 - 21ème édition"');
  });

  it('labels the national figures with their own year, not an edition number', async () => {
    const html = await pageAt('2026-06-15T12:00:00+02:00');
    expect(html).toContain('Édition 2024');
    expect(html).toContain('derniers chiffres nationaux publiés');
    expect(html).not.toContain('Édition 2007');
  });
});

describe('tariff cards', () => {
  it('shows the default on-site prices when no setting exists, three identical cards', async () => {
    const cards = tariffCards(await pageAt('2026-06-15T12:00:00+02:00'));
    expect(cards.map(card => card.amount)).toEqual(['5€', '8€', 'Gratuit']);
    for (const card of cards) {
      expect(card.classes).toEqual(['glass-card', 'pricing-card']);
    }
  });

  it('follows the prices the organisers save in the admin settings (cents; whole euros without decimals)', async () => {
    const put = (body) => adminFetch('/api/admin/settings', { method: 'PUT', body });

    expect((await put({ price_asso_member: 450, price_non_member: 750 })).status).toBe(200);
    expect(tariffCards(await pageAt('2026-06-15T12:00:00+02:00')).map(card => card.amount)).toEqual(['4,50€', '7,50€', 'Gratuit']);

    expect((await put({ price_asso_member: 300, price_non_member: 1200 })).status).toBe(200);
    expect(tariffCards(await pageAt('2026-06-15T12:00:00+02:00')).map(card => card.amount)).toEqual(['3€', '12€', 'Gratuit']);
  });

  it('falls back to the default for a missing or corrupt stored price', async () => {
    await env.DB.exec(`INSERT OR REPLACE INTO settings (key, value) VALUES ('price_asso_member', 'abc'), ('price_non_member', '-5')`);
    const cards = tariffCards(await pageAt('2026-06-15T12:00:00+02:00'));
    expect(cards.map(card => card.amount)).toEqual(['5€', '8€', 'Gratuit']);
  });

  it('says that payment is on site only', async () => {
    const html = await pageAt('2026-06-15T12:00:00+02:00');
    expect(html).toContain('Paiement uniquement sur place');
    expect(html).toContain('Aucun paiement en ligne');
  });
});

describe('registration form', () => {
  it('has no online payment section, method choice or payment CSS', async () => {
    const html = await pageAt('2026-06-15T12:00:00+02:00');
    expect(html).not.toContain('payment-section');
    expect(html).not.toContain('paymentMethod');
    expect(html).not.toContain('Payer maintenant');
    expect(html).not.toContain('payment-method');
    expect(html).not.toContain('payment-disabled');
    expect(html).not.toContain('pricing-info');
  });

  it('speaks of a "code secret", never of a password / account', async () => {
    const html = await pageAt('2026-06-15T12:00:00+02:00');
    expect(html).toContain("Code secret de l'équipe");
    expect(html).toContain("Choisissez un code secret : il servira à vos coéquipiers pour rejoindre l'équipe. Aucun compte à créer.");
    expect(html).toContain("Demandez le code secret à votre chef d'équipe");
    expect(html).toContain("Entrez le code secret de l'équipe pour voir ses membres.");
    expect(html).not.toMatch(/mot de passe/i);
    // the API field names are unchanged
    expect(html).toContain('name="teamPassword"');
    expect(html).toContain('name="joinPassword"');
  });
});
