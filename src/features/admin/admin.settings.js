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
      if (key === 'pizzas' || key === 'bac_levels') {
        await settingsDb.setSettingJson(env.DB, key, value);
      } else {
        await settingsDb.setSetting(env.DB, key, String(value));
      }
    }

    return json({ success: true, updated: Object.keys(updates) });
  } catch (err) {
    console.error('Error updating settings:', err);
    return error('Failed to update settings', 500);
  }
}

/**
 * Validate a setting value based on its key
 */
function validateSetting(key, value) {
  switch (key) {
    case 'max_team_size': {
      const maxTeam = parseInt(value, 10);
      if (isNaN(maxTeam) || maxTeam < 1 || maxTeam > 100) {
        return { valid: false, error: 'Must be a number between 1 and 100' };
      }
      break;
    }

    case 'max_total_participants': {
      const maxTotal = parseInt(value, 10);
      if (isNaN(maxTotal) || maxTotal < 1 || maxTotal > 10000) {
        return { valid: false, error: 'Must be a number between 1 and 10000' };
      }
      break;
    }

    case 'min_team_size': {
      const minTeam = parseInt(value, 10);
      if (isNaN(minTeam) || minTeam < 1 || minTeam > 50) {
        return { valid: false, error: 'Must be a number between 1 and 50' };
      }
      break;
    }

    case 'pizzas': {
      if (!Array.isArray(value)) {
        return { valid: false, error: 'Must be an array' };
      }
      for (let i = 0; i < value.length; i++) {
        const pizza = value[i];
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
      break;
    }

    case 'bac_levels': {
      if (!Array.isArray(value)) {
        return { valid: false, error: 'Must be an array' };
      }
      for (let i = 0; i < value.length; i++) {
        const level = value[i];
        if (typeof level.value !== 'number') {
          return { valid: false, error: `BAC level at index ${i} must have a numeric 'value'` };
        }
        if (!level.label || typeof level.label !== 'string') {
          return { valid: false, error: `BAC level at index ${i} must have a string 'label'` };
        }
      }
      break;
    }

    case 'school_name':
      if (typeof value !== 'string' || value.length > 256) {
        return { valid: false, error: 'Must be a string up to 256 characters' };
      }
      break;

    case 'price_asso_member':
    case 'price_non_member':
    case 'price_late': {
      const price = parseInt(value, 10);
      if (isNaN(price) || price < 0 || price > 100000) {
        return { valid: false, error: 'Must be a number between 0 and 100000 (in cents)' };
      }
      break;
    }

    case 'late_cutoff_time':
      if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) {
        return { valid: false, error: 'Must be a time in HH:MM format' };
      }
      break;

    default:
      return { valid: false, error: 'Unknown setting key' };
  }

  return { valid: true };
}
