/**
 * Admin settings API handlers
 */

import { json, error } from '../../shared/response.js';
import { verifyAdmin } from '../../shared/auth.js';
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
  'late_cutoff_time'
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
  } catch (err) {
    console.error('Error fetching settings:', err);
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
    const updates = await request.json();

    // Validate all keys first
    const invalidKeys = Object.keys(updates).filter(key => !VALID_KEYS.has(key));
    if (invalidKeys.length > 0) {
      return error(`Invalid setting keys: ${invalidKeys.join(', ')}`, 400);
    }

    // Validate each setting value
    for (const [key, value] of Object.entries(updates)) {
      const validation = validateSetting(key, value);
      if (!validation.valid) {
        return error(`Invalid value for ${key}: ${validation.error}`, 400);
      }
    }

    // Apply updates
    for (const [key, value] of Object.entries(updates)) {
      await (key === 'pizzas' || key === 'bac_levels' ? settingsDb.setSettingJson(env.DB, key, value) : settingsDb.setSetting(env.DB, key, String(value)));
    }

    return json({ success: true, updated: Object.keys(updates) });
  } catch (err) {
    console.error('Error updating settings:', err);
    return error('Failed to update settings', 500);
  }
}

/**
 * Validate a number is within range
 */
function validateNumber(value, min, max) {
  const num = Number.parseInt(value, 10);
  if (Number.isNaN(num) || num < min || num > max) {
    return { valid: false, error: `Must be a number between ${min} and ${max}` };
  }
  return { valid: true };
}

/**
 * Validate pizzas array
 */
function validatePizzas(value) {
  if (!Array.isArray(value)) {
    return { valid: false, error: 'Must be an array' };
  }
  for (const [i, pizza] of value.entries()) {
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
    if (typeof v !== 'string' || !/^\d{2}:\d{2}$/.test(v)) {
      return { valid: false, error: 'Must be a time in HH:MM format' };
    }
    return { valid: true };
  }
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
