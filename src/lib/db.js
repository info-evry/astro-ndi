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
