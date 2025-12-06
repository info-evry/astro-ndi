/**
 * Admin export handlers - CSV generation and statistics
 */

import { json, error } from '../../lib/router.js';
import * as db from '../../lib/db.js';
import { getCapacitySettings } from '../../database/db.settings.js';
import { verifyAdmin } from '../../shared/auth.js';

// Constants for repeated strings
const CSV_CONTENT_TYPE = 'text/csv; charset=utf-8';
const EXPORT_FAILED_MSG = 'Export failed';

/**
 * GET /api/admin/members - Get all members
 */
export async function listAllMembers(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const members = await db.getAllMembers(env.DB);
    return json({ members });
  } catch (error_) {
    console.error('Error listing members:', error_);
    return error('Failed to fetch members', 500);
  }
}

/**
 * GET /api/admin/export - Export all data as CSV
 */
export async function exportAllCSV(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const members = await db.getAllMembers(env.DB);
    const csv = generateCSV(members);

    return new Response(csv, {
      headers: {
        'Content-Type': CSV_CONTENT_TYPE,
        'Content-Disposition': 'attachment; filename="participants.csv"'
      }
    });
  } catch (error_) {
    console.error('Error exporting:', error_);
    return error(EXPORT_FAILED_MSG, 500);
  }
}

/**
 * GET /api/admin/export/:teamId - Export team data as CSV
 */
export async function exportTeamCSV(request, env, ctx, params) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const team = await db.getTeamById(env.DB, params.teamId);
    if (!team) {
      return error('Team not found', 404);
    }

    const members = team.members.map(m => ({
      ...m,
      team_name: team.name
    }));

    const csv = generateCSV(members);
    const safeTeamName = team.name.replaceAll(/[^a-z0-9]/gi, '_');

    return new Response(csv, {
      headers: {
        'Content-Type': CSV_CONTENT_TYPE,
        'Content-Disposition': `attachment; filename="participants_${safeTeamName}.csv"`
      }
    });
  } catch (error_) {
    console.error('Error exporting team:', error_);
    return error(EXPORT_FAILED_MSG, 500);
  }
}

/**
 * GET /api/admin/export-official - Export data in official NDI format
 */
export async function exportOfficialCSV(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const members = await db.getAllMembers(env.DB);

    // Get school name from settings with fallback
    const DEFAULT_SCHOOL_NAME = "Université d'Evry";
    let schoolName = DEFAULT_SCHOOL_NAME;
    try {
      const { getSetting } = await import('../../database/db.settings.js');
      const dbSchoolName = await getSetting(env.DB, 'school_name');
      if (dbSchoolName) {
        schoolName = dbSchoolName;
      } else if (env.SCHOOL_NAME) {
        schoolName = env.SCHOOL_NAME;
      }
    } catch {
      // Fall back to env value or default
      if (env.SCHOOL_NAME) schoolName = env.SCHOOL_NAME;
    }

    const csv = generateOfficialCSV(members, schoolName);

    return new Response(csv, {
      headers: {
        'Content-Type': CSV_CONTENT_TYPE,
        'Content-Disposition': 'attachment; filename="participants_officiel.csv"'
      }
    });
  } catch (error_) {
    console.error('Error exporting official:', error_);
    return error(EXPORT_FAILED_MSG, 500);
  }
}

/**
 * GET /api/admin/export-official/:teamId - Export team data in official NDI format
 */
export async function exportTeamOfficialCSV(request, env, ctx, params) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const team = await db.getTeamById(env.DB, params.teamId);
    if (!team) {
      return error('Team not found', 404);
    }

    const members = team.members.map(m => ({
      ...m,
      team_name: team.name
    }));

    // Get school name from settings with fallback
    const DEFAULT_SCHOOL_NAME = "Université d'Evry";
    let schoolName = DEFAULT_SCHOOL_NAME;
    try {
      const { getSetting } = await import('../../database/db.settings.js');
      const dbSchoolName = await getSetting(env.DB, 'school_name');
      if (dbSchoolName) {
        schoolName = dbSchoolName;
      } else if (env.SCHOOL_NAME) {
        schoolName = env.SCHOOL_NAME;
      }
    } catch {
      if (env.SCHOOL_NAME) schoolName = env.SCHOOL_NAME;
    }

    const csv = generateOfficialCSV(members, schoolName);
    const safeTeamName = team.name.replaceAll(/[^a-z0-9]/gi, '_');

    return new Response(csv, {
      headers: {
        'Content-Type': CSV_CONTENT_TYPE,
        'Content-Disposition': `attachment; filename="participants_officiel_${safeTeamName}.csv"`
      }
    });
  } catch (error_) {
    console.error('Error exporting team official:', error_);
    return error(EXPORT_FAILED_MSG, 500);
  }
}

/**
 * GET /api/admin/stats - Detailed admin statistics
 */
export async function adminStats(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

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
        bac_level_distribution: await getBacLevelStats(env.DB)
      },
      teams: teamsWithMembers
    });
  } catch (error_) {
    console.error('Error fetching admin stats:', error_);
    return error('Failed to fetch statistics', 500);
  }
}

/**
 * Generate CSV from member data
 * Uses semicolon delimiter for European Excel compatibility
 */
function generateCSV(members) {
  const BOM = '\ufeff'; // UTF-8 BOM for Excel
  const headers = [
    'ID',
    'Prénom',
    'Nom',
    'Email',
    'Équipe',
    'Niveau BAC',
    'Chef d\'équipe',
    'Pizza',
    'Date d\'inscription'
  ];

  const rows = members.map(m => [
    m.id,
    m.first_name,
    m.last_name,
    m.email,
    m.team_name,
    `BAC+${m.bac_level}`,
    m.is_leader ? 'Oui' : 'Non',
    m.food_diet || 'Aucune',
    m.created_at
  ]);

  const csvContent = [
    headers.join(';'),
    ...rows.map(row => row.map(escapeCSV).join(';'))
  ].join('\n');

  return BOM + csvContent;
}

/**
 * Escape CSV field with formula injection protection
 * Prevents CSV injection attacks by prefixing dangerous characters
 */
function escapeCSV(field) {
  if (field === null || field === undefined) return '';
  let str = String(field);

  // Protect against formula injection
  // These characters can trigger formula execution in spreadsheets
  if (/^[=+\-@\t\r|;]/.test(str)) {
    str = "'" + str;
  }

  // Quote fields containing delimiter, quotes, or newlines
  if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes("'")) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

/**
 * Generate official NDI format CSV
 * Format: prenom;nom;mail;niveauBac;equipe;estLeader (0\1);ecole
 */
function generateOfficialCSV(members, schoolName) {
  const BOM = '\ufeff'; // UTF-8 BOM for Excel
  const headers = [
    'prenom',
    'nom',
    'mail',
    'niveauBac',
    'equipe',
    String.raw`estLeader (0\1)`,
    'ecole (nom exact saisi sur le site)'
  ];

  const rows = members.map(m => [
    m.first_name,
    (m.last_name || '').toUpperCase(),
    m.email,
    Number.parseInt(m.bac_level, 10) || 0,
    m.team_name,
    m.is_leader ? 1 : 0,
    schoolName
  ]);

  const csvContent = [
    headers.join(';'),
    ...rows.map(row => row.map(escapeCSV).join(';'))
  ].join('\n');

  return BOM + csvContent;
}

/**
 * Get BAC level distribution
 */
async function getBacLevelStats(database) {
  const result = await database.prepare(`
    SELECT bac_level, COUNT(*) as count
    FROM members
    GROUP BY bac_level
    ORDER BY bac_level
  `).all();
  return result.results;
}
