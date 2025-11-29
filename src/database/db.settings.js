/**
 * Settings database operations
 */

/**
 * Get a single setting value
 * @param {D1Database} db
 * @param {string} key
 * @returns {Promise<string|null>}
 */
export async function getSetting(db, key) {
  const result = await db.prepare(
    'SELECT value FROM settings WHERE key = ?'
  ).bind(key).first();
  return result?.value || null;
}

/**
 * Get a setting and parse as JSON
 * @param {D1Database} db
 * @param {string} key
 * @returns {Promise<any|null>}
 */
export async function getSettingJson(db, key) {
  const value = await getSetting(db, key);
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Get all settings
 * @param {D1Database} db
 * @returns {Promise<Array<{key: string, value: string, description: string, updated_at: string}>>}
 */
export async function getAllSettings(db) {
  const result = await db.prepare(
    'SELECT key, value, description, updated_at FROM settings ORDER BY key'
  ).all();
  return result.results;
}

/**
 * Set a single setting
 * @param {D1Database} db
 * @param {string} key
 * @param {string} value
 * @param {string} description
 * @returns {Promise<boolean>}
 */
export async function setSetting(db, key, value, description = '') {
  await db.prepare(`
    INSERT INTO settings (key, value, description, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      description = CASE WHEN excluded.description != '' THEN excluded.description ELSE settings.description END,
      updated_at = datetime('now')
  `).bind(key, value, description).run();
  return true;
}

/**
 * Set a setting as JSON
 * @param {D1Database} db
 * @param {string} key
 * @param {any} value
 * @param {string} description
 * @returns {Promise<boolean>}
 */
export async function setSettingJson(db, key, value, description = '') {
  return setSetting(db, key, JSON.stringify(value), description);
}

/**
 * Delete a setting
 * @param {D1Database} db
 * @param {string} key
 * @returns {Promise<boolean>}
 */
export async function deleteSetting(db, key) {
  const result = await db.prepare(
    'DELETE FROM settings WHERE key = ?'
  ).bind(key).run();
  return result.meta.changes > 0;
}

/**
 * Get capacity settings with environment fallback
 * @param {D1Database} db
 * @param {object} env
 * @returns {Promise<{maxTeamSize: number, maxTotalParticipants: number, minTeamSize: number}>}
 */
export async function getCapacitySettings(db, env) {
  let maxTeamSize = parseInt(env.MAX_TEAM_SIZE, 10) || 15;
  let maxTotalParticipants = parseInt(env.MAX_TOTAL_PARTICIPANTS, 10) || 200;
  let minTeamSize = parseInt(env.MIN_TEAM_SIZE, 10) || 1;

  try {
    const dbMaxTeam = await getSetting(db, 'max_team_size');
    if (dbMaxTeam) maxTeamSize = parseInt(dbMaxTeam, 10);

    const dbMaxTotal = await getSetting(db, 'max_total_participants');
    if (dbMaxTotal) maxTotalParticipants = parseInt(dbMaxTotal, 10);

    const dbMinTeam = await getSetting(db, 'min_team_size');
    if (dbMinTeam) minTeamSize = parseInt(dbMinTeam, 10);
  } catch (e) {
    console.error('Error reading capacity settings from DB:', e);
    // Fall back to env values
  }

  return { maxTeamSize, maxTotalParticipants, minTeamSize };
}

/**
 * Check if settings table exists
 * @param {D1Database} db
 * @returns {Promise<boolean>}
 */
export async function settingsTableExists(db) {
  try {
    const result = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='settings'"
    ).first();
    return !!result;
  } catch {
    return false;
  }
}
