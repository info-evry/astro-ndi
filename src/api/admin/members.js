/**
 * Admin member CRUD handlers
 */

import { json, error } from '../../lib/router.js';
import * as db from '../../lib/db.js';
import { verifyAdmin } from '../../shared/auth.js';

/**
 * POST /api/admin/members - Add member manually (no password required)
 */
export async function addMemberManually(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const data = await request.json();
    const { teamId, firstName, lastName, email, bacLevel = 0, isLeader = false, foodDiet = '' } = data;

    if (!teamId || !firstName || !lastName || !email) {
      return error('Missing required fields: teamId, firstName, lastName, email', 400);
    }

    // Verify team exists
    const team = await db.getTeamById(env.DB, teamId);
    if (!team) {
      return error('Team not found', 404);
    }

    const member = await db.addMemberAdmin(env.DB, teamId, {
      firstName, lastName, email, bacLevel, isLeader, foodDiet
    });

    return json({ success: true, member });
  } catch (error_) {
    console.error('Error adding member:', error_);
    if (error_.message?.includes('UNIQUE constraint')) {
      return error('Member with this name already exists', 400);
    }
    return error('Failed to add member', 500);
  }
}

/**
 * PUT /api/admin/members/:id - Update member
 */
export async function updateMemberAdmin(request, env, ctx, params) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const memberId = Number.parseInt(params.id, 10);
    if (Number.isNaN(memberId)) {
      return error('Invalid member ID', 400);
    }
    const updates = await request.json();

    const member = await db.getMemberById(env.DB, memberId);
    if (!member) {
      return error('Member not found', 404);
    }

    await db.updateMember(env.DB, memberId, updates);
    const updated = await db.getMemberById(env.DB, memberId);

    return json({ success: true, member: updated });
  } catch (error_) {
    console.error('Error updating member:', error_);
    return error('Failed to update member', 500);
  }
}

/**
 * DELETE /api/admin/members/:id - Delete single member
 */
export async function deleteMemberAdmin(request, env, ctx, params) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const memberId = Number.parseInt(params.id, 10);
    if (Number.isNaN(memberId)) {
      return error('Invalid member ID', 400);
    }
    const deleted = await db.deleteMember(env.DB, memberId);

    if (!deleted) {
      return error('Member not found', 404);
    }

    return json({ success: true, message: 'Member deleted' });
  } catch (error_) {
    console.error('Error deleting member:', error_);
    return error('Failed to delete member', 500);
  }
}

/**
 * POST /api/admin/members/delete-batch - Delete multiple members
 */
export async function deleteMembersBatch(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const { memberIds } = await request.json();

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return error('memberIds array is required', 400);
    }

    // Validate all IDs before processing
    const parsedIds = memberIds.map(id => Number.parseInt(id, 10));
    if (parsedIds.some(id => Number.isNaN(id))) {
      return error('Invalid member ID in array', 400);
    }

    const deleted = await db.deleteMembers(env.DB, parsedIds);

    return json({ success: true, deleted });
  } catch (error_) {
    console.error('Error deleting members:', error_);
    return error('Failed to delete members', 500);
  }
}
