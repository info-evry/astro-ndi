import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  truncateText,
  formatTeamWithRoom,
  formatCurrency,
  formatDate,
  formatTime,
  formatBacLevel,
  getPaymentTierLabel,
  getPaymentStatusDisplay
} from '../../src/client/lib/formatting.js';

describe('Formatting Utilities', () => {
  describe('escapeHtml', () => {
    it('escapes HTML entities', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
    });

    it('escapes ampersands', () => {
      expect(escapeHtml('A & B')).toBe('A &amp; B');
    });

    it('escapes single quotes', () => {
      expect(escapeHtml("it's")).toBe("it&#039;s");
    });

    it('handles null/undefined', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });

    it('converts numbers to strings', () => {
      expect(escapeHtml(123)).toBe('123');
    });
  });

  describe('truncateText', () => {
    it('truncates long text with ellipsis', () => {
      expect(truncateText('Hello World', 6)).toBe('Hello…');
    });

    it('does not truncate short text', () => {
      expect(truncateText('Hello', 10)).toBe('Hello');
    });

    it('handles exact length', () => {
      expect(truncateText('Hello', 5)).toBe('Hello');
    });

    it('handles null/undefined', () => {
      expect(truncateText(null)).toBe('');
      expect(truncateText(undefined)).toBe('');
    });

    it('uses default max length of 40', () => {
      const longText = 'a'.repeat(50);
      expect(truncateText(longText)).toHaveLength(40);
    });
  });

  describe('formatTeamWithRoom', () => {
    it('formats team with room', () => {
      const result = formatTeamWithRoom('Team Alpha', 'Room 101');
      expect(result.full).toBe('Team Alpha (Room 101)');
      expect(result.truncated).toBe('Team Alpha (Room 101)');
    });

    it('formats team without room', () => {
      const result = formatTeamWithRoom('Team Alpha', null);
      expect(result.full).toBe('Team Alpha');
    });

    it('truncates long names', () => {
      const result = formatTeamWithRoom('A very long team name', 'Room with long name', 20);
      expect(result.truncated.length).toBe(20);
      expect(result.truncated.endsWith('…')).toBe(true);
    });
  });

  describe('formatCurrency', () => {
    it('formats cents to euros', () => {
      const result = formatCurrency(500);
      expect(result).toMatch(/5[,.]00/);
      expect(result).toMatch(/€/);
    });

    it('handles zero', () => {
      expect(formatCurrency(0)).toMatch(/0[,.]00/);
    });

    it('handles invalid input', () => {
      expect(formatCurrency(NaN)).toBe('0,00 €');
      expect(formatCurrency('abc')).toBe('0,00 €');
    });

    it('handles large amounts', () => {
      const result = formatCurrency(100000);
      expect(result).toMatch(/1[\s\u202f]?000[,.]00/);
    });
  });

  describe('formatDate', () => {
    it('formats date string', () => {
      const result = formatDate('2024-12-01');
      expect(result).toContain('2024');
      expect(result).toContain('décembre');
    });

    it('formats Date object', () => {
      const result = formatDate(new Date('2024-12-01'));
      expect(result).toContain('2024');
    });

    it('handles null/undefined', () => {
      expect(formatDate(null)).toBe('-');
      expect(formatDate(undefined)).toBe('-');
    });

    it('handles invalid date', () => {
      expect(formatDate('invalid')).toBe('-');
    });
  });

  describe('formatTime', () => {
    it('formats time from date string', () => {
      const result = formatTime('2024-12-01T14:30:00');
      expect(result).toMatch(/14:30/);
    });

    it('handles null', () => {
      expect(formatTime(null)).toBe('-');
    });
  });

  describe('formatBacLevel', () => {
    it('formats BAC levels', () => {
      expect(formatBacLevel(0)).toBe('Non bachelier');
      expect(formatBacLevel(1)).toBe('BAC+1');
      expect(formatBacLevel(5)).toBe('BAC+5');
      expect(formatBacLevel(8)).toBe('BAC+8');
    });

    it('handles string input', () => {
      expect(formatBacLevel('3')).toBe('BAC+3');
    });

    it('handles invalid input', () => {
      expect(formatBacLevel(null)).toBe('-');
      expect(formatBacLevel('abc')).toBe('-');
      expect(formatBacLevel(-1)).toBe('-');
    });
  });

  describe('getPaymentTierLabel', () => {
    it('returns correct labels', () => {
      expect(getPaymentTierLabel('asso_member')).toBe('Membre asso');
      expect(getPaymentTierLabel('non_member')).toBe('Non-membre');
      expect(getPaymentTierLabel('late')).toBe('Retardataire');
      expect(getPaymentTierLabel('tier1')).toBe('Anticipé');
      expect(getPaymentTierLabel('tier2')).toBe('Standard');
    });

    it('returns tier for unknown values', () => {
      expect(getPaymentTierLabel('unknown')).toBe('unknown');
    });

    it('handles null/undefined', () => {
      expect(getPaymentTierLabel(null)).toBe('-');
      expect(getPaymentTierLabel(undefined)).toBe('-');
    });
  });

  describe('getPaymentStatusDisplay', () => {
    it('returns success badge for paid online', () => {
      const result = getPaymentStatusDisplay({
        payment_status: 'paid',
        registration_tier: 'tier1'
      });
      expect(result.badgeClass).toBe('badge-success');
      expect(result.label).toBe('Anticipé');
      expect(result.icon).toBe('💳');
    });

    it('returns warning badge for delayed', () => {
      const result = getPaymentStatusDisplay({
        payment_status: 'delayed'
      });
      expect(result.badgeClass).toBe('badge-warning');
      expect(result.label).toBe('À payer');
    });

    it('returns info badge for pending', () => {
      const result = getPaymentStatusDisplay({
        payment_status: 'pending'
      });
      expect(result.badgeClass).toBe('badge-info');
      expect(result.label).toBe('En cours');
    });

    it('returns success badge for on-site payment', () => {
      const result = getPaymentStatusDisplay({
        payment_tier: 'asso_member'
      });
      expect(result.badgeClass).toBe('badge-success');
      expect(result.label).toBe('Membre asso');
    });

    it('returns muted badge for no payment', () => {
      const result = getPaymentStatusDisplay({});
      expect(result.badgeClass).toBe('badge-muted');
      expect(result.label).toBe('-');
    });
  });
});
