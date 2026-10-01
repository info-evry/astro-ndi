/**
 * Admin room assignment handlers
 */

import { json } from 'astro-core/router';
import { adminOnly } from 'astro-core/auth';
import { parsePositiveId } from 'astro-core/ids';
import { badRequest, invalidBody, invalidId, notFound, serverError } from 'astro-core/http';
import * as db from '../../lib/db.js';
import { MAX_ROOM_ASSIGNMENTS, MAX_ROOM_NAME_LENGTH } from '../../shared/constants.js';
import { readBody } from '../../shared/http.js';

const CODE_INVALID_ROOM = 'invalid_room';
const MSG_INVALID_ROOM = `Le nom de salle doit être une chaîne (${MAX_ROOM_NAME_LENGTH} caractères maximum), ou vide pour retirer la salle`;

/**
 * Normalise a room name: a trimmed string of at most MAX_ROOM_NAME_LENGTH
 * characters, or `null` (undefined, null and blank all clear the room).
 * @param {unknown} room
 * @returns {{ room: string|null } | { error: true }}
 */
function parseRoom(room) {
  if (room === undefined || room === null) return { room: null };
  if (typeof room !== 'string') return { error: true };
  const trimmed = room.trim();
  if (trimmed.length > MAX_ROOM_NAME_LENGTH) return { error: true };
  return { room: trimmed || null };
}

/**
 * GET /api/admin/rooms - Get all teams with room assignments
 */
export const getRooms = adminOnly(async (request, env) => {
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
  } catch (error_) {
    return serverError('Error fetching rooms:', error_);
  }
});

/**
 * PUT /api/admin/rooms/:teamId - Assign or clear a room for a team
 */
export const setRoom = adminOnly(async (request, env, ctx, params) => {
  try {
    const teamId = parsePositiveId(params.teamId);
    if (teamId === null) return invalidId("Identifiant d'équipe invalide");

    const { data, response } = await readBody(request);
    if (response) return response;

    // `room` is mandatory here (null or '' clears it): a missing key is a mistake
    const parsed = Object.hasOwn(data, 'room') ? parseRoom(data.room) : { error: true };
    if (parsed.error) return badRequest(MSG_INVALID_ROOM, CODE_INVALID_ROOM);

    const team = await db.getTeamById(env.DB, teamId);
    if (!team) return notFound('Équipe introuvable');

    const success = await db.setTeamRoom(env.DB, teamId, parsed.room);
    if (!success) return notFound('Équipe introuvable'); // deleted in the meantime

    return json({
      success: true,
      team: {
        id: teamId,
        room: parsed.room
      }
    });
  } catch (error_) {
    return serverError('Error setting room:', error_);
  }
});

/**
 * POST /api/admin/rooms/batch - Batch assign rooms to multiple teams
 *
 * Body `{ assignments: [{ teamId, room }] }` (1 to MAX_ROOM_ASSIGNMENTS
 * entries). When a team appears several times the last entry wins. Teams that
 * do not exist are not an error: they are listed in `skipped`.
 */
export const setRoomsBatch = adminOnly(async (request, env) => {
  try {
    const { data, response } = await readBody(request);
    if (response) return response;

    const { assignments } = data;
    if (!Array.isArray(assignments) || assignments.length === 0) {
      return invalidBody('assignments doit être un tableau non vide (format : [{teamId, room}])');
    }
    if (assignments.length > MAX_ROOM_ASSIGNMENTS) {
      return badRequest(`Trop d'affectations (maximum ${MAX_ROOM_ASSIGNMENTS})`, 'too_many_assignments');
    }

    // Validate each assignment; the last entry of a team wins
    const byTeam = new Map();
    for (const assignment of assignments) {
      if (assignment === null || typeof assignment !== 'object' || Array.isArray(assignment)) {
        return invalidBody('Chaque affectation doit être un objet {teamId, room}');
      }
      const teamId = parsePositiveId(assignment.teamId);
      if (teamId === null) return invalidId("Identifiant d'équipe invalide dans une affectation");
      const parsed = parseRoom(assignment.room);
      if (parsed.error) return badRequest(MSG_INVALID_ROOM, CODE_INVALID_ROOM);
      byTeam.delete(teamId);
      byTeam.set(teamId, { teamId, room: parsed.room });
    }

    const { updated, skipped } = await db.setTeamRoomsBatch(env.DB, [...byTeam.values()]);

    return json({ success: true, updated, skipped });
  } catch (error_) {
    return serverError('Error batch setting rooms:', error_);
  }
});
