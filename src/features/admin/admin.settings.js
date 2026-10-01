/**
 * Admin settings API handlers
 */

import { json } from 'astro-core/router';
import { adminOnly } from 'astro-core/auth';
import { badRequest, serverError } from 'astro-core/http';
import { isIntInRange, isTimeHHMM, validateSettings } from 'astro-core/settings';
import * as settingsDb from '../../database/db.settings.js';
import { MAX_FOOD_DIET_LENGTH, MAX_PAYMENT_AMOUNT_CENTS, NO_PIZZA_ID } from '../../shared/constants.js';
import { readBody } from '../../shared/http.js';

/** Settings are read back right after a save: never serve a cached copy. */
const NO_STORE = { 'Cache-Control': 'no-store' };

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

/**
 * Validate one pizza entry; returns an error message or null.
 * @param {unknown} pizza
 * @param {number} index
 * @param {Set<string>} seenIds ids already seen (mutated)
 */
function pizzaEntryError(pizza, index, seenIds) {
  const label = `Pizza n°${index + 1}`;
  if (!pizza || typeof pizza !== 'object') return `${label} : doit être un objet`;
  if (!pizza.id || typeof pizza.id !== 'string') return `${label} : l'identifiant (id) est requis`;
  if (pizza.id.length > MAX_FOOD_DIET_LENGTH) {
    return `${label} : l'identifiant ne doit pas dépasser ${MAX_FOOD_DIET_LENGTH} caractères`;
  }
  if (seenIds.has(pizza.id)) return `${label} : l'identifiant « ${pizza.id} » est déjà utilisé`;
  seenIds.add(pizza.id);
  if (!pizza.name || typeof pizza.name !== 'string' || pizza.name.trim() === '') {
    return `${label} : le nom est requis`;
  }
  if (pizza.description !== undefined && typeof pizza.description !== 'string') {
    return `${label} : la description doit être un texte`;
  }
  return null;
}

/** @param {unknown} value */
function validatePizzas(value) {
  if (!Array.isArray(value)) return 'Doit être un tableau';
  const seenIds = new Set();
  for (const [i, pizza] of value.entries()) {
    const problem = pizzaEntryError(pizza, i, seenIds);
    if (problem) return problem;
  }
  // "Aucune" is the no-pizza choice the registration form relies on: the
  // catalogue must always offer it (the admin UI locks it, enforce it here too).
  if (!seenIds.has(NO_PIZZA_ID)) {
    return `l'entrée « ${NO_PIZZA_ID} » (aucune pizza) ne peut pas être supprimée`;
  }
  return true;
}

/** @param {unknown} value */
function validateBacLevels(value) {
  if (!Array.isArray(value)) return 'Doit être un tableau';
  for (const [i, level] of value.entries()) {
    const label = `Niveau de BAC n°${i + 1}`;
    if (!level || typeof level !== 'object') return `${label} : doit être un objet`;
    if (typeof level.value !== 'number') return `${label} : la valeur (value) doit être un nombre`;
    if (!level.label || typeof level.label !== 'string') return `${label} : le libellé (label) est requis`;
  }
  return true;
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
  // GDPR settings
  gdpr_retention_years: intSetting(1, 10)
};

/**
 * Keys of the retired online payment (all payments are now taken on site) and
 * of the registration deadline, which no registration rule enforces. An admin
 * page cached before the removal still sends them with its save: they are
 * dropped silently (never stored, never returned) instead of failing that
 * save with "unknown keys". Rows already in D1 are harmless and ignored.
 */
const RETIRED_KEYS = new Set([
  'payment_enabled',
  'price_tier1',
  'price_tier2',
  'tier1_cutoff_days',
  'registration_deadline'
]);

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

    const settings = (await settingsDb.getAllSettings(env.DB)).filter(setting => !RETIRED_KEYS.has(setting.key));

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

    return json({ settings: parsed, raw: settings }, 200, NO_STORE);
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

    const current = Object.fromEntries(Object.entries(updates).filter(([key]) => !RETIRED_KEYS.has(key)));
    const result = validateSettings(current, SETTINGS_SCHEMA);
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
