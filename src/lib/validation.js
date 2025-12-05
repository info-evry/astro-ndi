/**
 * Input validation utilities
 */

/**
 * Sanitize string input - trim and limit length
 */
export function sanitizeString(str, maxLength = 256) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLength);
}

/**
 * Validate email format
 * Uses a simple pattern that avoids ReDoS vulnerability
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string' || email.length > 254) return false;
  const atIndex = email.indexOf('@');
  const dotIndex = email.lastIndexOf('.');
  return atIndex > 0 && dotIndex > atIndex + 1 && dotIndex < email.length - 1 && !email.includes(' ');
}

/**
 * Validate team name
 */
export function validateTeamName(name) {
  const sanitized = sanitizeString(name, 128);
  if (!sanitized) return { valid: false, error: 'Team name is required' };
  if (sanitized.length < 2) return { valid: false, error: 'Team name must be at least 2 characters' };
  return { valid: true, value: sanitized };
}

/**
 * Validate member data
 */
export function validateMember(member) {
  const errors = [];

  const firstName = sanitizeString(member.firstName, 128);
  const lastName = sanitizeString(member.lastName, 128);
  const email = sanitizeString(member.email, 256).toLowerCase();
  const bacLevel = parseInt(member.bacLevel, 10) || 0;
  const isLeader = Boolean(member.isLeader);
  const foodDiet = sanitizeString(member.foodDiet, 64);

  if (!firstName) errors.push('First name is required');
  if (!lastName) errors.push('Last name is required');
  if (!email) errors.push('Email is required');
  else if (!isValidEmail(email)) errors.push('Invalid email format');
  if (bacLevel < 0 || bacLevel > 10) errors.push('Invalid BAC level');

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    value: { firstName, lastName, email, bacLevel, isLeader, foodDiet }
  };
}

/**
 * Validate registration request
 */
export function validateRegistration(data, config) {
  const errors = [];
  const maxTeamSize = parseInt(config.maxTeamSize, 10) || 15;

  // Validate team info
  if (data.createNewTeam) {
    const teamValidation = validateTeamName(data.teamName);
    if (!teamValidation.valid) {
      errors.push(teamValidation.error);
    }
  } else if (!data.teamId) {
    errors.push('Team selection is required');
  }

  // Validate members
  if (!Array.isArray(data.members) || data.members.length === 0) {
    errors.push('At least one member is required');
  } else {
    if (data.members.length > maxTeamSize) {
      errors.push(`Maximum ${maxTeamSize} members allowed`);
    }

    // Check for leader in new team
    if (data.createNewTeam) {
      const hasLeader = data.members.some(m => m.isLeader);
      if (!hasLeader) {
        errors.push('New team must have at least one leader');
      }
    }

    // Validate each member
    const validatedMembers = [];
    const seenNames = new Set();

    for (let i = 0; i < data.members.length; i++) {
      const memberValidation = validateMember(data.members[i]);
      if (!memberValidation.valid) {
        errors.push(`Member ${i + 1}: ${memberValidation.errors.join(', ')}`);
      } else {
        const nameKey = `${memberValidation.value.firstName.toLowerCase()}|${memberValidation.value.lastName.toLowerCase()}`;
        if (seenNames.has(nameKey)) {
          errors.push(`Duplicate member: ${memberValidation.value.firstName} ${memberValidation.value.lastName}`);
        } else {
          seenNames.add(nameKey);
          validatedMembers.push(memberValidation.value);
        }
      }
    }

    if (errors.length === 0) {
      return { valid: true, members: validatedMembers };
    }
  }

  return { valid: false, errors };
}
