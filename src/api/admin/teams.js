/**
 * Admin team CRUD handlers
 */

import { json, error } from '../../lib/router.js';
import * as db from '../../lib/db.js';
import { verifyAdmin } from '../../shared/auth.js';
import { hashPassword } from '../../shared/crypto.js';

/**
 * PUT /api/admin/teams/:id - Update team (name, description, password)
 */
export async function updateTeamAdmin(request, env, ctx, params) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const teamId = parseInt(params.id, 10);
    const updates = await request.json();

    const team = await db.getTeamById(env.DB, teamId);
    if (!team) {
      return error('Team not found', 404);
    }

    // Handle password change
    const dbUpdates = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.password !== undefined && updates.password !== '') {
      dbUpdates.passwordHash = await hashPassword(updates.password);
    }

    await db.updateTeam(env.DB, teamId, dbUpdates);
    const updated = await db.getTeamById(env.DB, teamId);

    return json({ success: true, team: { id: updated.id, name: updated.name, description: updated.description } });
  } catch (err) {
    console.error('Error updating team:', err);
    return error('Failed to update team', 500);
  }
}

/**
 * DELETE /api/admin/teams/:id - Delete team and all members
 */
export async function deleteTeamAdmin(request, env, ctx, params) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const teamId = parseInt(params.id, 10);

    const team = await db.getTeamById(env.DB, teamId);
    if (!team) {
      return error('Team not found', 404);
    }

    // Prevent deleting Organisation team
    if (team.name === 'Organisation') {
      return error('Cannot delete Organisation team', 403);
    }

    const memberCount = team.members?.length || 0;
    await db.deleteTeam(env.DB, teamId);

    return json({
      success: true,
      message: `Team "${team.name}" and ${memberCount} member(s) deleted`
    });
  } catch (err) {
    console.error('Error deleting team:', err);
    return error('Failed to delete team', 500);
  }
}

/**
 * POST /api/admin/teams - Create team (admin, with optional password)
 */
export async function createTeamAdmin(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const { name, description = '', password = '' } = await request.json();

    if (!name || name.trim().length < 2) {
      return error('Team name is required (min 2 characters)', 400);
    }

    const existing = await db.getTeamByName(env.DB, name.trim());
    if (existing) {
      return error('Team name already exists', 400);
    }

    const passwordHash = password ? await hashPassword(password) : '';
    const team = await db.createTeam(env.DB, name.trim(), description, passwordHash);

    return json({ success: true, team });
  } catch (err) {
    console.error('Error creating team:', err);
    return error('Failed to create team', 500);
  }
}
