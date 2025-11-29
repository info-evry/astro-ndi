/**
 * Teams API handlers
 */

import { json, error } from '../lib/router.js';
import * as db from '../lib/db.js';

/**
 * GET /api/teams - List all teams with member counts
 */
export async function listTeams(request, env) {
  try {
    const teams = await db.getTeams(env.DB);
    const maxTeamSize = parseInt(env.MAX_TEAM_SIZE, 10) || 15;

    // Add available slots info
    const teamsWithSlots = teams.map(team => {
      const isOrganisation = team.name === 'Organisation';
      const availableSlots = isOrganisation ? Infinity : maxTeamSize - team.member_count;
      return {
        ...team,
        available_slots: availableSlots,
        is_full: !isOrganisation && team.member_count >= maxTeamSize
      };
    });

    return json({ teams: teamsWithSlots });
  } catch (err) {
    console.error('Error listing teams:', err);
    return error('Failed to fetch teams', 500);
  }
}

/**
 * GET /api/teams/:id - Get team with members
 */
export async function getTeam(request, env, ctx, params) {
  try {
    const team = await db.getTeamById(env.DB, params.id);
    if (!team) {
      return error('Team not found', 404);
    }
    return json({ team });
  } catch (err) {
    console.error('Error fetching team:', err);
    return error('Failed to fetch team', 500);
  }
}

/**
 * GET /api/stats - Get registration statistics
 */
export async function getStats(request, env) {
  try {
    const teams = await db.getTeams(env.DB);
    const totalParticipants = await db.getTotalParticipants(env.DB);
    const foodStats = await db.getFoodStats(env.DB);
    const maxTotal = parseInt(env.MAX_TOTAL_PARTICIPANTS, 10) || 200;

    return json({
      stats: {
        total_teams: teams.length,
        total_participants: totalParticipants,
        max_participants: maxTotal,
        available_spots: Math.max(0, maxTotal - totalParticipants),
        food_preferences: foodStats
      }
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    return error('Failed to fetch statistics', 500);
  }
}
