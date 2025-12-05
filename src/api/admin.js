/**
 * Admin API handlers
 */

import { json, error } from '../lib/router.js';
import * as db from '../lib/db.js';
import { getCapacitySettings } from '../database/db.settings.js';

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
      const { getSetting } = await import('../database/db.settings.js');
      const dbSchoolName = await getSetting(env.DB, 'school_name');
      if (dbSchoolName) {
        schoolName = dbSchoolName;
      } else if (env.SCHOOL_NAME) {
        schoolName = env.SCHOOL_NAME;
      }
    } catch (e) {
      // Fall back to env value or default
      if (env.SCHOOL_NAME) schoolName = env.SCHOOL_NAME;
    }

    const csv = generateOfficialCSV(members, schoolName);

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="participants_officiel.csv"'
      }
    });
  } catch (err) {
    console.error('Error exporting official:', err);
    return error('Export failed', 500);
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
      const { getSetting } = await import('../database/db.settings.js');
      const dbSchoolName = await getSetting(env.DB, 'school_name');
      if (dbSchoolName) {
        schoolName = dbSchoolName;
      } else if (env.SCHOOL_NAME) {
        schoolName = env.SCHOOL_NAME;
      }
    } catch (e) {
      if (env.SCHOOL_NAME) schoolName = env.SCHOOL_NAME;
    }

    const csv = generateOfficialCSV(members, schoolName);
    const safeTeamName = team.name.replace(/[^a-z0-9]/gi, '_');

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="participants_officiel_${safeTeamName}.csv"`
      }
    });
  } catch (err) {
    console.error('Error exporting team official:', err);
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
    const teamsExcludingOrg = await db.getTeamsExcludingOrg(env.DB);
    const participantsExcludingOrg = await db.getParticipantsExcludingOrg(env.DB);
    const foodStats = await db.getFoodStats(env.DB);

    // Get capacity from D1 settings with env fallback
    const capacity = await getCapacitySettings(env.DB, env);
    const maxTotal = capacity.maxTotalParticipants;

    // Get detailed team info
    const teamsWithMembers = await Promise.all(
      teams.map(async t => {
        const team = await db.getTeamById(env.DB, t.id);
        return team;
      })
    );

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
    'estLeader (0\\1)',
    'ecole (nom exact saisi sur le site)'
  ];

  const rows = members.map(m => [
    m.first_name,
    (m.last_name || '').toUpperCase(),
    m.email,
    parseInt(m.bac_level, 10) || 0,
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

// ============ ATTENDANCE ENDPOINTS ============

/**
 * GET /api/admin/attendance - Get all members with attendance status
 */
export async function getAttendance(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const members = await db.getAllMembersWithPayment(env.DB);
    const stats = await db.getAttendanceStats(env.DB);
    const paymentStats = await db.getPaymentStats(env.DB);

    return json({
      members,
      stats: {
        total: stats?.total || 0,
        checked_in: stats?.checked_in || 0,
        not_checked_in: stats?.not_checked_in || 0,
        // Payment stats (nested for cleaner structure)
        payment: {
          total_paid: paymentStats?.total_paid || 0,
          total_revenue: paymentStats?.total_revenue || 0,
          asso_members: paymentStats?.asso_members || 0,
          asso_revenue: paymentStats?.asso_revenue || 0,
          non_members: paymentStats?.non_members || 0,
          non_member_revenue: paymentStats?.non_member_revenue || 0,
          late_arrivals: paymentStats?.late_arrivals || 0,
          late_revenue: paymentStats?.late_revenue || 0
        }
      }
    });
  } catch (err) {
    console.error('Error fetching attendance:', err);
    return error('Failed to fetch attendance', 500);
  }
}

/**
 * POST /api/admin/attendance/check-in/:id - Check in a member
 * Optionally accepts { paymentTier, paymentAmount } in body for paid check-in
 */
export async function checkInMember(request, env, ctx, params) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const memberId = parseInt(params.id, 10);

    const member = await db.getMemberById(env.DB, memberId);
    if (!member) {
      return error('Member not found', 404);
    }

    // Check for payment info in request body
    let paymentTier = null;
    let paymentAmount = null;

    try {
      const body = await request.json();
      if (body.paymentTier && body.paymentAmount !== undefined) {
        paymentTier = body.paymentTier;
        paymentAmount = parseInt(body.paymentAmount, 10);
      }
    } catch {
      // No body or invalid JSON - proceed without payment info
    }

    let success;
    if (paymentTier && paymentAmount !== null) {
      // Check in with payment
      success = await db.checkInWithPayment(env.DB, memberId, paymentTier, paymentAmount);
    } else {
      // Legacy check-in without payment
      success = await db.checkInMember(env.DB, memberId);
    }

    if (!success) {
      return error('Failed to check in member', 500);
    }

    const updated = await db.getMemberById(env.DB, memberId);

    return json({
      success: true,
      member: {
        id: updated.id,
        checked_in: updated.checked_in,
        checked_in_at: updated.checked_in_at,
        payment_tier: updated.payment_tier,
        payment_amount: updated.payment_amount,
        payment_confirmed_at: updated.payment_confirmed_at
      }
    });
  } catch (err) {
    console.error('Error checking in member:', err);
    return error('Failed to check in member', 500);
  }
}

/**
 * POST /api/admin/attendance/check-out/:id - Check out a member (revoke attendance)
 */
export async function checkOutMember(request, env, ctx, params) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const memberId = parseInt(params.id, 10);

    const member = await db.getMemberById(env.DB, memberId);
    if (!member) {
      return error('Member not found', 404);
    }

    const success = await db.checkOutMember(env.DB, memberId);
    if (!success) {
      return error('Failed to check out member', 500);
    }

    return json({
      success: true,
      member: {
        id: memberId,
        checked_in: 0,
        checked_in_at: null,
        payment_tier: null,
        payment_amount: null,
        payment_confirmed_at: null
      }
    });
  } catch (err) {
    console.error('Error checking out member:', err);
    return error('Failed to check out member', 500);
  }
}

/**
 * POST /api/admin/attendance/check-in-batch - Batch check in multiple members
 */
export async function checkInMembersBatch(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const { memberIds } = await request.json();

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return error('memberIds array is required', 400);
    }

    const count = await db.checkInMembers(env.DB, memberIds.map(id => parseInt(id, 10)));

    return json({ success: true, checked_in: count });
  } catch (err) {
    console.error('Error batch checking in:', err);
    return error('Failed to check in members', 500);
  }
}

/**
 * POST /api/admin/attendance/check-out-batch - Batch check out multiple members
 */
export async function checkOutMembersBatch(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const { memberIds } = await request.json();

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return error('memberIds array is required', 400);
    }

    const count = await db.checkOutMembers(env.DB, memberIds.map(id => parseInt(id, 10)));

    return json({ success: true, checked_out: count });
  } catch (err) {
    console.error('Error batch checking out:', err);
    return error('Failed to check out members', 500);
  }
}

// ============ PIZZA DISTRIBUTION ENDPOINTS ============

/**
 * GET /api/admin/pizza - Get all members with pizza distribution status
 */
export async function getPizza(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const members = await db.getAllMembersWithPizzaStatus(env.DB);
    const stats = await db.getPizzaStats(env.DB);

    return json({
      members,
      stats: {
        total: stats?.total || 0,
        received: stats?.received || 0,
        pending: stats?.pending || 0,
        by_type: stats?.by_type || [],
        present: stats?.present || { total: 0, received: 0, pending: 0, by_type: [] }
      }
    });
  } catch (err) {
    console.error('Error fetching pizza status:', err);
    return error('Failed to fetch pizza status', 500);
  }
}

/**
 * POST /api/admin/pizza/give/:id - Mark member as received pizza
 */
export async function givePizzaMember(request, env, ctx, params) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const memberId = parseInt(params.id, 10);

    const member = await db.getMemberById(env.DB, memberId);
    if (!member) {
      return error('Member not found', 404);
    }

    const success = await db.givePizza(env.DB, memberId);
    if (!success) {
      return error('Failed to give pizza', 500);
    }

    const updated = await db.getMemberById(env.DB, memberId);

    return json({
      success: true,
      member: {
        id: updated.id,
        pizza_received: updated.pizza_received,
        pizza_received_at: updated.pizza_received_at
      }
    });
  } catch (err) {
    console.error('Error giving pizza:', err);
    return error('Failed to give pizza', 500);
  }
}

/**
 * POST /api/admin/pizza/revoke/:id - Revoke pizza from member (undo)
 */
export async function revokePizzaMember(request, env, ctx, params) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const memberId = parseInt(params.id, 10);

    const member = await db.getMemberById(env.DB, memberId);
    if (!member) {
      return error('Member not found', 404);
    }

    const success = await db.revokePizza(env.DB, memberId);
    if (!success) {
      return error('Failed to revoke pizza', 500);
    }

    return json({
      success: true,
      member: {
        id: memberId,
        pizza_received: 0,
        pizza_received_at: null
      }
    });
  } catch (err) {
    console.error('Error revoking pizza:', err);
    return error('Failed to revoke pizza', 500);
  }
}

/**
 * POST /api/admin/pizza/give-batch - Batch give pizza to multiple members
 */
export async function givePizzaMembersBatch(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const { memberIds } = await request.json();

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return error('memberIds array is required', 400);
    }

    const count = await db.givePizzaBatch(env.DB, memberIds.map(id => parseInt(id, 10)));

    return json({ success: true, given: count });
  } catch (err) {
    console.error('Error batch giving pizza:', err);
    return error('Failed to give pizza', 500);
  }
}

/**
 * POST /api/admin/pizza/revoke-batch - Batch revoke pizza from multiple members
 */
export async function revokePizzaMembersBatch(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const { memberIds } = await request.json();

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return error('memberIds array is required', 400);
    }

    const count = await db.revokePizzaBatch(env.DB, memberIds.map(id => parseInt(id, 10)));

    return json({ success: true, revoked: count });
  } catch (err) {
    console.error('Error batch revoking pizza:', err);
    return error('Failed to revoke pizza', 500);
  }
}

// ============ ROOM ASSIGNMENT ENDPOINTS ============

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
    const teamId = parseInt(params.teamId, 10);

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
    for (const assignment of assignments) {
      if (!assignment.teamId) {
        return error('Each assignment must have a teamId', 400);
      }
      if (assignment.room && (typeof assignment.room !== 'string' || assignment.room.length > 50)) {
        return error('Room must be a string (max 50 characters)', 400);
      }
    }

    const count = await db.setTeamRoomsBatch(env.DB, assignments.map(a => ({
      teamId: parseInt(a.teamId, 10),
      room: a.room || null
    })));

    return json({ success: true, updated: count });
  } catch (err) {
    console.error('Error batch setting rooms:', err);
    return error('Failed to set rooms', 500);
  }
}
