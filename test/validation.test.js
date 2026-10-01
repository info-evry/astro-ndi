/**
 * Validation Helper Tests
 * Tests for extracted validation helper functions
 */

import { describe, it, expect } from 'vitest';
import {
  validateRegistration,
  validateMember,
  validateMemberUpdate,
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
    expect(result.errors).toContain('Le prénom est requis');
  });

  it('should reject missing last name', () => {
    const result = validateMember({
      firstName: 'John',
      email: 'john@example.com'
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Le nom est requis');
  });

  it('should reject invalid email', () => {
    const result = validateMember({
      firstName: 'John',
      lastName: 'Doe',
      email: 'invalid'
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("L'adresse e-mail est invalide");
  });

  it('should reject invalid BAC level', () => {
    const result = validateMember({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      bacLevel: 15
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Le niveau d'études est invalide");
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
    expect(result.errors).toContain('Sélectionnez une équipe');
  });

  it('should require at least one member', () => {
    const result = validateRegistration({
      createNewTeam: true,
      teamName: 'Test Team',
      members: []
    }, defaultConfig);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Au moins un membre est requis');
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
    expect(result.errors.some(e => e.includes('plus de 15 membres'))).toBe(true);
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
    expect(result.errors).toContain("Une nouvelle équipe doit avoir au moins un chef d'équipe");
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
    expect(result.errors.some(e => e.includes('est en double'))).toBe(true);
  });
});

describe('validation messages are French', () => {
  const FRENCH_ACCENT = /[éèêàùçôîïœ]/;
  const FRENCH_WORDS = ['est', 'sont', 'doit', 'doivent', 'requis', 'requise', 'invalide', 'trop', 'entre', 'au moins',
    'sélectionnez', 'la', 'le', 'les', 'un', 'une', 'de', 'du', 'des', "d'"];
  const FRENCH_WORD = new RegExp(String.raw`(^|\s)(${FRENCH_WORDS.join('|')})(\s|$)`, 'i');
  const isFrench = (message) => FRENCH_ACCENT.test(message) || FRENCH_WORD.test(message);
  const ENGLISH = /\b(is|are|invalid|required|must|should|least|member|team|first|last|name|duplicate|maximum|leader|selection|format)\b/i;

  const member = { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' };
  const bad = (overrides) => ({ ...member, ...overrides });
  const teamOf = (members, extra = {}) => ({ createNewTeam: true, teamName: 'Les Lambdas', members, ...extra });

  /** Every message produced for a matrix of invalid payloads. */
  function messages() {
    const config = { maxTeamSize: 2, pizzaIds: ['reine'] };
    const out = [];
    for (const name of ['', '   ', 'a', null, 42]) out.push(validateTeamName(name).error);
    for (const invalid of [
      null, [], 'text', bad({ firstName: '' }), bad({ lastName: undefined }), bad({ email: '' }), bad({ email: 'nope' }),
      bad({ email: `${'x'.repeat(260)}@example.com` }), bad({ bacLevel: 99 }), bad({ bacLevel: 'abc' }),
      bad({ foodDiet: 'inconnue' }), bad({ foodDiet: 5 }), { firstName: 1, lastName: 2, email: 3 }
    ]) {
      out.push(...validateMember(invalid, { pizzaIds: ['reine'] }).errors);
    }
    out.push(...validateMemberUpdate({ firstName: ' ', lastName: '', email: 'x', bacLevel: -1, foodDiet: 'z' }, { pizzaIds: ['reine'] }).errors);
    for (const registration of [
      { createNewTeam: false, members: [member] },
      { createNewTeam: false, teamId: 'abc', members: [member] },
      teamOf([]),
      teamOf(null),
      teamOf([member], { teamName: '' }),
      teamOf([member], { teamName: 'x' }),
      teamOf([bad({ isLeader: false })]),
      teamOf([bad({ isLeader: true }), bad({ isLeader: true }), bad({ isLeader: true })]),
      teamOf([bad({ isLeader: true }), bad({ email: 'other@example.com' })]),
      teamOf([bad({ isLeader: true, email: 'broken' })])
    ]) {
      out.push(...validateRegistration(registration, config).errors);
    }
    return out;
  }

  it('has no English message left in any validator output', () => {
    const all = messages();
    expect(all.length).toBeGreaterThan(30);
    for (const message of all) {
      expect(isFrench(message), message).toBe(true);
      expect(message, message).not.toMatch(ENGLISH);
    }
  });

  it('keeps the wording consistent', () => {
    expect(validateTeamName('x').error).toBe("Le nom d'équipe doit contenir entre 2 et 128 caractères");
    expect(validateTeamName('').error).toBe("Le nom d'équipe est requis");
    expect(validateMember(bad({ email: '' })).errors).toEqual(["L'adresse e-mail est requise"]);
    expect(validateMember(bad({ firstName: '' })).errors).toEqual(['Le prénom est requis']);
    expect(validateRegistration(teamOf([]), { maxTeamSize: 2 }).errors).toEqual(['Au moins un membre est requis']);
    expect(validateRegistration(teamOf([bad({ email: 'broken', isLeader: true })]), { maxTeamSize: 2 }).errors)
      .toEqual(["Membre 1 : L'adresse e-mail est invalide"]);
  });
});
