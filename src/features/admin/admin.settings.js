/**
 * Admin settings API handlers
 */

import { json, error } from 'astro-core/router';
import { verifyAdmin } from '../../shared/auth.js';
import { readJsonObject, INVALID_JSON_MESSAGE } from '../../shared/http.js';
import * as settingsDb from '../../database/db.settings.js';

// Valid setting keys that can be modified
const VALID_KEYS = new Set([
  'max_team_size',
  'max_total_participants',
  'min_team_size',
  'pizzas',
  'bac_levels',
  'school_name',
  'price_asso_member',
  'price_non_member',
  'price_late',
  'late_cutoff_time',
  // Online payment settings
  'price_tier1',
  'price_tier2',
  'tier1_cutoff_days',
  'payment_enabled',
  'registration_deadline',
  // GDPR settings
  'gdpr_retention_years'
]);

/**
 * GET /api/admin/settings - Get all settings
 */
export async function getSettings(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    // Check if settings table exists
    const tableExists = await settingsDb.settingsTableExists(env.DB);
    if (!tableExists) {
      return error('Settings table not found. Please run the migration.', 500);
    }

    const settings = await settingsDb.getAllSettings(env.DB);

    // Parse JSON values for pizzas and bac_levels
    const parsed = {};
    for (const setting of settings) {
      if (setting.key === 'pizzas' || setting.key === 'bac_levels') {
        try {
          parsed[setting.key] = JSON.parse(setting.value);
        } catch {
          parsed[setting.key] = setting.value;
        }
      } else {
        parsed[setting.key] = setting.value;
      }
    }

    return json({ settings: parsed, raw: settings });
  } catch (error_) {
    console.error('Error fetching settings:', error_);
    return error('Failed to fetch settings', 500);
  }
}

/**
 * PUT /api/admin/settings - Update multiple settings
 */
export async function updateSettings(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const updates = await readJsonObject(request);
    if (!updates) {
      return error(INVALID_JSON_MESSAGE, 400);
    }

    // Validate all keys first
    const invalidKeys = Object.keys(updates).filter(key => !VALID_KEYS.has(key));
    if (invalidKeys.length > 0) {
      return error(`Invalid setting keys: ${invalidKeys.join(', ')}`, 400);
    }

    // Validate each setting value and collect converted values
    const validatedUpdates = {};
    for (const [key, value] of Object.entries(updates)) {
      const validation = validateSetting(key, value);
      if (!validation.valid) {
        return error(`Invalid value for ${key}: ${validation.error}`, 400);
      }
      // Use converted value if provided, otherwise use original
      validatedUpdates[key] = validation.value === undefined ? value : validation.value;
    }

    // Apply updates with validated/converted values
    for (const [key, value] of Object.entries(validatedUpdates)) {
      await (key === 'pizzas' || key === 'bac_levels' ? settingsDb.setSettingJson(env.DB, key, value) : settingsDb.setSetting(env.DB, key, String(value)));
    }

    return json({ success: true, updated: Object.keys(updates) });
  } catch (error_) {
    console.error('Error updating settings:', error_);
    return error('Failed to update settings', 500);
  }
}

/**
 * Validate a number is within range
 */
function validateNumber(value, min, max) {
  // Accept integers and plain integer strings only ("10abc", 1.5, [5] and
  // booleans are rejected rather than silently truncated).
  let num = Number.NaN;
  if (typeof value === 'number') {
    num = value;
  } else if (typeof value === 'string' && /^\s*-?\d+\s*$/.test(value)) {
    num = Number.parseInt(value, 10);
  }
  if (!Number.isInteger(num) || num < min || num > max) {
    return { valid: false, error: `Must be a number between ${min} and ${max}` };
  }
  return { valid: true, value: num };
}

/**
 * Validate pizzas array
 */
function validatePizzas(value) {
  if (!Array.isArray(value)) {
    return { valid: false, error: 'Must be an array' };
  }
  for (const [i, pizza] of value.entries()) {
    if (!pizza || typeof pizza !== 'object') {
      return { valid: false, error: `Pizza at index ${i} must be an object` };
    }
    if (!pizza.id || typeof pizza.id !== 'string') {
      return { valid: false, error: `Pizza at index ${i} must have a string 'id'` };
    }
    if (!pizza.name || typeof pizza.name !== 'string') {
      return { valid: false, error: `Pizza at index ${i} must have a string 'name'` };
    }
    if (pizza.description !== undefined && typeof pizza.description !== 'string') {
      return { valid: false, error: `Pizza at index ${i} 'description' must be a string` };
    }
  }
  return { valid: true };
}

/**
 * Validate BAC levels array
 */
function validateBacLevels(value) {
  if (!Array.isArray(value)) {
    return { valid: false, error: 'Must be an array' };
  }
  for (const [i, level] of value.entries()) {
    if (!level || typeof level !== 'object') {
      return { valid: false, error: `BAC level at index ${i} must be an object` };
    }
    if (typeof level.value !== 'number') {
      return { valid: false, error: `BAC level at index ${i} must have a numeric 'value'` };
    }
    if (!level.label || typeof level.label !== 'string') {
      return { valid: false, error: `BAC level at index ${i} must have a string 'label'` };
    }
  }
  return { valid: true };
}

// Validator functions for each setting key
const VALIDATORS = {
  max_team_size: (v) => validateNumber(v, 1, 100),
  max_total_participants: (v) => validateNumber(v, 1, 10_000),
  min_team_size: (v) => validateNumber(v, 1, 50),
  pizzas: validatePizzas,
  bac_levels: validateBacLevels,
  school_name: (v) => {
    if (typeof v !== 'string' || v.length > 256) {
      return { valid: false, error: 'Must be a string up to 256 characters' };
    }
    return { valid: true };
  },
  price_asso_member: (v) => validateNumber(v, 0, 100_000),
  price_non_member: (v) => validateNumber(v, 0, 100_000),
  price_late: (v) => validateNumber(v, 0, 100_000),
  late_cutoff_time: (v) => {
    if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) {
      return { valid: false, error: 'Must be a time in HH:MM format' };
    }
    return { valid: true };
  },
  // Online payment settings validators
  price_tier1: (v) => validateNumber(v, 0, 100_000),
  price_tier2: (v) => validateNumber(v, 0, 100_000),
  tier1_cutoff_days: (v) => validateNumber(v, 1, 365),
  payment_enabled: (v) => {
    // Accept both string and boolean values
    if (typeof v === 'boolean') {
      return { valid: true, value: String(v) };
    }
    if (typeof v === 'string' && ['true', 'false'].includes(v)) {
      return { valid: true };
    }
    return { valid: false, error: 'Must be "true" or "false"' };
  },
  registration_deadline: (v) => {
    if (typeof v !== 'string') {
      return { valid: false, error: 'Must be a string' };
    }
    // Allow empty string (no deadline set)
    if (v === '') return { valid: true };
    // Validate ISO date format
    const date = new Date(v);
    if (Number.isNaN(date.getTime())) {
      return { valid: false, error: 'Must be a valid ISO date string' };
    }
    return { valid: true };
  },
  gdpr_retention_years: (v) => validateNumber(v, 1, 10)
};

/**
 * Validate a setting value based on its key
 */
function validateSetting(key, value) {
  const validator = VALIDATORS[key];
  if (!validator) {
    return { valid: false, error: 'Unknown setting key' };
  }
  return validator(value);
}
