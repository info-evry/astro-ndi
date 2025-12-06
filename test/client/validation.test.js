import { describe, it, expect } from 'vitest';
import {
  isValidEmail,
  validateTeamName,
  validateMember,
  validateSetting,
  validateAllSettings,
  sanitizeString,
  parseInteger,
  isDeadlinePassed,
  isAfterCutoff
} from '../../src/client/lib/validation.js';

describe('Validation Utilities', () => {
  describe('isValidEmail', () => {
    it('validates correct emails', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name@domain.co.uk')).toBe(true);
      expect(isValidEmail('user+tag@example.org')).toBe(true);
    });

    it('rejects invalid emails', () => {
      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('test@')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('test@example')).toBe(false);
    });

    it('handles null/undefined', () => {
      expect(isValidEmail(null)).toBe(false);
      expect(isValidEmail(undefined)).toBe(false);
      expect(isValidEmail('')).toBe(false);
    });
  });

  describe('validateTeamName', () => {
    it('validates correct team names', () => {
      expect(validateTeamName('Team Alpha').valid).toBe(true);
      expect(validateTeamName('AB').valid).toBe(true);
    });

    it('rejects too short names', () => {
      const result = validateTeamName('A');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('2 caractères');
    });

    it('rejects too long names', () => {
      const result = validateTeamName('a'.repeat(101));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('100');
    });

    it('rejects null/undefined', () => {
      expect(validateTeamName(null).valid).toBe(false);
      expect(validateTeamName(undefined).valid).toBe(false);
    });

    it('respects custom length limits', () => {
      expect(validateTeamName('ABC', 5).valid).toBe(false);
      expect(validateTeamName('ABCDE', 5).valid).toBe(true);
    });
  });

  describe('validateMember', () => {
    it('validates complete member', () => {
      const result = validateMember({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com'
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('reports missing firstName', () => {
      const result = validateMember({
        lastName: 'Doe',
        email: 'john@test.com'
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Le prénom est requis');
    });

    it('reports missing lastName', () => {
      const result = validateMember({
        firstName: 'John',
        email: 'john@test.com'
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Le nom est requis');
    });

    it('reports invalid email', () => {
      const result = validateMember({
        firstName: 'John',
        lastName: 'Doe',
        email: 'invalid'
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("L'email n'est pas valide");
    });

    it('reports multiple errors', () => {
      const result = validateMember({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('validateSetting', () => {
    describe('max_team_size', () => {
      it('validates positive numbers', () => {
        expect(validateSetting('max_team_size', 15).valid).toBe(true);
        expect(validateSetting('max_team_size', 100).valid).toBe(true);
      });

      it('rejects invalid values', () => {
        expect(validateSetting('max_team_size', 0).valid).toBe(false);
        expect(validateSetting('max_team_size', -1).valid).toBe(false);
        expect(validateSetting('max_team_size', 101).valid).toBe(false);
      });
    });

    describe('price fields', () => {
      it('validates positive prices', () => {
        expect(validateSetting('price_tier1', 5).valid).toBe(true);
        expect(validateSetting('price_tier2', 7.50).valid).toBe(true);
        expect(validateSetting('price_asso_member', 0).valid).toBe(true);
      });

      it('rejects negative prices', () => {
        expect(validateSetting('price_tier1', -1).valid).toBe(false);
      });
    });

    describe('tier1_cutoff_days', () => {
      it('validates valid range', () => {
        expect(validateSetting('tier1_cutoff_days', 1).valid).toBe(true);
        expect(validateSetting('tier1_cutoff_days', 7).valid).toBe(true);
        expect(validateSetting('tier1_cutoff_days', 30).valid).toBe(true);
      });

      it('rejects out of range values', () => {
        expect(validateSetting('tier1_cutoff_days', 0).valid).toBe(false);
        expect(validateSetting('tier1_cutoff_days', 31).valid).toBe(false);
      });
    });

    describe('registration_deadline', () => {
      it('validates valid dates', () => {
        expect(validateSetting('registration_deadline', '2024-12-01T19:00:00').valid).toBe(true);
      });

      it('allows empty value', () => {
        expect(validateSetting('registration_deadline', '').valid).toBe(true);
        expect(validateSetting('registration_deadline', null).valid).toBe(true);
      });

      it('rejects invalid dates', () => {
        expect(validateSetting('registration_deadline', 'invalid').valid).toBe(false);
      });
    });

    describe('late_cutoff_time', () => {
      it('validates time format', () => {
        expect(validateSetting('late_cutoff_time', '19:00').valid).toBe(true);
        expect(validateSetting('late_cutoff_time', '23:59').valid).toBe(true);
        expect(validateSetting('late_cutoff_time', '00:00').valid).toBe(true);
      });

      it('rejects invalid format', () => {
        expect(validateSetting('late_cutoff_time', '25:00').valid).toBe(false);
        expect(validateSetting('late_cutoff_time', '19:60').valid).toBe(false);
        expect(validateSetting('late_cutoff_time', '1900').valid).toBe(false);
      });
    });
  });

  describe('validateAllSettings', () => {
    it('validates all settings at once', () => {
      const result = validateAllSettings({
        max_team_size: 15,
        price_tier1: 5,
        tier1_cutoff_days: 7
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it('collects all errors', () => {
      const result = validateAllSettings({
        max_team_size: 0,
        price_tier1: -1
      });
      expect(result.valid).toBe(false);
      expect(Object.keys(result.errors).length).toBe(2);
    });
  });

  describe('sanitizeString', () => {
    it('trims whitespace', () => {
      expect(sanitizeString('  hello  ')).toBe('hello');
    });

    it('limits length', () => {
      expect(sanitizeString('hello world', 5)).toBe('hello');
    });

    it('handles null/undefined', () => {
      expect(sanitizeString(null)).toBe('');
      expect(sanitizeString(undefined)).toBe('');
    });
  });

  describe('parseInteger', () => {
    it('parses valid integers', () => {
      expect(parseInteger('42')).toBe(42);
      expect(parseInteger(42)).toBe(42);
    });

    it('respects min/max bounds', () => {
      expect(parseInteger('0', 5, 10)).toBe(5);
      expect(parseInteger('15', 5, 10)).toBe(10);
    });

    it('returns default for invalid input', () => {
      expect(parseInteger('abc', 0, 100, 50)).toBe(50);
      expect(parseInteger(null, 0, 100, 50)).toBe(50);
    });
  });

  describe('isDeadlinePassed', () => {
    it('returns false when before deadline', () => {
      const deadline = new Date('2024-12-31T23:59:59');
      const now = new Date('2024-12-01T12:00:00');
      expect(isDeadlinePassed(deadline, now)).toBe(false);
    });

    it('returns true when after deadline', () => {
      const deadline = new Date('2024-12-01T12:00:00');
      const now = new Date('2024-12-31T12:00:00');
      expect(isDeadlinePassed(deadline, now)).toBe(true);
    });

    it('handles string dates', () => {
      expect(isDeadlinePassed('2024-12-01', new Date('2024-12-02'))).toBe(true);
    });

    it('handles null/undefined', () => {
      expect(isDeadlinePassed(null)).toBe(false);
      expect(isDeadlinePassed(undefined)).toBe(false);
    });
  });

  describe('isAfterCutoff', () => {
    it('returns true when after cutoff', () => {
      const now = new Date('2024-12-01T20:00:00');
      expect(isAfterCutoff('19:00', now)).toBe(true);
    });

    it('returns false when before cutoff', () => {
      const now = new Date('2024-12-01T18:00:00');
      expect(isAfterCutoff('19:00', now)).toBe(false);
    });

    it('handles edge case at exact cutoff', () => {
      const now = new Date('2024-12-01T19:00:00');
      expect(isAfterCutoff('19:00', now)).toBe(true);
    });

    it('handles null/undefined', () => {
      expect(isAfterCutoff(null)).toBe(false);
      expect(isAfterCutoff(undefined)).toBe(false);
    });
  });
});
