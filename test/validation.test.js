import { describe, it, expect } from 'vitest';
import {
  sanitizeString,
  isValidEmail,
  validateTeamName,
  validateMember,
  validateRegistration
} from '../src/lib/validation.js';

describe('sanitizeString', () => {
  it('should trim whitespace', () => {
    expect(sanitizeString('  hello  ')).toBe('hello');
  });

  it('should limit length', () => {
    expect(sanitizeString('hello world', 5)).toBe('hello');
  });

  it('should return empty string for non-strings', () => {
    expect(sanitizeString(null)).toBe('');
    expect(sanitizeString(undefined)).toBe('');
    expect(sanitizeString(123)).toBe('');
  });
});

describe('isValidEmail', () => {
  it('should accept valid emails', () => {
    expect(isValidEmail('test@example.com')).toBe(true);
    expect(isValidEmail('user.name@domain.org')).toBe(true);
    expect(isValidEmail('user+tag@example.co.uk')).toBe(true);
  });

  it('should reject invalid emails', () => {
    expect(isValidEmail('notanemail')).toBe(false);
    expect(isValidEmail('missing@domain')).toBe(false);
    expect(isValidEmail('@nodomain.com')).toBe(false);
    expect(isValidEmail('spaces in@email.com')).toBe(false);
    expect(isValidEmail('')).toBe(false);
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

  it('should trim team names', () => {
    const result = validateTeamName('  Team Beta  ');
    expect(result.valid).toBe(true);
    expect(result.value).toBe('Team Beta');
  });
});

describe('validateMember', () => {
  const validMember = {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    bacLevel: 3,
    isLeader: true,
    foodDiet: 'margherita'
  };

  it('should accept valid member data', () => {
    const result = validateMember(validMember);
    expect(result.valid).toBe(true);
    expect(result.value.firstName).toBe('John');
    expect(result.value.lastName).toBe('Doe');
    expect(result.value.email).toBe('john@example.com');
    expect(result.value.bacLevel).toBe(3);
    expect(result.value.isLeader).toBe(true);
    expect(result.value.foodDiet).toBe('margherita');
  });

  it('should reject missing first name', () => {
    const result = validateMember({ ...validMember, firstName: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('First name is required');
  });

  it('should reject missing last name', () => {
    const result = validateMember({ ...validMember, lastName: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Last name is required');
  });

  it('should reject missing email', () => {
    const result = validateMember({ ...validMember, email: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Email is required');
  });

  it('should reject invalid email', () => {
    const result = validateMember({ ...validMember, email: 'notanemail' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid email format');
  });

  it('should reject invalid BAC level', () => {
    const result = validateMember({ ...validMember, bacLevel: 15 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid BAC level');
  });

  it('should lowercase email', () => {
    const result = validateMember({ ...validMember, email: 'John@Example.COM' });
    expect(result.valid).toBe(true);
    expect(result.value.email).toBe('john@example.com');
  });
});

describe('validateRegistration', () => {
  const validNewTeamData = {
    createNewTeam: true,
    teamName: 'Team Alpha',
    members: [
      {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        bacLevel: 3,
        isLeader: true,
        foodDiet: 'margherita'
      }
    ]
  };

  const validJoinTeamData = {
    createNewTeam: false,
    teamId: 1,
    members: [
      {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        bacLevel: 2,
        isLeader: false,
        foodDiet: 'none'
      }
    ]
  };

  const config = { maxTeamSize: 15 };

  it('should accept valid new team registration', () => {
    const result = validateRegistration(validNewTeamData, config);
    expect(result.valid).toBe(true);
    expect(result.members).toHaveLength(1);
  });

  it('should accept valid join team registration', () => {
    const result = validateRegistration(validJoinTeamData, config);
    expect(result.valid).toBe(true);
  });

  it('should reject new team without leader', () => {
    const data = {
      ...validNewTeamData,
      members: [{ ...validNewTeamData.members[0], isLeader: false }]
    };
    const result = validateRegistration(data, config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('New team must have at least one leader');
  });

  it('should reject empty members array', () => {
    const data = { ...validNewTeamData, members: [] };
    const result = validateRegistration(data, config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('At least one member is required');
  });

  it('should reject too many members', () => {
    const members = Array(20).fill(null).map((_, i) => ({
      firstName: `User${i}`,
      lastName: `Test${i}`,
      email: `user${i}@example.com`,
      bacLevel: 1,
      isLeader: i === 0,
      foodDiet: 'none'
    }));
    const data = { ...validNewTeamData, members };
    const result = validateRegistration(data, config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Maximum 15 members allowed');
  });

  it('should reject duplicate members', () => {
    const data = {
      ...validNewTeamData,
      members: [
        validNewTeamData.members[0],
        { ...validNewTeamData.members[0], email: 'different@example.com' }
      ]
    };
    const result = validateRegistration(data, config);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Duplicate member'))).toBe(true);
  });

  it('should reject join team without team ID', () => {
    const data = { ...validJoinTeamData, teamId: null };
    const result = validateRegistration(data, config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Team selection is required');
  });
});
