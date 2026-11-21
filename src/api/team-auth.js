/**
 * Team code secret check, shared by every endpoint a team opens with it
 * (registration join, team view, pizza change).
 */

import { error } from 'astro-core/router';
import { forbidden } from 'astro-core/http';
import * as db from '../lib/db.js';
import { hashPassword, verifyPassword, needsHashUpgrade } from '../shared/crypto.js';

export const CODE_NO_SECRET = 'password_not_set';

const MSG_NO_SECRET =
  "Cette équipe n'a pas encore de code secret : un organisateur doit en définir un dans l'administration";

/**
 * Check `password` against the code secret of `team` (as returned by
 * `db.getTeamById`). A legacy hash is upgraded on success.
 *
 * @param {D1Database} database
 * @param {{ id: number, password_hash?: string|null }} team
 * @param {string} password - Already normalised (`normalizeTeamPassword`)
 * @returns {Promise<Response|null>} the refusal, or null when the secret is right
 */
export async function checkTeamSecret(database, team, password) {
  // Teams made by an organiser (Organisation) have none until one is set: say
  // so instead of "incorrect", which sends people hunting for a code that
  // does not exist.
  if (!team.password_hash) return error(MSG_NO_SECRET, 403, CODE_NO_SECRET);

  if (!await verifyPassword(password, team.password_hash)) return forbidden('Code secret incorrect');

  if (needsHashUpgrade(team.password_hash)) {
    try {
      await db.updateTeam(database, team.id, { passwordHash: await hashPassword(password) });
    } catch (error_) {
      // Never fail the request because the upgrade did not go through
      console.error('Failed to upgrade password hash:', error_);
    }
  }
  return null;
}
