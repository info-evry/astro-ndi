/**
 * Admin room assignment handlers
 */

import { json, error } from '../../lib/router.js';
import * as db from '../../lib/db.js';
import { verifyAdmin } from '../../shared/auth.js';

/**
 * GET /api/admin/rooms - Get all teams with room assignments
 */
export async function getRooms(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const teams = await db.getTeamsWithRooms(env.DB);
    const stats = await db.getRoomStats(env.DB);
    const rooms = await db.getDistinctRooms(env.DB);
    const pizzaByRoom = await db.getPizzaStatsByRoom(env.DB);

    return json({
      teams,
      stats: {
        total_teams: stats?.total_teams || 0,
        assigned_teams: stats?.assigned_teams || 0,
        unassigned_teams: stats?.unassigned_teams || 0,
        by_room: stats?.by_room || []
      },
      rooms,
      pizza_by_room: pizzaByRoom
    });
  } catch (err) {
    console.error('Error fetching rooms:', err);
    return error('Failed to fetch rooms', 500);
  }
}

/**
 * PUT /api/admin/rooms/:teamId - Assign or clear a room for a team
 */
export async function setRoom(request, env, ctx, params) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const teamId = Number.parseInt(params.teamId, 10);
    if (Number.isNaN(teamId)) {
      return error('Invalid team ID', 400);
    }

    const team = await db.getTeamById(env.DB, teamId);
    if (!team) {
      return error('Team not found', 404);
    }

    const { room } = await request.json();

    // Validate room name (allow empty/null to clear, or string max 50 chars)
    if (room !== null && room !== '' && (typeof room !== 'string' || room.length > 50)) {
      return error('Room must be a string (max 50 characters) or empty to clear', 400);
    }

    const success = await db.setTeamRoom(env.DB, teamId, room || null);
    if (!success) {
      return error('Failed to update room', 500);
    }

    return json({
      success: true,
      team: {
        id: teamId,
        room: room || null
      }
    });
  } catch (err) {
    console.error('Error setting room:', err);
    return error('Failed to set room', 500);
  }
}

/**
 * POST /api/admin/rooms/batch - Batch assign rooms to multiple teams
 */
export async function setRoomsBatch(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const { assignments } = await request.json();

    if (!Array.isArray(assignments) || assignments.length === 0) {
      return error('assignments array is required (format: [{teamId, room}])', 400);
    }

    // Validate each assignment
    const parsedAssignments = [];
    for (const assignment of assignments) {
      if (!assignment.teamId) {
        return error('Each assignment must have a teamId', 400);
      }
      const teamId = Number.parseInt(assignment.teamId, 10);
      if (Number.isNaN(teamId)) {
        return error('Invalid team ID in assignment', 400);
      }
      if (assignment.room && (typeof assignment.room !== 'string' || assignment.room.length > 50)) {
        return error('Room must be a string (max 50 characters)', 400);
      }
      parsedAssignments.push({ teamId, room: assignment.room || null });
    }

    const count = await db.setTeamRoomsBatch(env.DB, parsedAssignments);

    return json({ success: true, updated: count });
  } catch (err) {
    console.error('Error batch setting rooms:', err);
    return error('Failed to set rooms', 500);
  }
}
