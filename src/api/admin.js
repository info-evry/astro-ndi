/**
 * Admin API handlers
 */

import { json, error } from '../lib/router.js';
import * as db from '../lib/db.js';

/**
 * Simple admin authentication middleware
 * Uses Bearer token from KV or environment
 */
export async function verifyAdmin(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.slice(7);

  // Check against KV stored token or environment variable
  let adminToken = env.ADMIN_TOKEN;
  if (env.CONFIG) {
    try {
      const storedToken = await env.CONFIG.get('admin_token');
      if (storedToken) adminToken = storedToken;
    } catch (e) {
      // Fall back to env variable
    }
  }

  return token && adminToken && token === adminToken;
}

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
  } catch (err) {
    console.error('Error listing members:', err);
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
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="participants.csv"'
      }
    });
  } catch (err) {
    console.error('Error exporting:', err);
    return error('Export failed', 500);
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
    const safeTeamName = team.name.replace(/[^a-z0-9]/gi, '_');

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="participants_${safeTeamName}.csv"`
      }
    });
  } catch (err) {
    console.error('Error exporting team:', err);
    return error('Export failed', 500);
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
    const teams = await db.getTeams(env.DB);
    const totalParticipants = await db.getTotalParticipants(env.DB);
    const foodStats = await db.getFoodStats(env.DB);
    const maxTotal = parseInt(env.MAX_TOTAL_PARTICIPANTS, 10) || 200;

    // Get detailed team info
    const teamsWithMembers = await Promise.all(
      teams.map(async t => {
        const team = await db.getTeamById(env.DB, t.id);
        return team;
      })
    );

    return json({
      stats: {
        total_teams: teams.length,
        total_participants: totalParticipants,
        max_participants: maxTotal,
        available_spots: Math.max(0, maxTotal - totalParticipants),
        food_preferences: foodStats,
        bac_level_distribution: await getBacLevelStats(env.DB)
      },
      teams: teamsWithMembers
    });
  } catch (err) {
    console.error('Error fetching admin stats:', err);
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
 * Escape CSV field
 */
function escapeCSV(field) {
  if (field === null || field === undefined) return '';
  const str = String(field);
  if (str.includes(';') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
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

/**
 * Hash password using Web Crypto API
 */
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============ ADMIN CRUD ENDPOINTS ============

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
  } catch (err) {
    console.error('Error adding member:', err);
    if (err.message?.includes('UNIQUE constraint')) {
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
    const memberId = parseInt(params.id, 10);
    const updates = await request.json();

    const member = await db.getMemberById(env.DB, memberId);
    if (!member) {
      return error('Member not found', 404);
    }

    await db.updateMember(env.DB, memberId, updates);
    const updated = await db.getMemberById(env.DB, memberId);

    return json({ success: true, member: updated });
  } catch (err) {
    console.error('Error updating member:', err);
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
    const memberId = parseInt(params.id, 10);
    const deleted = await db.deleteMember(env.DB, memberId);

    if (!deleted) {
      return error('Member not found', 404);
    }

    return json({ success: true, message: 'Member deleted' });
  } catch (err) {
    console.error('Error deleting member:', err);
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

    const deleted = await db.deleteMembers(env.DB, memberIds.map(id => parseInt(id, 10)));

    return json({ success: true, deleted });
  } catch (err) {
    console.error('Error deleting members:', err);
    return error('Failed to delete members', 500);
  }
}

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
