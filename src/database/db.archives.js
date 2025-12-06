/**
 * Archives database operations
 * Handles yearly event archiving with GDPR-compliant data retention
 */

import { getSetting } from './db.settings.js';

/**
 * Detect the current event year
 * Uses admin setting if available, otherwise infers from registration dates
 * @param {D1Database} db
 * @returns {Promise<number>}
 */
export async function detectEventYear(db) {
  // First, check if admin has set the event year
  const settingYear = await getSetting(db, 'event_year');
  if (settingYear) {
    return parseInt(settingYear, 10);
  }

  // Fallback: infer from registration dates
  try {
    const result = await db.prepare(`
      SELECT 
        strftime('%Y', created_at) as year,
        strftime('%m', created_at) as month,
        COUNT(*) as count
      FROM members
      GROUP BY year, month
      ORDER BY count DESC
      LIMIT 1
    `).first();

    if (!result || !result.year) {
      return new Date().getFullYear();
    }

    const year = parseInt(result.year, 10);
    const month = parseInt(result.month, 10);

    // If January registrations, likely for previous year's event
    return month === 1 ? year - 1 : year;
  } catch {
    return new Date().getFullYear();
  }
}

/**
 * Check if an archive exists for a given year
 * @param {D1Database} db
 * @param {number} year
 * @returns {Promise<boolean>}
 */
export async function archiveExists(db, year) {
  const result = await db.prepare(
    'SELECT id FROM archives WHERE event_year = ?'
  ).bind(year).first();
  return !!result;
}

/**
 * Get all archives (metadata only, not full data)
 * @param {D1Database} db
 * @returns {Promise<Array>}
 */
export async function getArchives(db) {
  const result = await db.prepare(`
    SELECT 
      id,
      event_year,
      archived_at,
      expiration_date,
      is_expired,
      total_teams,
      total_participants,
      total_revenue,
      stats_json
    FROM archives
    ORDER BY event_year DESC
  `).all();
  return result.results;
}

/**
 * Get a specific archive by year with full data
 * @param {D1Database} db
 * @param {number} year
 * @returns {Promise<object|null>}
 */
export async function getArchiveByYear(db, year) {
  const archive = await db.prepare(
    'SELECT * FROM archives WHERE event_year = ?'
  ).bind(year).first();

  if (!archive) return null;

  // Parse JSON fields
  return {
    ...archive,
    teams: JSON.parse(archive.teams_json),
    members: JSON.parse(archive.members_json),
    payment_events: archive.payment_events_json ? JSON.parse(archive.payment_events_json) : [],
    stats: JSON.parse(archive.stats_json)
  };
}

/**
 * Create a new archive for the specified year
 * @param {D1Database} db
 * @param {number} year
 * @returns {Promise<object>}
 */
export async function createArchive(db, year) {
  // Get retention period from settings
  const retentionYears = parseInt(await getSetting(db, 'gdpr_retention_years') || '3', 10);
  
  // Calculate expiration date
  const expirationDate = new Date();
  expirationDate.setFullYear(expirationDate.getFullYear() + retentionYears);

  // Fetch all data to archive
  const teams = await fetchTeamsForArchive(db);
  const members = await fetchMembersForArchive(db);
  const paymentEvents = await fetchPaymentEventsForArchive(db);

  // Calculate statistics
  const stats = calculateStats(teams, members, paymentEvents);

  // Calculate total revenue
  const totalRevenue = members.reduce((sum, m) => sum + (m.payment_amount || 0), 0);

  // Prepare JSON data
  const teamsJson = JSON.stringify(teams);
  const membersJson = JSON.stringify(members);
  const paymentEventsJson = JSON.stringify(paymentEvents);
  const statsJson = JSON.stringify(stats);

  // Generate integrity hash
  const dataHash = generateDataHash({ teams, members, paymentEvents });

  // Insert archive
  const result = await db.prepare(`
    INSERT INTO archives (
      event_year,
      expiration_date,
      teams_json,
      members_json,
      payment_events_json,
      stats_json,
      total_teams,
      total_participants,
      total_revenue,
      data_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    year,
    expirationDate.toISOString(),
    teamsJson,
    membersJson,
    paymentEventsJson,
    statsJson,
    teams.length,
    members.length,
    totalRevenue,
    dataHash
  ).run();

  return {
    id: result.meta.last_row_id,
    event_year: year,
    expiration_date: expirationDate.toISOString(),
    teams_json: teamsJson,
    members_json: membersJson,
    payment_events_json: paymentEventsJson,
    stats_json: statsJson,
    total_teams: teams.length,
    total_participants: members.length,
    total_revenue: totalRevenue,
    data_hash: dataHash
  };
}

/**
 * Fetch teams for archiving (excludes password_hash)
 * @param {D1Database} db
 * @returns {Promise<Array>}
 */
async function fetchTeamsForArchive(db) {
  const result = await db.prepare(`
    SELECT 
      id,
      name,
      description,
      created_at,
      room_id
    FROM teams
    ORDER BY name
  `).all();

  // Add member count to each team
  const teams = result.results;
  for (const team of teams) {
    const countResult = await db.prepare(
      'SELECT COUNT(*) as count FROM members WHERE team_id = ?'
    ).bind(team.id).first();
    team.member_count = countResult?.count || 0;
  }

  return teams;
}

/**
 * Fetch members for archiving
 * @param {D1Database} db
 * @returns {Promise<Array>}
 */
async function fetchMembersForArchive(db) {
  const result = await db.prepare(`
    SELECT 
      id,
      team_id,
      first_name,
      last_name,
      email,
      bac_level,
      is_leader,
      food_diet,
      checked_in,
      checked_in_at,
      created_at,
      payment_status,
      payment_method,
      checkout_id,
      transaction_id,
      registration_tier,
      payment_amount,
      payment_confirmed_at,
      payment_tier
    FROM members
    ORDER BY team_id, last_name, first_name
  `).all();
  return result.results;
}

/**
 * Fetch payment events for archiving
 * @param {D1Database} db
 * @returns {Promise<Array>}
 */
async function fetchPaymentEventsForArchive(db) {
  try {
    const result = await db.prepare(`
      SELECT 
        id,
        member_id,
        checkout_id,
        event_type,
        amount,
        tier,
        metadata,
        created_at
      FROM payment_events
      ORDER BY created_at
    `).all();
    return result.results;
  } catch {
    // Table might not exist
    return [];
  }
}

/**
 * Calculate statistics from data
 * @param {Array} teams
 * @param {Array} members
 * @param {Array} paymentEvents
 * @returns {object}
 */
export function calculateStats(teams, members, paymentEvents) {
  // BAC level distribution
  const participantsByBacLevel = {};
  for (const member of members) {
    const level = String(member.bac_level || 0);
    participantsByBacLevel[level] = (participantsByBacLevel[level] || 0) + 1;
  }

  // Food preferences
  const foodPreferences = {};
  for (const member of members) {
    if (member.food_diet) {
      foodPreferences[member.food_diet] = (foodPreferences[member.food_diet] || 0) + 1;
    }
  }

  // Attendance
  const checkedIn = members.filter(m => m.checked_in).length;
  const noShow = members.length - checkedIn;

  // Payment stats
  const paid = members.filter(m => m.payment_status === 'paid').length;
  const unpaid = members.filter(m => m.payment_status !== 'paid').length;
  const paidOnline = members.filter(m => m.payment_method === 'online' && m.payment_status === 'paid').length;
  const paidOnsite = members.filter(m => m.payment_method === 'on_site' && m.payment_status === 'paid').length;
  const totalRevenue = members.reduce((sum, m) => sum + (m.payment_amount || 0), 0);

  // Registration timeline (by date)
  const registrationTimeline = {};
  for (const member of members) {
    if (member.created_at) {
      const date = member.created_at.split('T')[0];
      registrationTimeline[date] = (registrationTimeline[date] || 0) + 1;
    }
  }

  return {
    total_teams: teams.length,
    total_participants: members.length,
    participants_by_bac_level: participantsByBacLevel,
    food_preferences: foodPreferences,
    attendance: {
      checked_in: checkedIn,
      no_show: noShow
    },
    payments: {
      total_revenue: totalRevenue,
      paid: paid,
      unpaid: unpaid,
      paid_online: paidOnline,
      paid_onsite: paidOnsite
    },
    registration_timeline: registrationTimeline
  };
}

/**
 * Generate a hash for data integrity verification
 * Uses a simple hash for D1/Edge runtime compatibility
 * @param {object} data
 * @returns {string}
 */
export function generateDataHash(data) {
  const str = JSON.stringify(data);
  // Simple hash for Edge runtime compatibility
  // In production, consider using SubtleCrypto if available
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Anonymize member data for GDPR compliance
 * @param {Array} members
 * @returns {Array}
 */
export function anonymizeMembers(members) {
  return members.map((member, index) => ({
    ...member,
    // Anonymize personal data
    first_name: 'Participant',
    last_name: '',
    email: null,
    // Remove external references
    checkout_id: null,
    transaction_id: null
  }));
}

/**
 * Anonymize payment events for GDPR compliance
 * @param {Array} events
 * @returns {Array}
 */
export function anonymizePaymentEvents(events) {
  return events.map(event => ({
    ...event,
    checkout_id: null,
    metadata: null // May contain personal data
  }));
}

/**
 * Check if an archive has expired and apply anonymization if needed
 * @param {D1Database} db
 * @param {number} year
 * @returns {Promise<{expired: boolean, updated: boolean}>}
 */
export async function checkAndApplyExpiration(db, year) {
  const archive = await db.prepare(
    'SELECT * FROM archives WHERE event_year = ?'
  ).bind(year).first();

  if (!archive) {
    return { expired: false, updated: false };
  }

  // Already expired and processed
  if (archive.is_expired) {
    return { expired: true, updated: false };
  }

  // Check if expiration date has passed
  const expirationDate = new Date(archive.expiration_date);
  const now = new Date();

  if (now < expirationDate) {
    return { expired: false, updated: false };
  }

  // Apply anonymization
  const members = JSON.parse(archive.members_json);
  const anonymizedMembers = anonymizeMembers(members);

  const paymentEvents = archive.payment_events_json 
    ? JSON.parse(archive.payment_events_json) 
    : [];
  const anonymizedEvents = anonymizePaymentEvents(paymentEvents);

  // Update archive with anonymized data
  await db.prepare(`
    UPDATE archives 
    SET 
      members_json = ?,
      payment_events_json = ?,
      is_expired = 1
    WHERE event_year = ?
  `).bind(
    JSON.stringify(anonymizedMembers),
    JSON.stringify(anonymizedEvents),
    year
  ).run();

  return { expired: true, updated: true };
}

/**
 * Check all archives for expiration
 * @param {D1Database} db
 * @returns {Promise<Array<{year: number, expired: boolean, updated: boolean}>>}
 */
export async function checkAllExpirations(db) {
  const archives = await getArchives(db);
  const results = [];

  for (const archive of archives) {
    if (!archive.is_expired) {
      const result = await checkAndApplyExpiration(db, archive.event_year);
      results.push({ year: archive.event_year, ...result });
    }
  }

  return results;
}

/**
 * Reset all event data (teams, members, payments)
 * Does NOT affect archives
 * @param {D1Database} db
 * @returns {Promise<{teams: number, members: number, payments: number}>}
 */
export async function resetAllData(db) {
  // Delete in order to respect foreign keys
  const paymentsResult = await db.prepare('DELETE FROM payment_events').run();
  const membersResult = await db.prepare('DELETE FROM members').run();
  const teamsResult = await db.prepare('DELETE FROM teams').run();

  return {
    teams: teamsResult.meta.changes,
    members: membersResult.meta.changes,
    payments: paymentsResult.meta.changes
  };
}

/**
 * Get data counts for reset confirmation
 * @param {D1Database} db
 * @returns {Promise<{teams: number, members: number, payments: number}>}
 */
export async function getDataCounts(db) {
  const teamsCount = await db.prepare('SELECT COUNT(*) as count FROM teams').first();
  const membersCount = await db.prepare('SELECT COUNT(*) as count FROM members').first();
  
  let paymentsCount = { count: 0 };
  try {
    paymentsCount = await db.prepare('SELECT COUNT(*) as count FROM payment_events').first();
  } catch {
    // Table might not exist
  }

  return {
    teams: teamsCount?.count || 0,
    members: membersCount?.count || 0,
    payments: paymentsCount?.count || 0
  };
}
