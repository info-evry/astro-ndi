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
  const trimmed = email.trim();
  // Limit length to prevent ReDoS
  if (trimmed.length > 254) return false;
  // Basic email check - simple indexOf-based validation
  const atIndex = trimmed.indexOf('@');
  if (atIndex < 1) return false;
  const dotIndex = trimmed.lastIndexOf('.');
  if (dotIndex <= atIndex + 1 || dotIndex === trimmed.length - 1) return false;
  // No spaces allowed
  if (trimmed.includes(' ')) return false;
  return true;
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

// Helper validators
const VALID_RESULT = { valid: true };

function validatePositiveInt(value, max) {
  const num = Number.parseInt(value, 10);
  if (Number.isNaN(num) || num < 1) {
    return { valid: false, error: 'Doit être un nombre positif' };
  }
  if (max && num > max) {
    return { valid: false, error: `Maximum ${max}` };
  }
  return VALID_RESULT;
}

function validatePrice(value) {
  const num = Number.parseFloat(value);
  if (Number.isNaN(num) || num < 0) {
    return { valid: false, error: 'Prix invalide' };
  }
  return VALID_RESULT;
}

function validateDate(value) {
  if (!value) return VALID_RESULT;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { valid: false, error: 'Date invalide' };
  }
  return VALID_RESULT;
}

function validateTime(value) {
  if (!value) return VALID_RESULT;
  const timeRegex = /^([01]?\d|2[0-3]):([0-5]\d)$/;
  if (!timeRegex.test(value)) {
    return { valid: false, error: 'Format invalide (HH:MM)' };
  }
  return VALID_RESULT;
}

// Setting key to max value mapping
const SIZE_LIMITS = {
  max_team_size: 100,
  max_total_participants: 10_000,
  min_team_size: undefined
};

/**
 * Validate settings input
 * @param {string} key - Setting key
 * @param {*} value - Setting value
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateSetting(key, value) {
  // Size/capacity settings
  if (key in SIZE_LIMITS) {
    return validatePositiveInt(value, SIZE_LIMITS[key]);
  }

  // Price settings
  if (key.startsWith('price_')) {
    return validatePrice(value);
  }

  // Other specific settings
  switch (key) {
    case 'tier1_cutoff_days': {
      const num = Number.parseInt(value, 10);
      if (Number.isNaN(num) || num < 1 || num > 30) {
        return { valid: false, error: 'Doit être entre 1 et 30' };
      }
      return VALID_RESULT;
    }
    case 'registration_deadline': {
      return validateDate(value);
    }
    case 'late_cutoff_time': {
      return validateTime(value);
    }
    default: {
      return VALID_RESULT;
    }
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
  return str.trim().slice(0, Math.max(0, maxLength));
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
  const num = Number.parseInt(value, 10);
  if (Number.isNaN(num)) return defaultValue;
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
  if (Number.isNaN(deadlineDate.getTime())) return false;
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
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return false;

  const cutoff = new Date(now);
  cutoff.setHours(hours, minutes, 0, 0);

  return now >= cutoff;
}
