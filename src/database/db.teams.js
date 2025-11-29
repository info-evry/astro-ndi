/**
 * Teams database operations
 */

/**
 * Get all teams with member count
 * @param {D1Database} db
 * @returns {Promise<Array>}
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
 * @param {D1Database} db
 * @param {number} id
 * @returns {Promise<object|null>}
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
 * @param {D1Database} db
 * @param {string} name
 * @returns {Promise<object|null>}
 */
export async function getTeamByName(db, name) {
  return db.prepare(
    'SELECT * FROM teams WHERE name = ?'
  ).bind(name).first();
}

/**
 * Create a new team with password
 * @param {D1Database} db
 * @param {string} name
 * @param {string} description
 * @param {string} passwordHash
 * @returns {Promise<{id: number, name: string, description: string}>}
 */
export async function createTeam(db, name, description = '', passwordHash = '') {
  const result = await db.prepare(
    'INSERT INTO teams (name, description, password_hash) VALUES (?, ?, ?)'
  ).bind(name, description, passwordHash).run();

  return { id: result.meta.last_row_id, name, description };
}

/**
 * Verify team password
 * @param {D1Database} db
 * @param {number} teamId
 * @param {string} passwordHash
 * @returns {Promise<boolean>}
 */
export async function verifyTeamPassword(db, teamId, passwordHash) {
  const team = await db.prepare(
    'SELECT password_hash FROM teams WHERE id = ?'
  ).bind(teamId).first();

  if (!team) return false;
  return team.password_hash === passwordHash;
}

/**
 * Update team details
 * @param {D1Database} db
 * @param {number} teamId
 * @param {object} updates
 * @returns {Promise<boolean>}
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
 * @param {D1Database} db
 * @param {number} teamId
 * @returns {Promise<boolean>}
 */
export async function deleteTeam(db, teamId) {
  // Delete members first (due to foreign key)
  await db.prepare('DELETE FROM members WHERE team_id = ?').bind(teamId).run();
  // Delete team
  const result = await db.prepare('DELETE FROM teams WHERE id = ?').bind(teamId).run();
  return result.meta.changes > 0;
}

/**
 * Get team member count
 * @param {D1Database} db
 * @param {number} teamId
 * @returns {Promise<number>}
 */
export async function getTeamMemberCount(db, teamId) {
  const result = await db.prepare(
    'SELECT COUNT(*) as count FROM members WHERE team_id = ?'
  ).bind(teamId).first();
  return result?.count || 0;
}
