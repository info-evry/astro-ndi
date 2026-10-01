/**
 * Admin team CRUD handlers
 */

import { json } from 'astro-core/router';
import { adminOnly } from 'astro-core/auth';
import { parsePositiveId } from 'astro-core/ids';
import { isUniqueConstraintError } from 'astro-core/request';
import { badRequest, conflict, forbidden, invalidId, notFound, serverError } from 'astro-core/http';
import * as db from '../../lib/db.js';
import { hashPassword } from '../../shared/crypto.js';
import { ORGANISATION_TEAM_NAME } from '../../shared/constants.js';
import { readBody } from '../../shared/http.js';
import { normalizeTeamDescription, normalizeTeamPassword, validateTeamName } from '../../lib/validation.js';

const MSG_TEAM_NOT_FOUND = 'Équipe introuvable';
const MSG_TEAM_EXISTS = "Ce nom d'équipe existe déjà";
const CODE_VALIDATION = 'validation_error';

/**
 * Validate the optional `description` / `password` fields shared by create
 * and update. Returns `{ extras: { description?, password? } }` (normalised,
 * only the provided ones; an empty password means "unchanged") or `{ response }`.
 */
function parseTeamExtras(data) {
  const extras = {};

  if (data.description !== undefined) {
    if (typeof data.description !== 'string') {
      return { response: badRequest('La description doit être une chaîne', CODE_VALIDATION) };
    }
    extras.description = normalizeTeamDescription(data.description);
  }

  if (data.password !== undefined && data.password !== '') {
    const password = normalizeTeamPassword(data.password);
    if (typeof data.password !== 'string' || !password) {
      return { response: badRequest('Mot de passe invalide', CODE_VALIDATION) };
    }
    extras.password = password;
  }

  return { extras };
}

/**
 * Validate the new name of a team: well-formed, not the Organisation team
 * being renamed, not already used by another team.
 * @returns {Promise<{ name: string, response: null } | { name: null, response: Response }>}
 */
async function checkTeamRename(database, team, rawName) {
  const nameValidation = validateTeamName(rawName);
  if (!nameValidation.valid) {
    return { name: null, response: badRequest(nameValidation.error, CODE_VALIDATION) };
  }
  const name = nameValidation.value;

  if (name !== team.name) {
    if (team.name === ORGANISATION_TEAM_NAME) {
      return { name: null, response: forbidden("L'équipe Organisation ne peut pas être renommée") };
    }
    const clash = await db.getTeamByName(database, name);
    if (clash && clash.id !== team.id) return { name: null, response: conflict(MSG_TEAM_EXISTS) };
  }
  return { name, response: null };
}

/**
 * PUT /api/admin/teams/:id - Update team (name, description, password)
 */
export const updateTeamAdmin = adminOnly(async (request, env, ctx, params) => {
  try {
    const teamId = parsePositiveId(params.id);
    if (teamId === null) return invalidId();

    const { data, response } = await readBody(request);
    if (response) return response;

    const team = await db.getTeamById(env.DB, teamId);
    if (!team) return notFound(MSG_TEAM_NOT_FOUND);

    const dbUpdates = {};
    if (data.name !== undefined) {
      const { name, response: nameResponse } = await checkTeamRename(env.DB, team, data.name);
      if (nameResponse) return nameResponse;
      dbUpdates.name = name;
    }

    const { extras, response: extrasResponse } = parseTeamExtras(data);
    if (extrasResponse) return extrasResponse;
    if (extras.description !== undefined) dbUpdates.description = extras.description;
    if (extras.password !== undefined) dbUpdates.passwordHash = await hashPassword(extras.password);

    try {
      await db.updateTeam(env.DB, teamId, dbUpdates);
    } catch (error_) {
      if (isUniqueConstraintError(error_)) return conflict(MSG_TEAM_EXISTS);
      throw error_;
    }
    const updated = await db.getTeamById(env.DB, teamId);

    return json({ success: true, team: { id: updated.id, name: updated.name, description: updated.description } });
  } catch (error_) {
    return serverError('Error updating team:', error_);
  }
});

/**
 * DELETE /api/admin/teams/:id - Delete team and all members
 */
export const deleteTeamAdmin = adminOnly(async (request, env, ctx, params) => {
  try {
    const teamId = parsePositiveId(params.id);
    if (teamId === null) return invalidId();

    const team = await db.getTeamById(env.DB, teamId);
    if (!team) return notFound(MSG_TEAM_NOT_FOUND);

    // Prevent deleting Organisation team
    if (team.name === ORGANISATION_TEAM_NAME) {
      return forbidden("Impossible de supprimer l'équipe Organisation");
    }

    const memberCount = team.members?.length || 0;
    await db.deleteTeam(env.DB, teamId);

    return json({
      success: true,
      message: `Team "${team.name}" and ${memberCount} member(s) deleted`
    });
  } catch (error_) {
    return serverError('Error deleting team:', error_);
  }
});

/**
 * POST /api/admin/teams - Create team (admin, with optional password)
 */
export const createTeamAdmin = adminOnly(async (request, env) => {
  try {
    const { data, response } = await readBody(request);
    if (response) return response;

    const nameValidation = validateTeamName(data.name);
    if (!nameValidation.valid) return badRequest(nameValidation.error, CODE_VALIDATION);
    const name = nameValidation.value;

    const { extras, response: extrasResponse } = parseTeamExtras(data);
    if (extrasResponse) return extrasResponse;

    if (await db.getTeamByName(env.DB, name)) return conflict(MSG_TEAM_EXISTS);

    const passwordHash = extras.password ? await hashPassword(extras.password) : '';
    try {
      const team = await db.createTeam(env.DB, name, extras.description ?? '', passwordHash);
      return json({ success: true, team });
    } catch (error_) {
      if (isUniqueConstraintError(error_)) return conflict(MSG_TEAM_EXISTS);
      throw error_;
    }
  } catch (error_) {
    return serverError('Error creating team:', error_);
  }
});
