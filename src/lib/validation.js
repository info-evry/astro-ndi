/**
 * Input validation utilities
 * Re-exports common utilities from astro-core, plus NDI-specific validators
 */

import { sanitizeString, isValidEmail, isTooLong, LIMITS } from 'astro-core/validation';
import { parsePositiveId } from 'astro-core/ids';
import { MAX_FOOD_DIET_LENGTH, isNoPizza } from '../shared/constants.js';

export { sanitizeString, isValidEmail };

/** Highest accepted BAC level (BAC+10). */
const MAX_BAC_LEVEL = 10;

const ERR_EMAIL_FORMAT = 'Invalid email format';
const ERR_BAC_LEVEL = 'Invalid BAC level';
const ERR_FOOD_CHOICE = 'Invalid food choice';

/**
 * Normalise a team password: trimmed and capped at LIMITS.teamPassword.
 *
 * This is the single policy applied wherever a team password is created,
 * changed or checked (register, join, view, payment, admin create/update), so
 * the value that was hashed is always the value that is later verified.
 * Non-strings become the empty string.
 * @param {unknown} value
 * @returns {string}
 */
/**
 * Strict boolean coercion for flags that arrive from JSON or CSV:
 * `Boolean("false")` is true, which silently turned "false"/"non" into leaders.
 */
export function toBoolean(value) {
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'oui', 'y', 'o'].includes(value.trim().toLowerCase());
  }
  return value === true || value === 1;
}

export function normalizeTeamPassword(value) {
  return sanitizeString(value, LIMITS.teamPassword);
}

/**
 * Normalise a team description (optional text, capped at LIMITS.description).
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeTeamDescription(value) {
  return sanitizeString(value, LIMITS.description);
}

/**
 * Validate team name
 */
export function validateTeamName(name) {
  const sanitized = sanitizeString(name, LIMITS.teamName);
  if (!sanitized) return { valid: false, error: 'Team name is required' };
  if (sanitized.length < 2) return { valid: false, error: 'Team name must be at least 2 characters' };
  return { valid: true, value: sanitized };
}

// ---------------------------------------------------------------------------
// Member fields (each returns `{ value }` or `{ error }`)
// ---------------------------------------------------------------------------

function nameField(value, label) {
  const name = sanitizeString(value, LIMITS.name);
  return name ? { value: name } : { error: `${label} is required` };
}

function emailField(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return { error: 'Email is required' };
  // Over-long addresses are rejected rather than truncated into another address.
  if (isTooLong(raw, LIMITS.email)) return { error: ERR_EMAIL_FORMAT };
  const email = raw.toLowerCase();
  return isValidEmail(email) ? { value: email } : { error: ERR_EMAIL_FORMAT };
}

function bacLevelField(value) {
  if (value === undefined || value === null || value === '') return { value: 0 };
  let level = Number.NaN;
  if (typeof value === 'number') {
    level = value;
  } else if (typeof value === 'string' && /^\d{1,3}$/.test(value.trim())) {
    level = Number(value);
  }
  return Number.isInteger(level) && level >= 0 && level <= MAX_BAC_LEVEL
    ? { value: level }
    : { error: ERR_BAC_LEVEL };
}

/**
 * @param {unknown} value
 * @param {Iterable<string>|undefined} pizzaIds - Configured pizza ids; the check is skipped when undefined
 */
function foodDietField(value, pizzaIds) {
  if (value === undefined || value === null) return { value: '' };
  if (typeof value !== 'string') return { error: ERR_FOOD_CHOICE };
  const foodDiet = sanitizeString(value, MAX_FOOD_DIET_LENGTH);
  if (pizzaIds && !isNoPizza(foodDiet) && !new Set(pizzaIds).has(foodDiet)) {
    return { error: ERR_FOOD_CHOICE };
  }
  return { value: foodDiet };
}

/**
 * Validate member data.
 *
 * @param {unknown} member
 * @param {{ pizzaIds?: Iterable<string> }} [options] - `pizzaIds`: the configured
 *   pizza ids. When given, `foodDiet` must be one of them or mean "no pizza".
 */
export function validateMember(member, { pizzaIds } = {}) {
  if (!member || typeof member !== 'object' || Array.isArray(member)) {
    return { valid: false, errors: ['Invalid member data'] };
  }

  const fields = {
    firstName: nameField(member.firstName, 'First name'),
    lastName: nameField(member.lastName, 'Last name'),
    email: emailField(member.email),
    bacLevel: bacLevelField(member.bacLevel),
    foodDiet: foodDietField(member.foodDiet, pizzaIds)
  };

  const errors = Object.values(fields).flatMap(field => (field.error ? [field.error] : []));
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    value: {
      firstName: fields.firstName.value,
      lastName: fields.lastName.value,
      email: fields.email.value,
      bacLevel: fields.bacLevel.value,
      isLeader: toBoolean(member.isLeader),
      foodDiet: fields.foodDiet.value
    }
  };
}

/**
 * Validate a partial member update (admin PUT): only the keys that are present
 * are checked and returned, with the same rules as `validateMember`.
 *
 * @param {Record<string, unknown>} updates
 * @param {{ pizzaIds?: Iterable<string> }} [options]
 */
export function validateMemberUpdate(updates, { pizzaIds } = {}) {
  const rules = {
    firstName: (v) => nameField(v, 'First name'),
    lastName: (v) => nameField(v, 'Last name'),
    email: emailField,
    bacLevel: bacLevelField,
    foodDiet: (v) => foodDietField(v, pizzaIds)
  };

  const value = {};
  const errors = [];
  for (const [key, rule] of Object.entries(rules)) {
    if (!Object.hasOwn(updates, key) || updates[key] === undefined) continue;
    const field = rule(updates[key]);
    if (field.error) {
      errors.push(field.error);
    } else {
      value[key] = field.value;
    }
  }
  if (Object.hasOwn(updates, 'isLeader') && updates.isLeader !== undefined) {
    value.isLeader = toBoolean(updates.isLeader);
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true, value };
}

/**
 * Validate team info in registration
 */
function validateTeamInfo(data, errors) {
  if (data.createNewTeam) {
    const teamValidation = validateTeamName(data.teamName);
    if (!teamValidation.valid) {
      errors.push(teamValidation.error);
    }
  } else if (parsePositiveId(data.teamId) === null) {
    errors.push('Team selection is required');
  }
}

/**
 * Validate and deduplicate members list
 */
function validateMembersList(members, errors, options) {
  const validatedMembers = [];
  const seenNames = new Set();

  for (const [i, member] of members.entries()) {
    const memberValidation = validateMember(member, options);
    if (!memberValidation.valid) {
      errors.push(`Member ${i + 1}: ${memberValidation.errors.join(', ')}`);
      continue;
    }

    const nameKey = `${memberValidation.value.firstName.toLowerCase()}|${memberValidation.value.lastName.toLowerCase()}`;
    if (seenNames.has(nameKey)) {
      errors.push(`Duplicate member: ${memberValidation.value.firstName} ${memberValidation.value.lastName}`);
    } else {
      seenNames.add(nameKey);
      validatedMembers.push(memberValidation.value);
    }
  }

  return validatedMembers;
}

/**
 * Validate registration request
 * @param {Record<string, any>} data
 * @param {{ maxTeamSize?: number|string, pizzaIds?: Iterable<string> }} config
 */
export function validateRegistration(data, config) {
  const errors = [];
  const maxTeamSize = Number.parseInt(config.maxTeamSize, 10) || 15;

  validateTeamInfo(data, errors);

  if (!Array.isArray(data.members) || data.members.length === 0) {
    errors.push('At least one member is required');
    return { valid: false, errors };
  }

  if (data.members.length > maxTeamSize) {
    errors.push(`Maximum ${maxTeamSize} members allowed`);
  }

  if (data.createNewTeam && !data.members.some(m => m?.isLeader)) {
    errors.push('New team must have at least one leader');
  }

  // A hostile request cannot make us validate more members than a team may hold.
  const toValidate = data.members.slice(0, maxTeamSize);
  const validatedMembers = validateMembersList(toValidate, errors, { pizzaIds: config.pizzaIds });

  if (errors.length === 0) {
    return { valid: true, members: validatedMembers };
  }

  return { valid: false, errors };
}
