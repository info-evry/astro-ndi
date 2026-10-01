/**
 * Admin export handlers - CSV generation and statistics
 */

import { json } from 'astro-core/router';
import { adminOnly } from 'astro-core/auth';
import { csvResponse } from 'astro-core/csv';
import { parsePositiveId } from 'astro-core/ids';
import { invalidId, notFound, serverError } from 'astro-core/http';
import { generateMembersCsv, generateOfficialMembersCsv } from '../../lib/members-csv.js';
import * as db from '../../lib/db.js';
import { getCapacitySettings, getSetting } from '../../database/db.settings.js';
import { DEFAULT_SCHOOL_NAME } from '../../shared/constants.js';

const MSG_TEAM_NOT_FOUND = 'Équipe introuvable';
const LOG_EXPORT_FAILED = 'Export error:';

/**
 * School name of the official export: the `school_name` setting, then the
 * SCHOOL_NAME environment variable, then the default.
 */
async function getSchoolName(env) {
  try {
    const stored = await getSetting(env.DB, 'school_name');
    if (stored) return stored;
  } catch {
    // settings table unavailable: fall back to the environment value
  }
  return env.SCHOOL_NAME || DEFAULT_SCHOOL_NAME;
}

/** Filesystem-safe version of a team name for download file names. */
const safeTeamName = (name) => name.replaceAll(/[^a-z0-9]/gi, '_');

/**
 * Load a team for the per-team exports: the team (with `team_name` set on its
 * members) or the error response.
 */
async function loadTeamForExport(env, rawTeamId) {
  const teamId = parsePositiveId(rawTeamId);
  if (teamId === null) return { response: invalidId("Identifiant d'équipe invalide") };

  const team = await db.getTeamById(env.DB, teamId);
  if (!team) return { response: notFound(MSG_TEAM_NOT_FOUND) };

  return {
    team,
    members: team.members.map(m => ({ ...m, team_name: team.name }))
  };
}

/**
 * GET /api/admin/members - Get all members
 */
export const listAllMembers = adminOnly(async (request, env) => {
  try {
    const members = await db.getAllMembers(env.DB);
    return json({ members });
  } catch (error_) {
    return serverError('Error listing members:', error_);
  }
});

/**
 * GET /api/admin/export - Export all data as CSV
 */
export const exportAllCSV = adminOnly(async (request, env) => {
  try {
    const members = await db.getAllMembers(env.DB);
    return csvResponse(generateMembersCsv(members), 'participants.csv');
  } catch (error_) {
    return serverError(LOG_EXPORT_FAILED, error_);
  }
});

/**
 * GET /api/admin/export/:teamId - Export team data as CSV
 */
export const exportTeamCSV = adminOnly(async (request, env, ctx, params) => {
  try {
    const { team, members, response } = await loadTeamForExport(env, params.teamId);
    if (response) return response;

    return csvResponse(generateMembersCsv(members), `participants_${safeTeamName(team.name)}.csv`);
  } catch (error_) {
    return serverError(LOG_EXPORT_FAILED, error_);
  }
});

/**
 * GET /api/admin/export-official - Export data in official NDI format
 */
export const exportOfficialCSV = adminOnly(async (request, env) => {
  try {
    const members = await db.getAllMembers(env.DB);
    const csv = generateOfficialMembersCsv(members, await getSchoolName(env));

    return csvResponse(csv, 'participants_officiel.csv');
  } catch (error_) {
    return serverError(LOG_EXPORT_FAILED, error_);
  }
});

/**
 * GET /api/admin/export-official/:teamId - Export team data in official NDI format
 */
export const exportTeamOfficialCSV = adminOnly(async (request, env, ctx, params) => {
  try {
    const { team, members, response } = await loadTeamForExport(env, params.teamId);
    if (response) return response;

    const csv = generateOfficialMembersCsv(members, await getSchoolName(env));

    return csvResponse(csv, `participants_officiel_${safeTeamName(team.name)}.csv`);
  } catch (error_) {
    return serverError(LOG_EXPORT_FAILED, error_);
  }
});

/**
 * GET /api/admin/stats - Detailed admin statistics
 */
export const adminStats = adminOnly(async (request, env) => {
  try {
    const teamsExcludingOrg = await db.getTeamsExcludingOrg(env.DB);
    const participantsExcludingOrg = await db.getParticipantsExcludingOrg(env.DB);
    const foodStats = await db.getFoodStats(env.DB);

    // Get capacity from D1 settings with env fallback
    const capacity = await getCapacitySettings(env.DB, env);
    const maxTotal = capacity.maxTotalParticipants;

    // Get all teams with members in 2 queries (avoids N+1)
    const teamsWithMembers = await db.getAllTeamsWithMembers(env.DB);

    return json({
      stats: {
        total_teams: teamsExcludingOrg.length,
        total_participants: participantsExcludingOrg,
        max_participants: maxTotal,
        available_spots: Math.max(0, maxTotal - participantsExcludingOrg),
        food_preferences: foodStats,
        bac_level_distribution: await db.getBacLevelStats(env.DB)
      },
      teams: teamsWithMembers
    });
  } catch (error_) {
    return serverError('Error fetching admin stats:', error_);
  }
});
