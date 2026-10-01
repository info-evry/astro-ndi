/**
 * Admin settings API handlers
 */

import { json } from 'astro-core/router';
import { adminOnly } from 'astro-core/auth';
import { badRequest, serverError } from 'astro-core/http';
import { isBooleanLike, isIntInRange, isTimeHHMM, validateSettings } from 'astro-core/settings';
import * as settingsDb from '../../database/db.settings.js';
import { MAX_FOOD_DIET_LENGTH, MAX_PAYMENT_AMOUNT_CENTS } from '../../shared/constants.js';
import { readBody } from '../../shared/http.js';

const MSG_NUMBER_RANGE = (min, max) => `Doit être un entier entre ${min} et ${max}`;

/**
 * Integer in [min, max]. Numbers and plain integer strings ("10") are
 * accepted; "10abc", 1.5, [5] and booleans are rejected rather than
 * silently truncated.
 * @param {number} min
 * @param {number} max
 * @returns {(value: unknown) => true | string}
 */
function intSetting(min, max) {
  const inRange = isIntInRange(min, max);
  return (value) => {
    const candidate = typeof value === 'string' && /^\s*-?\d+\s*$/.test(value) ? Number.parseInt(value, 10) : value;
    return inRange(candidate) || MSG_NUMBER_RANGE(min, max);
  };
}

/** @param {unknown} value */
function validatePizzas(value) {
  if (!Array.isArray(value)) return 'Doit être un tableau';
  for (const [i, pizza] of value.entries()) {
    if (!pizza || typeof pizza !== 'object') return `Pizza at index ${i} must be an object`;
    if (!pizza.id || typeof pizza.id !== 'string') return `Pizza at index ${i} must have a string 'id'`;
    if (pizza.id.length > MAX_FOOD_DIET_LENGTH) {
      return `Pizza at index ${i}: 'id' is longer than ${MAX_FOOD_DIET_LENGTH} characters`;
    }
    if (!pizza.name || typeof pizza.name !== 'string') return `Pizza at index ${i} must have a string 'name'`;
    if (pizza.description !== undefined && typeof pizza.description !== 'string') {
      return `Pizza at index ${i} 'description' must be a string`;
    }
  }
  return true;
}

/** @param {unknown} value */
function validateBacLevels(value) {
  if (!Array.isArray(value)) return 'Doit être un tableau';
  for (const [i, level] of value.entries()) {
    if (!level || typeof level !== 'object') return `BAC level at index ${i} must be an object`;
    if (typeof level.value !== 'number') return `BAC level at index ${i} must have a numeric 'value'`;
    if (!level.label || typeof level.label !== 'string') return `BAC level at index ${i} must have a string 'label'`;
  }
  return true;
}

/** @param {unknown} value */
function validateDeadline(value) {
  if (typeof value !== 'string') return 'Doit être une chaîne';
  // An empty string means "no deadline"
  if (value === '') return true;
  return !Number.isNaN(new Date(value).getTime()) || 'Doit être une date ISO valide';
}

/**
 * Settings an admin may modify: key -> validator (`true`, or the rejection
 * message). Any other key is rejected.
 */
const SETTINGS_SCHEMA = {
  max_team_size: intSetting(1, 100),
  max_total_participants: intSetting(1, 10_000),
  min_team_size: intSetting(1, 50),
  pizzas: validatePizzas,
  bac_levels: validateBacLevels,
  school_name: (v) => (typeof v === 'string' && v.length <= 256) || 'Doit être une chaîne de 256 caractères maximum',
  price_asso_member: intSetting(0, MAX_PAYMENT_AMOUNT_CENTS),
  price_non_member: intSetting(0, MAX_PAYMENT_AMOUNT_CENTS),
  price_late: intSetting(0, MAX_PAYMENT_AMOUNT_CENTS),
  late_cutoff_time: (v) => isTimeHHMM(v) || 'Doit être une heure au format HH:MM',
  // Online payment settings
  price_tier1: intSetting(0, MAX_PAYMENT_AMOUNT_CENTS),
  price_tier2: intSetting(0, MAX_PAYMENT_AMOUNT_CENTS),
  tier1_cutoff_days: intSetting(1, 365),
  payment_enabled: (v) => isBooleanLike(v) || 'Doit valoir "true" ou "false"',
  registration_deadline: validateDeadline,
  // GDPR settings
  gdpr_retention_years: intSetting(1, 10)
};

/** Settings stored as JSON text (everything else is stored as a plain string). */
const JSON_SETTINGS = new Set(['pizzas', 'bac_levels']);

/** Text stored in the settings table for a validated value. */
function toStoredValue(key, value) {
  if (JSON_SETTINGS.has(key)) return JSON.stringify(value);
  return typeof value === 'string' ? value.trim() : String(value);
}

/**
 * GET /api/admin/settings - Get all settings
 */
export const getSettings = adminOnly(async (request, env) => {
  try {
    // Check if settings table exists
    const tableExists = await settingsDb.settingsTableExists(env.DB);
    if (!tableExists) {
      return serverError(
        'Settings table not found',
        null,
        'Table des paramètres introuvable : exécutez la migration.'
      );
    }

    const settings = await settingsDb.getAllSettings(env.DB);

    // Parse JSON values for pizzas and bac_levels
    const parsed = {};
    for (const setting of settings) {
      if (JSON_SETTINGS.has(setting.key)) {
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
    return serverError('Error fetching settings:', error_);
  }
});

/**
 * PUT /api/admin/settings - Update multiple settings
 *
 * All the keys and values are validated first; the writes are one atomic
 * batch, so a failure leaves the settings unchanged.
 */
export const updateSettings = adminOnly(async (request, env) => {
  try {
    const { data: updates, response } = await readBody(request);
    if (response) return response;

    const result = validateSettings(updates, SETTINGS_SCHEMA);
    if (!result.ok) {
      const problems = [
        ...(result.unknown.length > 0 ? [`Clés inconnues : ${result.unknown.join(', ')}`] : []),
        ...result.invalid.flatMap(item => Object.entries(item).map(([key, why]) => `Valeur invalide pour ${key} : ${why}`))
      ];
      return badRequest(problems.join(' ; '), 'invalid_settings');
    }

    await settingsDb.setSettings(
      env.DB,
      result.entries.map(([key, value]) => [key, toStoredValue(key, value)])
    );

    return json({ success: true, updated: result.entries.map(([key]) => key) });
  } catch (error_) {
    return serverError('Error updating settings:', error_);
  }
});
