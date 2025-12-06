import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateTier,
  getTierPrice,
  getOnsitePrice,
  getTierLabel,
  getOnsiteTierLabel,
  getPricingSummary,
  calculateRevenue,
  getAvailablePaymentOptions
} from '../../src/client/lib/pricing.js';

describe('Client-side Pricing Utilities', () => {
  describe('calculateTier', () => {
    it('returns tier1 when before cutoff date', () => {
      const deadline = new Date('2024-12-15T19:00:00');
      const now = new Date('2024-12-01T12:00:00'); // 14 days before deadline
      expect(calculateTier(deadline, 7, now)).toBe('tier1');
    });

    it('returns tier2 when within cutoff period', () => {
      const deadline = new Date('2024-12-15T19:00:00');
      const now = new Date('2024-12-10T12:00:00'); // 5 days before deadline
      expect(calculateTier(deadline, 7, now)).toBe('tier2');
    });

    it('returns tier2 when after deadline', () => {
      const deadline = new Date('2024-12-15T19:00:00');
      const now = new Date('2024-12-20T12:00:00');
      expect(calculateTier(deadline, 7, now)).toBe('tier2');
    });

    it('returns tier2 when no deadline', () => {
      expect(calculateTier(null)).toBe('tier2');
      expect(calculateTier(undefined)).toBe('tier2');
    });

    it('handles string deadline', () => {
      const now = new Date('2024-12-01T12:00:00');
      expect(calculateTier('2024-12-15T19:00:00', 7, now)).toBe('tier1');
    });
  });

  describe('getTierPrice', () => {
    it('returns tier1 price for tier1', () => {
      expect(getTierPrice('tier1', { priceTier1: 500, priceTier2: 700 })).toBe(500);
    });

    it('returns tier2 price for tier2', () => {
      expect(getTierPrice('tier2', { priceTier1: 500, priceTier2: 700 })).toBe(700);
    });

    it('uses default values when config is null', () => {
      expect(getTierPrice('tier1', null)).toBe(500);
      expect(getTierPrice('tier2', null)).toBe(700);
    });
  });

  describe('getOnsitePrice', () => {
    const config = {
      priceAssoMember: 500,
      priceNonMember: 800,
      priceLate: 1000
    };

    it('returns correct price for each tier', () => {
      expect(getOnsitePrice('asso_member', config)).toBe(500);
      expect(getOnsitePrice('non_member', config)).toBe(800);
      expect(getOnsitePrice('late', config)).toBe(1000);
    });

    it('defaults to asso_member price for unknown tier', () => {
      expect(getOnsitePrice('unknown', config)).toBe(500);
    });

    it('uses default values when config is null', () => {
      expect(getOnsitePrice('asso_member', null)).toBe(500);
    });
  });

  describe('getTierLabel', () => {
    it('returns French labels by default', () => {
      expect(getTierLabel('tier1')).toBe('Inscription anticipée');
      expect(getTierLabel('tier2')).toBe('Inscription standard');
    });

    it('returns English labels', () => {
      expect(getTierLabel('tier1', 'en')).toBe('Early bird');
      expect(getTierLabel('tier2', 'en')).toBe('Standard');
    });

    it('returns tier for unknown values', () => {
      expect(getTierLabel('unknown')).toBe('unknown');
    });
  });

  describe('getOnsiteTierLabel', () => {
    it('returns French labels by default', () => {
      expect(getOnsiteTierLabel('asso_member')).toBe('Membre asso');
      expect(getOnsiteTierLabel('non_member')).toBe('Non-membre');
      expect(getOnsiteTierLabel('late')).toBe('Retardataire');
    });

    it('returns English labels', () => {
      expect(getOnsiteTierLabel('asso_member', 'en')).toBe('Association member');
    });
  });

  describe('getPricingSummary', () => {
    it('calculates correct summary for tier1', () => {
      const config = {
        priceTier1: 500,
        priceTier2: 700,
        tier1CutoffDays: 7,
        registrationDeadline: '2024-12-15T19:00:00'
      };
      const now = new Date('2024-12-01T12:00:00');

      const summary = getPricingSummary(config, now);

      expect(summary.currentTier).toBe('tier1');
      expect(summary.currentPrice).toBe(500);
      expect(summary.isBeforeCutoff).toBe(true);
      expect(summary.isDeadlinePassed).toBe(false);
      expect(summary.daysUntilDeadline).toBeGreaterThan(0);
    });

    it('calculates correct summary for tier2', () => {
      const config = {
        priceTier1: 500,
        priceTier2: 700,
        tier1CutoffDays: 7,
        registrationDeadline: '2024-12-15T19:00:00'
      };
      const now = new Date('2024-12-10T12:00:00');

      const summary = getPricingSummary(config, now);

      expect(summary.currentTier).toBe('tier2');
      expect(summary.currentPrice).toBe(700);
      expect(summary.isBeforeCutoff).toBe(false);
    });

    it('handles no deadline', () => {
      const summary = getPricingSummary({});

      expect(summary.currentTier).toBe('tier2');
      expect(summary.deadlineDate).toBe(null);
      expect(summary.daysUntilDeadline).toBe(null);
    });
  });

  describe('calculateRevenue', () => {
    it('calculates total revenue', () => {
      const members = [
        { payment_amount: 500, payment_status: 'paid', registration_tier: 'tier1' },
        { payment_amount: 700, payment_status: 'paid', registration_tier: 'tier2' },
        { payment_amount: 500, payment_tier: 'asso_member' }
      ];

      const result = calculateRevenue(members);

      expect(result.total).toBe(1700);
      expect(result.onlineTotal).toBe(1200);
      expect(result.onsiteTotal).toBe(500);
      expect(result.count).toBe(3);
    });

    it('groups by tier', () => {
      const members = [
        { payment_amount: 500, payment_status: 'paid', registration_tier: 'tier1' },
        { payment_amount: 500, payment_status: 'paid', registration_tier: 'tier1' },
        { payment_amount: 700, payment_status: 'paid', registration_tier: 'tier2' }
      ];

      const result = calculateRevenue(members);

      expect(result.byTier.tier1).toBe(1000);
      expect(result.byTier.tier2).toBe(700);
    });

    it('handles empty array', () => {
      const result = calculateRevenue([]);

      expect(result.total).toBe(0);
      expect(result.count).toBe(0);
    });

    it('handles non-array input', () => {
      const result = calculateRevenue(null);

      expect(result.total).toBe(0);
    });

    it('ignores members with no payment amount', () => {
      const members = [
        { payment_amount: 500 },
        { payment_amount: 0 },
        { payment_amount: null }
      ];

      const result = calculateRevenue(members);

      expect(result.total).toBe(500);
      expect(result.count).toBe(1);
    });
  });

  describe('getAvailablePaymentOptions', () => {
    it('returns asso_member and non_member before cutoff', () => {
      const now = new Date('2024-12-01T18:00:00');
      const result = getAvailablePaymentOptions('19:00', now);

      expect(result.isAfterCutoff).toBe(false);
      expect(result.options).toEqual(['asso_member', 'non_member']);
    });

    it('returns asso_member and late after cutoff', () => {
      const now = new Date('2024-12-01T20:00:00');
      const result = getAvailablePaymentOptions('19:00', now);

      expect(result.isAfterCutoff).toBe(true);
      expect(result.options).toEqual(['asso_member', 'late']);
    });

    it('uses default cutoff time if not provided', () => {
      const now = new Date('2024-12-01T20:00:00');
      const result = getAvailablePaymentOptions(null, now);

      expect(result.isAfterCutoff).toBe(true);
    });
  });
});
