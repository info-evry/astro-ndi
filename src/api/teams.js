/**
 * Teams API handlers
 */

import { json, error } from '../lib/router.js';
import * as db from '../lib/db.js';
import * as settingsDb from '../database/db.settings.js';

/**
 * GET /api/teams - List all teams with member counts
 */
export async function listTeams(request, env) {
  try {
    const teams = await db.getTeams(env.DB);
    const capacity = await settingsDb.getCapacitySettings(env.DB, env);
    const maxTeamSize = capacity.maxTeamSize;

    // Add available slots info
    const teamsWithSlots = teams.map(team => {
      const isOrganisation = team.name === 'Organisation';
      return {
        ...team,
        available_slots: isOrganisation ? null : maxTeamSize - team.member_count,
        is_full: !isOrganisation && team.member_count >= maxTeamSize,
        is_organisation: isOrganisation
      };
    });

    return json({ teams: teamsWithSlots });
  } catch (error_) {
    console.error('Error listing teams:', error_);
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
  } catch (error_) {
    console.error('Error fetching team:', error_);
    return error('Failed to fetch team', 500);
  }
}

/**
 * GET /api/stats - Get registration statistics
 */
export async function getStats(request, env) {
  try {
    const teamsExcludingOrg = await db.getTeamsExcludingOrg(env.DB);
    const participantsExcludingOrg = await db.getParticipantsExcludingOrg(env.DB);
    const foodStats = await db.getFoodStats(env.DB);
    const capacity = await settingsDb.getCapacitySettings(env.DB, env);
    const maxTotal = capacity.maxTotalParticipants;

    return json({
      stats: {
        total_teams: teamsExcludingOrg.length,
        total_participants: participantsExcludingOrg,
        max_participants: maxTotal,
        available_spots: Math.max(0, maxTotal - participantsExcludingOrg),
        food_preferences: foodStats
      }
    });
  } catch (error_) {
    console.error('Error fetching stats:', error_);
    return error('Failed to fetch statistics', 500);
  }
}
