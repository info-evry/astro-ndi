/**
 * Database helper functions for D1
 *
 * The Organisation team (ORGANISATION_TEAM_NAME) is bound as a query
 * parameter wherever a statement excludes it.
 */

import { runByIds } from 'astro-core/d1';
import { ORGANISATION_TEAM_NAME, PAYMENT_TIER, isNoPizza } from '../shared/constants.js';

const NOW_ISO = () => new Date().toISOString();

// Cleared by check-out, shared by the single and the batch statements.
const CLEAR_ATTENDANCE_SQL = `
  checked_in = 0,
  checked_in_at = NULL,
  payment_tier = NULL,
  payment_amount = NULL,
  payment_confirmed_at = NULL`;

// ============ TEAMS ============

/**
 * Get all teams with member count
 */
export async function getTeams(db) {
  const result = await db.prepare(`
    SELECT
      t.id,
      t.name,
      t.description,
      t.created_at,
      COUNT(m.id) as member_count
    FROM teams t
    LEFT JOIN members m ON t.id = m.team_id
    GROUP BY t.id
    ORDER BY t.created_at DESC
  `).all();
  return result.results;
}

/**
 * Get team by ID with all members
 */
export async function getTeamById(db, id) {
  const team = await db.prepare(
    'SELECT id, name, description, room, password_hash, created_at FROM teams WHERE id = ?'
  ).bind(id).first();

  if (!team) return null;

  const members = await db.prepare(
    'SELECT * FROM members WHERE team_id = ? ORDER BY created_at'
  ).bind(id).all();

  return { ...team, members: members.results };
}

/**
 * Get all teams with their members in 2 queries (avoids N+1)
 */
export async function getAllTeamsWithMembers(db) {
  // Fetch all teams
  const teamsResult = await db.prepare(
    'SELECT id, name, description, room, created_at FROM teams ORDER BY created_at DESC'
  ).all();

  const teams = teamsResult.results || [];
  if (teams.length === 0) return [];

  // Fetch all members
  const membersResult = await db.prepare(
    'SELECT * FROM members ORDER BY created_at'
  ).all();

  const members = membersResult.results || [];

  // Group members by team_id
  const membersByTeam = new Map();
  for (const member of members) {
    if (!membersByTeam.has(member.team_id)) {
      membersByTeam.set(member.team_id, []);
    }
    membersByTeam.get(member.team_id).push(member);
  }

  // Assemble teams with their members
  return teams.map(team => ({
    ...team,
    members: membersByTeam.get(team.id) || []
  }));
}

/**
 * Get team by name
 */
export async function getTeamByName(db, name) {
  return db.prepare(
    'SELECT * FROM teams WHERE name = ?'
  ).bind(name).first();
}

/**
 * Create a new team with password
 */
export async function createTeam(db, name, description = '', passwordHash = '') {
  const result = await db.prepare(
    'INSERT INTO teams (name, description, password_hash) VALUES (?, ?, ?)'
  ).bind(name, description, passwordHash).run();

  return { id: result.meta.last_row_id, name, description };
}

/**
 * Get participant count excluding the Organisation team.
 *
 * This is THE capacity figure: the registration capacity check, the public
 * `available_spots` and the admin statistics all use it.
 */
export async function getParticipantsExcludingOrg(db) {
  const result = await db.prepare(`
    SELECT COUNT(*) as count FROM members m
    JOIN teams t ON m.team_id = t.id
    WHERE t.name != ?
  `).bind(ORGANISATION_TEAM_NAME).first();
  return result?.count || 0;
}

/**
 * Get teams excluding Organisation
 */
export async function getTeamsExcludingOrg(db) {
  const result = await db.prepare(`
    SELECT
      t.id,
      t.name,
      t.description,
      t.created_at,
      COUNT(m.id) as member_count
    FROM teams t
    LEFT JOIN members m ON t.id = m.team_id
    WHERE t.name != ?
    GROUP BY t.id
    ORDER BY t.created_at DESC
  `).bind(ORGANISATION_TEAM_NAME).all();
  return result.results;
}

/**
 * Get team member count
 */
export async function getTeamMemberCount(db, teamId) {
  const result = await db.prepare(
    'SELECT COUNT(*) as count FROM members WHERE team_id = ?'
  ).bind(teamId).first();
  return result?.count || 0;
}

/**
 * Get all members for export
 */
export async function getAllMembers(db) {
  const result = await db.prepare(`
    SELECT
      m.id,
      m.first_name,
      m.last_name,
      m.email,
      m.bac_level,
      m.is_leader,
      m.food_diet,
      m.created_at,
      t.name as team_name,
      t.room as team_room
    FROM members m
    JOIN teams t ON m.team_id = t.id
    ORDER BY t.name, m.last_name, m.first_name
  `).all();
  return result.results;
}

/**
 * Get BAC level distribution
 */
export async function getBacLevelStats(db) {
  const result = await db.prepare(`
    SELECT bac_level, COUNT(*) as count
    FROM members
    GROUP BY bac_level
    ORDER BY bac_level
  `).all();
  return result.results;
}

/**
 * Get food diet statistics
 */
export async function getFoodStats(db) {
  const result = await db.prepare(`
    SELECT food_diet, COUNT(*) as count
    FROM members
    WHERE food_diet != ''
    GROUP BY food_diet
    ORDER BY count DESC
  `).all();
  return result.results;
}

// ============ ADMIN CRUD OPERATIONS ============

/**
 * Update team details
 */
export async function updateTeam(db, teamId, updates) {
  const fields = [];
  const values = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.passwordHash !== undefined) {
    fields.push('password_hash = ?');
    values.push(updates.passwordHash);
  }

  if (fields.length === 0) return false;

  values.push(teamId);
  await db.prepare(
    `UPDATE teams SET ${fields.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  return true;
}

/**
 * Delete a team and all its members (one atomic batch)
 */
export async function deleteTeam(db, teamId) {
  const [, teamResult] = await db.batch([
    db.prepare('DELETE FROM members WHERE team_id = ?').bind(teamId),
    db.prepare('DELETE FROM teams WHERE id = ?').bind(teamId)
  ]);
  return teamResult.meta.changes > 0;
}

/**
 * Get member by ID
 */
export async function getMemberById(db, memberId) {
  return db.prepare('SELECT * FROM members WHERE id = ?').bind(memberId).first();
}

/**
 * Update member details
 */
export async function updateMember(db, memberId, updates) {
  const fields = [];
  const values = [];

  if (updates.firstName !== undefined) {
    fields.push('first_name = ?');
    values.push(updates.firstName);
  }
  if (updates.lastName !== undefined) {
    fields.push('last_name = ?');
    values.push(updates.lastName);
  }
  if (updates.email !== undefined) {
    fields.push('email = ?');
    values.push(updates.email);
  }
  if (updates.bacLevel !== undefined) {
    fields.push('bac_level = ?');
    values.push(updates.bacLevel);
  }
  if (updates.isLeader !== undefined) {
    fields.push('is_leader = ?');
    values.push(updates.isLeader ? 1 : 0);
  }
  if (updates.foodDiet !== undefined) {
    fields.push('food_diet = ?');
    values.push(updates.foodDiet);
  }
  if (updates.teamId !== undefined) {
    fields.push('team_id = ?');
    values.push(updates.teamId);
  }

  if (fields.length === 0) return false;

  values.push(memberId);
  await db.prepare(
    `UPDATE members SET ${fields.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  return true;
}

/**
 * Delete a single member
 */
export async function deleteMember(db, memberId) {
  const result = await db.prepare('DELETE FROM members WHERE id = ?').bind(memberId).run();
  return result.meta.changes > 0;
}

/**
 * Delete multiple members by IDs
 */
export function deleteMembers(db, memberIds) {
  return runByIds(db, memberIds, (placeholders) => `DELETE FROM members WHERE id IN (${placeholders})`);
}

/**
 * Add member without duplicate check (admin only)
 */
export async function addMemberAdmin(db, teamId, member) {
  const { firstName, lastName, email, bacLevel = 0, isLeader = false, foodDiet = '' } = member;

  const result = await db.prepare(`
    INSERT INTO members (team_id, first_name, last_name, email, bac_level, is_leader, food_diet)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(teamId, firstName, lastName, email, bacLevel, isLeader ? 1 : 0, foodDiet).run();

  return { id: result.meta.last_row_id, teamId, ...member };
}

// ============ ATTENDANCE TRACKING ============

/**
 * Check in a member (mark as present)
 */
export async function checkInMember(db, memberId) {
  const result = await db.prepare(`
    UPDATE members SET checked_in = 1, checked_in_at = ? WHERE id = ?
  `).bind(NOW_ISO(), memberId).run();
  return result.meta.changes > 0;
}

/**
 * Check out a member (revoke attendance)
 */
export async function checkOutMember(db, memberId) {
  const result = await db.prepare(`
    UPDATE members SET ${CLEAR_ATTENDANCE_SQL} WHERE id = ?
  `).bind(memberId).run();
  return result.meta.changes > 0;
}

/**
 * Get attendance statistics
 */
export async function getAttendanceStats(db) {
  return await db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN checked_in = 1 THEN 1 ELSE 0 END) as checked_in,
      SUM(CASE WHEN checked_in = 0 OR checked_in IS NULL THEN 1 ELSE 0 END) as not_checked_in
    FROM members m
    JOIN teams t ON m.team_id = t.id
  `).first();
}

/**
 * Batch check-in multiple members
 */
export function checkInMembers(db, memberIds) {
  return runByIds(
    db,
    memberIds,
    (placeholders) => `UPDATE members SET checked_in = 1, checked_in_at = ? WHERE id IN (${placeholders})`,
    { leadingParams: [NOW_ISO()] }
  );
}

/**
 * Batch check-out multiple members
 */
export function checkOutMembers(db, memberIds) {
  return runByIds(db, memberIds, (placeholders) => `
    UPDATE members SET ${CLEAR_ATTENDANCE_SQL} WHERE id IN (${placeholders})
  `);
}

// ============ PIZZA DISTRIBUTION TRACKING ============

/**
 * Get all members with pizza distribution status
 */
export async function getAllMembersWithPizzaStatus(db) {
  const result = await db.prepare(`
    SELECT
      m.id,
      m.first_name,
      m.last_name,
      m.email,
      m.bac_level,
      m.is_leader,
      m.food_diet,
      m.checked_in,
      m.checked_in_at,
      m.pizza_received,
      m.pizza_received_at,
      m.created_at,
      t.id as team_id,
      t.name as team_name,
      t.room as team_room
    FROM members m
    JOIN teams t ON m.team_id = t.id
    ORDER BY m.last_name, m.first_name
  `).all();
  return result.results;
}

/** Rows of a `GROUP BY food_diet` query, without the "no pizza" values. */
const onlyRealPizzas = (rows) => rows.filter(row => !isNoPizza(row.food_diet));

/**
 * Get pizza distribution statistics.
 *
 * `by_type` lists real pizzas only: members whose `food_diet` means "no pizza"
 * (`isNoPizza`: '', 'none', '0-rien') are not a pizza type.
 */
export async function getPizzaStats(db) {
  // All members stats
  const result = await db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN pizza_received = 1 THEN 1 ELSE 0 END) as received,
      SUM(CASE WHEN pizza_received = 0 OR pizza_received IS NULL THEN 1 ELSE 0 END) as pending
    FROM members m
    JOIN teams t ON m.team_id = t.id
  `).first();

  // Stats for present (checked-in) members only
  const presentResult = await db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN pizza_received = 1 THEN 1 ELSE 0 END) as received,
      SUM(CASE WHEN pizza_received = 0 OR pizza_received IS NULL THEN 1 ELSE 0 END) as pending
    FROM members m
    JOIN teams t ON m.team_id = t.id
    WHERE m.checked_in = 1
  `).first();

  // Stats by pizza type (all members)
  const byType = await db.prepare(`
    SELECT
      food_diet,
      COUNT(*) as total,
      SUM(CASE WHEN pizza_received = 1 THEN 1 ELSE 0 END) as received
    FROM members
    WHERE food_diet IS NOT NULL AND food_diet != ''
    GROUP BY food_diet
    ORDER BY total DESC
  `).all();

  // Stats by pizza type (present members only)
  const byTypePresent = await db.prepare(`
    SELECT
      food_diet,
      COUNT(*) as total,
      SUM(CASE WHEN pizza_received = 1 THEN 1 ELSE 0 END) as received
    FROM members
    WHERE food_diet IS NOT NULL AND food_diet != '' AND checked_in = 1
    GROUP BY food_diet
    ORDER BY total DESC
  `).all();

  return {
    ...result,
    by_type: onlyRealPizzas(byType.results),
    present: {
      total: presentResult?.total || 0,
      received: presentResult?.received || 0,
      pending: presentResult?.pending || 0,
      by_type: onlyRealPizzas(byTypePresent.results)
    }
  };
}

/**
 * Mark member as received pizza
 */
export async function givePizza(db, memberId) {
  const result = await db.prepare(`
    UPDATE members SET pizza_received = 1, pizza_received_at = ? WHERE id = ?
  `).bind(NOW_ISO(), memberId).run();
  return result.meta.changes > 0;
}

/**
 * Revoke pizza from member (undo distribution)
 */
export async function revokePizza(db, memberId) {
  const result = await db.prepare(`
    UPDATE members SET pizza_received = 0, pizza_received_at = NULL WHERE id = ?
  `).bind(memberId).run();
  return result.meta.changes > 0;
}

/**
 * Batch give pizza to multiple members
 */
export function givePizzaBatch(db, memberIds) {
  return runByIds(
    db,
    memberIds,
    (placeholders) => `UPDATE members SET pizza_received = 1, pizza_received_at = ? WHERE id IN (${placeholders})`,
    { leadingParams: [NOW_ISO()] }
  );
}

/**
 * Batch revoke pizza from multiple members
 */
export function revokePizzaBatch(db, memberIds) {
  return runByIds(
    db,
    memberIds,
    (placeholders) => `UPDATE members SET pizza_received = 0, pizza_received_at = NULL WHERE id IN (${placeholders})`
  );
}

// ============ PAYMENT TRACKING ============

/**
 * Check in a member with payment information
 */
export async function checkInWithPayment(db, memberId, paymentTier, paymentAmount) {
  const now = NOW_ISO();
  const result = await db.prepare(`
    UPDATE members
    SET checked_in = 1,
        checked_in_at = ?,
        payment_tier = ?,
        payment_amount = ?,
        payment_confirmed_at = ?
    WHERE id = ?
  `).bind(now, paymentTier, paymentAmount, now, memberId).run();
  return result.meta.changes > 0;
}

/**
 * Revenue / head count per payment TIER recorded at check-in
 * (`payment_tier`), Organisation team excluded.
 *
 * Not to be confused with `getPaymentStatusStats` (database/db.payments.js),
 * which groups the online payment STATUS (`payment_status`).
 */
export async function getTierStats(db) {
  const { ASSO_MEMBER, NON_MEMBER, LATE } = PAYMENT_TIER;
  return await db.prepare(`
    SELECT
      COUNT(CASE WHEN payment_tier IS NOT NULL THEN 1 END) as total_paid,
      SUM(CASE WHEN payment_amount IS NOT NULL THEN payment_amount ELSE 0 END) as total_revenue,
      COUNT(CASE WHEN payment_tier = ? THEN 1 END) as asso_members,
      SUM(CASE WHEN payment_tier = ? THEN payment_amount ELSE 0 END) as asso_revenue,
      COUNT(CASE WHEN payment_tier = ? THEN 1 END) as non_members,
      SUM(CASE WHEN payment_tier = ? THEN payment_amount ELSE 0 END) as non_member_revenue,
      COUNT(CASE WHEN payment_tier = ? THEN 1 END) as late_arrivals,
      SUM(CASE WHEN payment_tier = ? THEN payment_amount ELSE 0 END) as late_revenue
    FROM members m
    JOIN teams t ON m.team_id = t.id
    WHERE t.name != ?
  `).bind(
    ASSO_MEMBER, ASSO_MEMBER,
    NON_MEMBER, NON_MEMBER,
    LATE, LATE,
    ORGANISATION_TEAM_NAME
  ).first();
}

/**
 * Get all members with payment information for attendance view
 */
export async function getAllMembersWithPayment(db) {
  const result = await db.prepare(`
    SELECT
      m.id,
      m.first_name,
      m.last_name,
      m.email,
      m.bac_level,
      m.is_leader,
      m.food_diet,
      m.checked_in,
      m.checked_in_at,
      m.payment_status,
      m.payment_method,
      m.registration_tier,
      m.payment_tier,
      m.payment_amount,
      m.payment_confirmed_at,
      m.checkout_id,
      m.transaction_id,
      m.created_at,
      t.id as team_id,
      t.name as team_name,
      t.room as team_room
    FROM members m
    JOIN teams t ON m.team_id = t.id
    ORDER BY m.last_name, m.first_name
  `).all();
  return result.results;
}

// ============ ROOM ASSIGNMENT ============

/**
 * Get all teams with room assignments (Organisation excluded)
 */
export async function getTeamsWithRooms(db) {
  const result = await db.prepare(`
    SELECT
      t.id,
      t.name,
      t.description,
      t.room,
      t.created_at,
      COUNT(m.id) as member_count
    FROM teams t
    LEFT JOIN members m ON t.id = m.team_id
    WHERE t.name != ?
    GROUP BY t.id
    ORDER BY t.room IS NULL, t.room, t.name
  `).bind(ORGANISATION_TEAM_NAME).all();
  return result.results;
}

/**
 * Get room assignment statistics (Organisation excluded)
 */
export async function getRoomStats(db) {
  const result = await db.prepare(`
    SELECT
      COUNT(DISTINCT t.id) as total_teams,
      COUNT(DISTINCT CASE WHEN t.room IS NOT NULL AND t.room != '' THEN t.id END) as assigned_teams,
      COUNT(DISTINCT CASE WHEN t.room IS NULL OR t.room = '' THEN t.id END) as unassigned_teams
    FROM teams t
    WHERE t.name != ?
  `).bind(ORGANISATION_TEAM_NAME).first();

  // Get rooms with team counts
  const byRoom = await db.prepare(`
    SELECT
      t.room,
      COUNT(t.id) as team_count,
      SUM((SELECT COUNT(*) FROM members m WHERE m.team_id = t.id)) as member_count
    FROM teams t
    WHERE t.name != ? AND t.room IS NOT NULL AND t.room != ''
    GROUP BY t.room
    ORDER BY t.room
  `).bind(ORGANISATION_TEAM_NAME).all();

  return { ...result, by_room: byRoom.results };
}

/**
 * Get pizza stats grouped by room (Organisation and "no pizza" excluded)
 */
export async function getPizzaStatsByRoom(db) {
  const result = await db.prepare(`
    SELECT
      t.room,
      m.food_diet,
      COUNT(*) as total,
      SUM(CASE WHEN m.checked_in = 1 THEN 1 ELSE 0 END) as present,
      SUM(CASE WHEN m.pizza_received = 1 THEN 1 ELSE 0 END) as received
    FROM members m
    JOIN teams t ON m.team_id = t.id
    WHERE t.name != ?
      AND t.room IS NOT NULL AND t.room != ''
      AND m.food_diet IS NOT NULL AND m.food_diet != ''
    GROUP BY t.room, m.food_diet
    ORDER BY t.room, m.food_diet
  `).bind(ORGANISATION_TEAM_NAME).all();

  // Group by room
  const byRoom = {};
  for (const row of result.results) {
    if (isNoPizza(row.food_diet)) continue;
    if (!byRoom[row.room]) {
      byRoom[row.room] = {
        room: row.room,
        pizzas: [],
        totals: { total: 0, present: 0, received: 0 }
      };
    }
    byRoom[row.room].pizzas.push({
      food_diet: row.food_diet,
      total: row.total,
      present: row.present,
      received: row.received
    });
    byRoom[row.room].totals.total += row.total;
    byRoom[row.room].totals.present += row.present;
    byRoom[row.room].totals.received += row.received;
  }

  return Object.values(byRoom);
}

/**
 * Assign a room to a team
 */
export async function setTeamRoom(db, teamId, room) {
  const result = await db.prepare(`
    UPDATE teams SET room = ? WHERE id = ?
  `).bind(room || null, teamId).run();
  return result.meta.changes > 0;
}

/**
 * Batch assign rooms to teams, atomically (one D1 batch).
 *
 * @param {D1Database} db
 * @param {Array<{ teamId: number, room: string|null }>} assignments - one entry per team
 * @returns {Promise<{ updated: number, skipped: number[] }>} `skipped` are the
 *   team ids that do not exist (their update changed nothing)
 */
export async function setTeamRoomsBatch(db, assignments) {
  if (assignments.length === 0) return { updated: 0, skipped: [] };

  const results = await db.batch(
    assignments.map(({ teamId, room }) =>
      db.prepare('UPDATE teams SET room = ? WHERE id = ?').bind(room || null, teamId)
    )
  );

  let updated = 0;
  const skipped = [];
  for (const [i, result] of results.entries()) {
    const changes = Number(result?.meta?.changes) || 0;
    updated += changes;
    if (changes === 0) skipped.push(assignments[i].teamId);
  }
  return { updated, skipped };
}

/**
 * Get distinct rooms for autocomplete
 */
export async function getDistinctRooms(db) {
  const result = await db.prepare(`
    SELECT DISTINCT room FROM teams
    WHERE room IS NOT NULL AND room != ''
    ORDER BY room
  `).all();
  return result.results.map(r => r.room);
}
