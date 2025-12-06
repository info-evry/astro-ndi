/**
 * Members database operations
 */

/**
 * Add member to team
 * @param {D1Database} db
 * @param {number} teamId
 * @param {object} member
 * @returns {Promise<object>}
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
 * Add member without duplicate check (admin only)
 * @param {D1Database} db
 * @param {number} teamId
 * @param {object} member
 * @returns {Promise<object>}
 */
export async function addMemberAdmin(db, teamId, member) {
  const { firstName, lastName, email, bacLevel = 0, isLeader = false, foodDiet = '' } = member;

  const result = await db.prepare(`
    INSERT INTO members (team_id, first_name, last_name, email, bac_level, is_leader, food_diet)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(teamId, firstName, lastName, email, bacLevel, isLeader ? 1 : 0, foodDiet).run();

  return { id: result.meta.last_row_id, teamId, ...member };
}

/**
 * Check if member exists (by first + last name)
 * @param {D1Database} db
 * @param {string} firstName
 * @param {string} lastName
 * @returns {Promise<boolean>}
 */
export async function memberExists(db, firstName, lastName) {
  const result = await db.prepare(
    'SELECT id FROM members WHERE first_name = ? AND last_name = ?'
  ).bind(firstName, lastName).first();
  return !!result;
}

/**
 * Get member by ID
 * @param {D1Database} db
 * @param {number} memberId
 * @returns {Promise<object|null>}
 */
export async function getMemberById(db, memberId) {
  return db.prepare('SELECT * FROM members WHERE id = ?').bind(memberId).first();
}

/**
 * Update member details
 * @param {D1Database} db
 * @param {number} memberId
 * @param {object} updates
 * @returns {Promise<boolean>}
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
 * @param {D1Database} db
 * @param {number} memberId
 * @returns {Promise<boolean>}
 */
export async function deleteMember(db, memberId) {
  const result = await db.prepare('DELETE FROM members WHERE id = ?').bind(memberId).run();
  return result.meta.changes > 0;
}

/**
 * Delete multiple members by IDs
 * @param {D1Database} db
 * @param {number[]} memberIds
 * @returns {Promise<number>}
 */
export async function deleteMembers(db, memberIds) {
  if (memberIds.length === 0) return 0;

  const placeholders = memberIds.map(() => '?').join(',');
  const result = await db.prepare(
    `DELETE FROM members WHERE id IN (${placeholders})`
  ).bind(...memberIds).run();

  return result.meta.changes;
}

/**
 * Get all members for export
 * @param {D1Database} db
 * @returns {Promise<Array>}
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
 * @param {D1Database} db
 * @param {number} teamId
 * @returns {Promise<Array>}
 */
export async function getMembersByTeam(db, teamId) {
  const result = await db.prepare(
    'SELECT * FROM members WHERE team_id = ? ORDER BY last_name, first_name'
  ).bind(teamId).all();
  return result.results;
}

/**
 * Get total participant count
 * @param {D1Database} db
 * @returns {Promise<number>}
 */
export async function getTotalParticipants(db) {
  const result = await db.prepare('SELECT COUNT(*) as count FROM members').first();
  return result?.count || 0;
}

/**
 * Get food diet statistics
 * @param {D1Database} db
 * @returns {Promise<Array<{food_diet: string, count: number}>>}
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

/**
 * Get BAC level distribution
 * @param {D1Database} db
 * @returns {Promise<Array<{bac_level: number, count: number}>>}
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
