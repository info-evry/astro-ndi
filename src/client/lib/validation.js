/**
 * Client-side validation utilities
 * Pure functions that can be tested without DOM
 */

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  // Basic email regex - allows most valid emails
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Validate team name
 * @param {string} name - Team name to validate
 * @param {number} minLength - Minimum length (default: 2)
 * @param {number} maxLength - Maximum length (default: 100)
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateTeamName(name, minLength = 2, maxLength = 100) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Le nom d\'équipe est requis' };
  }

  const trimmed = name.trim();

  if (trimmed.length < minLength) {
    return { valid: false, error: `Le nom doit avoir au moins ${minLength} caractères` };
  }

  if (trimmed.length > maxLength) {
    return { valid: false, error: `Le nom ne peut pas dépasser ${maxLength} caractères` };
  }

  return { valid: true };
}

/**
 * Validate member data
 * @param {object} member - Member data
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateMember(member) {
  const errors = [];

  if (!member.firstName?.trim()) {
    errors.push('Le prénom est requis');
  }

  if (!member.lastName?.trim()) {
    errors.push('Le nom est requis');
  }

  if (!member.email?.trim()) {
    errors.push('L\'email est requis');
  } else if (!isValidEmail(member.email)) {
    errors.push('L\'email n\'est pas valide');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate settings input
 * @param {string} key - Setting key
 * @param {*} value - Setting value
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateSetting(key, value) {
  switch (key) {
    case 'max_team_size':
    case 'max_total_participants':
    case 'min_team_size': {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 1) {
        return { valid: false, error: 'Doit être un nombre positif' };
      }
      if (key === 'max_team_size' && num > 100) {
        return { valid: false, error: 'Maximum 100' };
      }
      if (key === 'max_total_participants' && num > 10000) {
        return { valid: false, error: 'Maximum 10000' };
      }
      return { valid: true };
    }

    case 'price_tier1':
    case 'price_tier2':
    case 'price_asso_member':
    case 'price_non_member':
    case 'price_late': {
      const num = parseFloat(value);
      if (isNaN(num) || num < 0) {
        return { valid: false, error: 'Prix invalide' };
      }
      return { valid: true };
    }

    case 'tier1_cutoff_days': {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 1 || num > 30) {
        return { valid: false, error: 'Doit être entre 1 et 30' };
      }
      return { valid: true };
    }

    case 'registration_deadline': {
      if (!value) {
        return { valid: true }; // Optional field
      }
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        return { valid: false, error: 'Date invalide' };
      }
      return { valid: true };
    }

    case 'late_cutoff_time': {
      if (!value) {
        return { valid: true };
      }
      const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
      if (!timeRegex.test(value)) {
        return { valid: false, error: 'Format invalide (HH:MM)' };
      }
      return { valid: true };
    }

    default:
      return { valid: true };
  }
}

/**
 * Validate all settings
 * @param {object} settings - Settings object
 * @returns {{ valid: boolean, errors: object }}
 */
export function validateAllSettings(settings) {
  const errors = {};
  let valid = true;

  for (const [key, value] of Object.entries(settings)) {
    const result = validateSetting(key, value);
    if (!result.valid) {
      errors[key] = result.error;
      valid = false;
    }
  }

  return { valid, errors };
}

/**
 * Sanitize string input
 * @param {string} str - String to sanitize
 * @param {number} maxLength - Maximum length
 * @returns {string} Sanitized string
 */
export function sanitizeString(str, maxLength = 1000) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().substring(0, maxLength);
}

/**
 * Parse and validate integer
 * @param {*} value - Value to parse
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {number} defaultValue - Default if invalid
 * @returns {number} Parsed integer or default
 */
export function parseInteger(value, min = 0, max = Infinity, defaultValue = 0) {
  const num = parseInt(value, 10);
  if (isNaN(num)) return defaultValue;
  if (num < min) return min;
  if (num > max) return max;
  return num;
}

/**
 * Check if deadline has passed
 * @param {string|Date} deadline - Deadline datetime
 * @param {Date} now - Current time (optional, for testing)
 * @returns {boolean} True if deadline has passed
 */
export function isDeadlinePassed(deadline, now = new Date()) {
  if (!deadline) return false;
  const deadlineDate = deadline instanceof Date ? deadline : new Date(deadline);
  if (isNaN(deadlineDate.getTime())) return false;
  return now >= deadlineDate;
}

/**
 * Check if time is after cutoff
 * @param {string} cutoffTime - Cutoff time in HH:MM format
 * @param {Date} now - Current time (optional, for testing)
 * @returns {boolean} True if after cutoff
 */
export function isAfterCutoff(cutoffTime, now = new Date()) {
  if (!cutoffTime) return false;

  const [hours, minutes] = cutoffTime.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) return false;

  const cutoff = new Date(now);
  cutoff.setHours(hours, minutes, 0, 0);

  return now >= cutoff;
}
