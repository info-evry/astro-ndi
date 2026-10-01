/**
 * src/shared/constants.js: the values the Worker and the browser bundles share.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PRICES, MAX_PAYMENT_AMOUNT_CENTS, NO_PIZZA, NO_PIZZA_VALUES,
  PAYMENT_TIER, PAYMENT_TIERS, isNoPizza, isOrganisationTeamName, isPaymentTier
} from '../src/shared/constants.js';

describe('isNoPizza', () => {
  it.each(['', 'none', '0-rien', ' none ', 'NONE', null, undefined])('treats %j as "no pizza"', (value) => {
    expect(isNoPizza(value)).toBe(true);
  });

  it.each(['reine', 'margherita', 'nothing', 0, false, {}, ['none']])('treats %j as a pizza', (value) => {
    expect(isNoPizza(value)).toBe(false);
  });

  it('the value the registration form sends for "no pizza" is one of NO_PIZZA_VALUES', () => {
    expect(NO_PIZZA_VALUES).toContain(NO_PIZZA);
    expect(Object.isFrozen(NO_PIZZA_VALUES)).toBe(true);
  });
});

describe('payment constants', () => {
  it('lists only the on-site tiers the admin picks at check-in (nothing writes the former online tiers any more)', () => {
    expect([...PAYMENT_TIERS]).toEqual(['asso_member', 'non_member', 'late', 'organisation']);
    expect(PAYMENT_TIERS).toEqual(Object.values(PAYMENT_TIER));
  });

  it('isPaymentTier only accepts exact on-site tier strings', () => {
    expect(isPaymentTier('late')).toBe(true);
    for (const value of ['online_tier1', 'online_tier2', 'tier1', 'tier2', 'LATE', ' late', 'free', '', null, undefined, 1, ['late'], { toString: () => 'late' }]) {
      expect(isPaymentTier(value)).toBe(false);
    }
  });

  it('keeps the default prices below the payment cap', () => {
    for (const price of Object.values(DEFAULT_PRICES)) {
      expect(price).toBeGreaterThan(0);
      expect(price).toBeLessThanOrEqual(MAX_PAYMENT_AMOUNT_CENTS);
    }
  });
});

describe('isOrganisationTeamName', () => {
  it('matches the exact name only', () => {
    expect(isOrganisationTeamName('Organisation')).toBe(true);
    expect(isOrganisationTeamName('organisation')).toBe(false);
    expect(isOrganisationTeamName(null)).toBe(false);
  });
});
