/**
 * Admin member CRUD handlers
 */

import { json } from 'astro-core/router';
import { adminOnly } from 'astro-core/auth';
import { parsePositiveId } from 'astro-core/ids';
import { isForeignKeyError, isUniqueConstraintError } from 'astro-core/request';
import { badRequest, conflict, invalidId, notFound, serverError } from 'astro-core/http';
import * as db from '../../lib/db.js';
import { validateMember, validateMemberUpdate } from '../../lib/validation.js';
import { readBody, readIdList } from '../../shared/http.js';
import { getConfiguredPizzaIds } from '../config.js';

const MSG_TEAM_NOT_FOUND = 'Équipe introuvable';
const MSG_MEMBER_NOT_FOUND = 'Membre introuvable';
const MSG_MEMBER_EXISTS = 'Un membre portant ce nom existe déjà';

/**
 * POST /api/admin/members - Add member manually (no password required)
 */
export const addMemberManually = adminOnly(async (request, env) => {
  try {
    const { data, response } = await readBody(request);
    if (response) return response;

    const teamId = parsePositiveId(data.teamId);
    if (teamId === null) return invalidId("Identifiant d'équipe invalide");

    const validation = validateMember(data, { pizzaIds: await getConfiguredPizzaIds(env) });
    if (!validation.valid) {
      return badRequest(validation.errors.join('; '), 'validation_error');
    }

    // Verify team exists
    const team = await db.getTeamById(env.DB, teamId);
    if (!team) return notFound(MSG_TEAM_NOT_FOUND);

    try {
      const member = await db.addMemberAdmin(env.DB, teamId, validation.value);
      return json({ success: true, member });
    } catch (error_) {
      if (isUniqueConstraintError(error_)) return conflict(MSG_MEMBER_EXISTS);
      if (isForeignKeyError(error_)) return notFound(MSG_TEAM_NOT_FOUND);
      throw error_;
    }
  } catch (error_) {
    return serverError('Error adding member:', error_);
  }
});

/**
 * PUT /api/admin/members/:id - Update member
 */
export const updateMemberAdmin = adminOnly(async (request, env, ctx, params) => {
  try {
    const memberId = parsePositiveId(params.id);
    if (memberId === null) return invalidId();

    const { data, response } = await readBody(request);
    if (response) return response;

    const member = await db.getMemberById(env.DB, memberId);
    if (!member) return notFound(MSG_MEMBER_NOT_FOUND);

    const validation = validateMemberUpdate(data, { pizzaIds: await getConfiguredPizzaIds(env) });
    if (!validation.valid) {
      return badRequest(validation.errors.join('; '), 'validation_error');
    }
    const updates = validation.value;

    if (data.teamId !== undefined) {
      const teamId = parsePositiveId(data.teamId);
      if (teamId === null) return invalidId("Identifiant d'équipe invalide");
      // An unknown team is a clean 404, not a foreign-key 500
      if (!await db.getTeamById(env.DB, teamId)) return notFound(MSG_TEAM_NOT_FOUND);
      updates.teamId = teamId;
    }

    try {
      await db.updateMember(env.DB, memberId, updates);
    } catch (error_) {
      if (isUniqueConstraintError(error_)) return conflict(MSG_MEMBER_EXISTS);
      if (isForeignKeyError(error_)) return notFound(MSG_TEAM_NOT_FOUND);
      throw error_;
    }
    const updated = await db.getMemberById(env.DB, memberId);

    return json({ success: true, member: updated });
  } catch (error_) {
    return serverError('Error updating member:', error_);
  }
});

/**
 * DELETE /api/admin/members/:id - Delete single member
 */
export const deleteMemberAdmin = adminOnly(async (request, env, ctx, params) => {
  try {
    const memberId = parsePositiveId(params.id);
    if (memberId === null) return invalidId();

    const deleted = await db.deleteMember(env.DB, memberId);
    if (!deleted) return notFound(MSG_MEMBER_NOT_FOUND);

    return json({ success: true, message: 'Member deleted' });
  } catch (error_) {
    return serverError('Error deleting member:', error_);
  }
});

/**
 * POST /api/admin/members/delete-batch - Delete multiple members
 */
export const deleteMembersBatch = adminOnly(async (request, env) => {
  try {
    const { ids, response } = await readIdList(request, 'memberIds');
    if (response) return response;

    const deleted = await db.deleteMembers(env.DB, ids);

    return json({ success: true, deleted });
  } catch (error_) {
    return serverError('Error deleting members:', error_);
  }
});
