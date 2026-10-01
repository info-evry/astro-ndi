/**
 * Teams API handlers
 */

import { json } from 'astro-core/router';
import { parsePositiveId } from 'astro-core/ids';
import { invalidId, notFound, serverError } from 'astro-core/http';
import * as db from '../lib/db.js';
import * as settingsDb from '../database/db.settings.js';
import { isOrganisationTeamName } from '../shared/constants.js';

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
      const isOrganisation = isOrganisationTeamName(team.name);
      return {
        ...team,
        available_slots: isOrganisation ? null : maxTeamSize - team.member_count,
        is_full: !isOrganisation && team.member_count >= maxTeamSize,
        is_organisation: isOrganisation
      };
    });

    return json({ teams: teamsWithSlots });
  } catch (error_) {
    return serverError('Error listing teams:', error_);
  }
}

/**
 * GET /api/teams/:id - Get team with members
 */
export async function getTeam(request, env, ctx, params) {
  try {
    const teamId = parsePositiveId(params.id);
    if (teamId === null) return invalidId();

    const team = await db.getTeamById(env.DB, teamId);
    if (!team) {
      return notFound('Équipe introuvable');
    }
    // Public endpoint: never expose member PII or the password hash.
    // Member details are only available through POST /api/teams/:id/view
    // (password protected) or the admin API.
    return json({
      team: {
        id: team.id,
        name: team.name,
        description: team.description,
        room: team.room ?? null,
        created_at: team.created_at,
        member_count: team.members?.length || 0,
        is_organisation: isOrganisationTeamName(team.name)
      }
    });
  } catch (error_) {
    return serverError('Error fetching team:', error_);
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
    return serverError('Error fetching stats:', error_);
  }
}
