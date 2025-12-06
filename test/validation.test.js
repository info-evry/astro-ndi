/**
 * Validation Helper Tests
 * Tests for extracted validation helper functions
 */

import { describe, it, expect } from 'vitest';
import {
  validateRegistration,
  validateMember,
  validateTeamName,
  sanitizeString,
  isValidEmail
} from '../src/lib/validation.js';

describe('sanitizeString', () => {
  it('should trim whitespace', () => {
    expect(sanitizeString('  hello  ')).toBe('hello');
  });

  it('should limit length', () => {
    const longString = 'a'.repeat(300);
    expect(sanitizeString(longString, 10)).toBe('a'.repeat(10));
  });

  it('should return empty string for non-string input', () => {
    expect(sanitizeString(null)).toBe('');
    expect(sanitizeString()).toBe('');
    expect(sanitizeString(123)).toBe('');
  });
});

describe('isValidEmail', () => {
  it('should accept valid emails', () => {
    expect(isValidEmail('test@example.com')).toBe(true);
    expect(isValidEmail('user.name@domain.co.uk')).toBe(true);
    expect(isValidEmail('user+tag@example.org')).toBe(true);
  });

  it('should reject invalid emails', () => {
    expect(isValidEmail('notanemail')).toBe(false);
    expect(isValidEmail('@example.com')).toBe(false);
    expect(isValidEmail('test@')).toBe(false);
    expect(isValidEmail('test@example')).toBe(false);
    expect(isValidEmail('test @example.com')).toBe(false);
  });

  it('should reject emails over 254 characters', () => {
    const longEmail = 'a'.repeat(250) + '@example.com';
    expect(isValidEmail(longEmail)).toBe(false);
  });

  it('should handle null/undefined', () => {
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail()).toBe(false);
  });
});

describe('validateTeamName', () => {
  it('should accept valid team names', () => {
    const result = validateTeamName('Team Alpha');
    expect(result.valid).toBe(true);
    expect(result.value).toBe('Team Alpha');
  });

  it('should reject empty team names', () => {
    expect(validateTeamName('').valid).toBe(false);
    expect(validateTeamName('   ').valid).toBe(false);
  });

  it('should reject team names shorter than 2 characters', () => {
    expect(validateTeamName('A').valid).toBe(false);
  });

  it('should truncate long team names', () => {
    const longName = 'A'.repeat(200);
    const result = validateTeamName(longName);
    expect(result.valid).toBe(true);
    expect(result.value.length).toBeLessThanOrEqual(128);
  });
});

describe('validateMember', () => {
  it('should validate a complete member', () => {
    const result = validateMember({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      bacLevel: 3,
      isLeader: true,
      foodDiet: 'margherita'
    });

    expect(result.valid).toBe(true);
    expect(result.value.firstName).toBe('John');
    expect(result.value.lastName).toBe('Doe');
    expect(result.value.email).toBe('john@example.com');
    expect(result.value.bacLevel).toBe(3);
    expect(result.value.isLeader).toBe(true);
  });

  it('should reject missing first name', () => {
    const result = validateMember({
      lastName: 'Doe',
      email: 'john@example.com'
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('First name is required');
  });

  it('should reject missing last name', () => {
    const result = validateMember({
      firstName: 'John',
      email: 'john@example.com'
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Last name is required');
  });

  it('should reject invalid email', () => {
    const result = validateMember({
      firstName: 'John',
      lastName: 'Doe',
      email: 'invalid'
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid email format');
  });

  it('should reject invalid BAC level', () => {
    const result = validateMember({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      bacLevel: 15
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid BAC level');
  });
});

describe('validateRegistration', () => {
  const defaultConfig = { maxTeamSize: 15, minTeamSize: 2 };

  it('should validate a new team registration', () => {
    const result = validateRegistration({
      createNewTeam: true,
      teamName: 'Test Team',
      members: [
        { firstName: 'John', lastName: 'Doe', email: 'john@example.com', isLeader: true }
      ]
    }, defaultConfig);

    expect(result.valid).toBe(true);
    expect(result.members).toHaveLength(1);
  });

  it('should require team ID when not creating new team', () => {
    const result = validateRegistration({
      createNewTeam: false,
      members: [
        { firstName: 'John', lastName: 'Doe', email: 'john@example.com' }
      ]
    }, defaultConfig);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Team selection is required');
  });

  it('should require at least one member', () => {
    const result = validateRegistration({
      createNewTeam: true,
      teamName: 'Test Team',
      members: []
    }, defaultConfig);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('At least one member is required');
  });

  it('should reject exceeding max team size', () => {
    const members = Array.from({ length: 20 }, (_, i) => ({
      firstName: 'User' + i,
      lastName: 'Test',
      email: 'user' + i + '@example.com'
    }));

    const result = validateRegistration({
      createNewTeam: true,
      teamName: 'Test Team',
      members
    }, defaultConfig);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Maximum'))).toBe(true);
  });

  it('should require leader for new team', () => {
    const result = validateRegistration({
      createNewTeam: true,
      teamName: 'Test Team',
      members: [
        { firstName: 'John', lastName: 'Doe', email: 'john@example.com', isLeader: false }
      ]
    }, defaultConfig);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('New team must have at least one leader');
  });

  it('should detect duplicate members', () => {
    const result = validateRegistration({
      createNewTeam: true,
      teamName: 'Test Team',
      members: [
        { firstName: 'John', lastName: 'Doe', email: 'john@example.com', isLeader: true },
        { firstName: 'John', lastName: 'Doe', email: 'john2@example.com' }
      ]
    }, defaultConfig);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Duplicate'))).toBe(true);
  });
});
