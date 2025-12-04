/**
 * Database helper functions for D1
 */

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
    'SELECT * FROM teams WHERE id = ?'
  ).bind(id).first();

  if (!team) return null;

  const members = await db.prepare(
    'SELECT * FROM members WHERE team_id = ? ORDER BY created_at'
  ).bind(id).all();

  return { ...team, members: members.results };
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
 * Verify team password
 */
export async function verifyTeamPassword(db, teamId, passwordHash) {
  const team = await db.prepare(
    'SELECT password_hash FROM teams WHERE id = ?'
  ).bind(teamId).first();

  if (!team) return false;
  return team.password_hash === passwordHash;
}

/**
 * Add member to team
 */
export async function addMember(db, teamId, member) {
  const { firstName, lastName, email, bacLevel = 0, isLeader = false, foodDiet = '' } = member;

  const result = await db.prepare(`
    INSERT INTO members (team_id, first_name, last_name, email, bac_level, is_leader, food_diet)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(teamId, firstName, lastName, email, bacLevel, isLeader ? 1 : 0, foodDiet).run();

  return { id: result.meta.last_row_id, ...member };
}

/**
 * Check if member exists (by first + last name)
 */
export async function memberExists(db, firstName, lastName) {
  const result = await db.prepare(
    'SELECT id FROM members WHERE first_name = ? AND last_name = ?'
  ).bind(firstName, lastName).first();
  return !!result;
}

/**
 * Get total participant count
 */
export async function getTotalParticipants(db) {
  const result = await db.prepare('SELECT COUNT(*) as count FROM members').first();
  return result?.count || 0;
}

/**
 * Get participant count excluding Organisation team
 */
export async function getParticipantsExcludingOrg(db) {
  const result = await db.prepare(`
    SELECT COUNT(*) as count FROM members m
    JOIN teams t ON m.team_id = t.id
    WHERE t.name != 'Organisation'
  `).first();
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
    WHERE t.name != 'Organisation'
    GROUP BY t.id
    ORDER BY t.created_at DESC
  `).all();
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
      t.name as team_name
    FROM members m
    JOIN teams t ON m.team_id = t.id
    ORDER BY t.name, m.last_name, m.first_name
  `).all();
  return result.results;
}

/**
 * Get members by team ID
 */
export async function getMembersByTeam(db, teamId) {
  const result = await db.prepare(
    'SELECT * FROM members WHERE team_id = ? ORDER BY last_name, first_name'
  ).bind(teamId).all();
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
 * Delete a team and all its members
 */
export async function deleteTeam(db, teamId) {
  // Delete members first (due to foreign key)
  await db.prepare('DELETE FROM members WHERE team_id = ?').bind(teamId).run();
  // Delete team
  const result = await db.prepare('DELETE FROM teams WHERE id = ?').bind(teamId).run();
  return result.meta.changes > 0;
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
export async function deleteMembers(db, memberIds) {
  if (!memberIds.length) return 0;

  const placeholders = memberIds.map(() => '?').join(',');
  const result = await db.prepare(
    `DELETE FROM members WHERE id IN (${placeholders})`
  ).bind(...memberIds).run();

  return result.meta.changes;
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
 * Get all members with attendance info for attendance management
 */
export async function getAllMembersWithAttendance(db) {
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
      m.created_at,
      t.id as team_id,
      t.name as team_name
    FROM members m
    JOIN teams t ON m.team_id = t.id
    WHERE t.name != 'Organisation'
    ORDER BY m.last_name, m.first_name
  `).all();
  return result.results;
}

/**
 * Check in a member (mark as present)
 */
export async function checkInMember(db, memberId) {
  const now = new Date().toISOString();
  const result = await db.prepare(`
    UPDATE members SET checked_in = 1, checked_in_at = ? WHERE id = ?
  `).bind(now, memberId).run();
  return result.meta.changes > 0;
}

/**
 * Check out a member (revoke attendance)
 */
export async function checkOutMember(db, memberId) {
  const result = await db.prepare(`
    UPDATE members SET checked_in = 0, checked_in_at = NULL WHERE id = ?
  `).bind(memberId).run();
  return result.meta.changes > 0;
}

/**
 * Get attendance statistics
 */
export async function getAttendanceStats(db) {
  const result = await db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN checked_in = 1 THEN 1 ELSE 0 END) as checked_in,
      SUM(CASE WHEN checked_in = 0 OR checked_in IS NULL THEN 1 ELSE 0 END) as not_checked_in
    FROM members m
    JOIN teams t ON m.team_id = t.id
    WHERE t.name != 'Organisation'
  `).first();
  return result;
}

/**
 * Batch check-in multiple members
 */
export async function checkInMembers(db, memberIds) {
  if (!memberIds.length) return 0;

  const now = new Date().toISOString();
  const placeholders = memberIds.map(() => '?').join(',');
  const result = await db.prepare(
    `UPDATE members SET checked_in = 1, checked_in_at = ? WHERE id IN (${placeholders})`
  ).bind(now, ...memberIds).run();

  return result.meta.changes;
}

/**
 * Batch check-out multiple members
 */
export async function checkOutMembers(db, memberIds) {
  if (!memberIds.length) return 0;

  const placeholders = memberIds.map(() => '?').join(',');
  const result = await db.prepare(
    `UPDATE members SET checked_in = 0, checked_in_at = NULL WHERE id IN (${placeholders})`
  ).bind(...memberIds).run();

  return result.meta.changes;
}
