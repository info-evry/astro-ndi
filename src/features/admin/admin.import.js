/**
 * Admin Import Module
 * Handles CSV import of teams and members
 */

import { json, error } from 'astro-core/router';
import { verifyAdmin } from '../../shared/auth.js';
import { hashPassword } from '../../shared/crypto.js';
import { readJsonObject, INVALID_JSON_MESSAGE } from '../../shared/http.js';
import * as db from '../../lib/db.js';

// Alphabet without ambiguous characters (no 0/O, 1/I/l, etc.) - not a secret,
// used only to build a charset for random generation.
const GENERATION_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const GENERATED_PASSWORD_LENGTH = 16;

/**
 * Generate a random, human-typeable password for newly created teams.
 * @returns {string}
 */
function generateTeamPassword() {
  const bytes = new Uint8Array(GENERATED_PASSWORD_LENGTH);
  crypto.getRandomValues(bytes);
  let generated = '';
  for (const byte of bytes) {
    generated += GENERATION_ALPHABET[byte % GENERATION_ALPHABET.length];
  }
  return generated;
}

/**
 * Parse CSV string into array of objects.
 * Lines whose column count does not match the header are not imported; they
 * are returned in `skippedLines` so they can be reported to the admin.
 * @param {string} csvText
 * @returns {{rows: Array<Record<string, string>>, skippedLines: string[]}}
 * @throws {Error} when there is no header row or no data row
 */
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV must have header row and at least one data row');
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const rows = [];
  const skippedLines = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length !== headers.length) {
      skippedLines.push(`Skipped line ${i + 1}: expected ${headers.length} columns, found ${values.length}`);
      continue;
    }

    const row = {};
    for (const [idx, header] of headers.entries()) {
      row[header] = values[idx].trim();
    }
    rows.push(row);
  }

  return { rows, skippedLines };
}

/**
 * Parse a single CSV line handling quoted values
 */
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (const char of line) {

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);

  return values;
}

/**
 * Group CSV rows by team name
 */
function groupRowsByTeam(rows) {
  const teamGroups = new Map();
  for (const row of rows) {
    const teamName = row.teamname || 'Sans équipe';
    if (!teamGroups.has(teamName)) {
      teamGroups.set(teamName, []);
    }
    teamGroups.get(teamName).push(row);
  }
  return teamGroups;
}

/**
 * Get or create a team
 */
async function getOrCreateTeam(database, teamName, teamMap, stats) {
  let team = teamMap.get(teamName.toLowerCase());
  if (team) return team;

  try {
    const password = generateTeamPassword();
    const passwordHash = await hashPassword(password);
    const result = await database.prepare(
      'INSERT INTO teams (name, description, password_hash) VALUES (?, ?, ?)'
    ).bind(teamName, '', passwordHash).run();

    team = { id: result.meta.last_row_id, name: teamName };
    teamMap.set(teamName.toLowerCase(), team);
    stats.teamsCreated++;
    stats.createdTeams.push({ team: teamName, password });
    return team;
  } catch (error_) {
    stats.errors.push(`Failed to create team "${teamName}": ${error_.message}`);
    return null;
  }
}

/**
 * Import a single member from CSV row
 */
async function importMember(database, teamId, row, stats) {
  const firstName = row.firstname || '';
  const lastName = row.lastname || '';
  const email = (row.email || '').toLowerCase();
  const foodDiet = row.fooddiet || 'none';
  const bacLevel = Number.parseInt(row.baclevel, 10) || 0;
  const isLeader = ['Yes', 'yes', '1'].includes(row.ismanager) ? 1 : 0;

  if (!firstName || !lastName || !email) {
    stats.membersSkipped++;
    stats.errors.push(`Skipped member: missing name or email (${firstName} ${lastName})`);
    return;
  }

  const existing = await database.prepare(
    'SELECT id FROM members WHERE first_name = ? AND last_name = ?'
  ).bind(firstName, lastName).first();

  if (existing) {
    stats.membersSkipped++;
    return;
  }

  await database.prepare(
    'INSERT INTO members (team_id, first_name, last_name, email, bac_level, is_leader, food_diet) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(teamId, firstName, lastName, email, bacLevel, isLeader, foodDiet).run();

  stats.membersImported++;
}

/**
 * POST /api/admin/import - Import members from CSV
 */
export async function importCSV(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const body = await readJsonObject(request);
    if (!body) {
      return error(INVALID_JSON_MESSAGE, 400);
    }
    const { csv } = body;

    if (!csv || typeof csv !== 'string') {
      return error('CSV data is required', 400);
    }

    let parsed;
    try {
      parsed = parseCSV(csv);
    } catch (error_) {
      return error(error_.message, 400);
    }
    const { rows, skippedLines } = parsed;
    if (rows.length === 0) {
      return error('No valid rows found in CSV', 400);
    }

    const requiredColumns = ['firstname', 'lastname', 'email', 'teamname'];
    const missingColumns = requiredColumns.filter(col => !(col in rows[0]));
    if (missingColumns.length > 0) {
      return error(`Missing required columns: ${missingColumns.join(', ')}`, 400);
    }

    const existingTeams = await db.getTeams(env.DB);
    const teamMap = new Map(existingTeams.map(t => [t.name.toLowerCase(), t]));
    const stats = { teamsCreated: 0, membersImported: 0, membersSkipped: skippedLines.length, errors: [...skippedLines], createdTeams: [] };
    const teamGroups = groupRowsByTeam(rows);

    for (const [teamName, members] of teamGroups) {
      const team = await getOrCreateTeam(env.DB, teamName, teamMap, stats);
      if (!team) continue;

      for (const row of members) {
        try {
          await importMember(env.DB, team.id, row, stats);
        } catch (error_) {
          stats.membersSkipped++;
          stats.errors.push(`Failed to import ${row.firstname} ${row.lastname}: ${error_.message}`);
        }
      }
    }

    return json({
      success: true,
      stats: {
        teamsCreated: stats.teamsCreated,
        membersImported: stats.membersImported,
        membersSkipped: stats.membersSkipped,
        totalRows: rows.length + skippedLines.length,
        errors: stats.errors.slice(0, 10)
      },
      passwords: stats.createdTeams
    });

  } catch (error_) {
    console.error('Import error:', error_);
    return error(error_.message || 'Failed to import CSV', 500);
  }
}
