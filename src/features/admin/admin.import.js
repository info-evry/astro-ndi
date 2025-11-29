/**
 * Admin Import Module
 * Handles CSV import of teams and members
 */

import { json, error } from '../../shared/response.js';
import { verifyAdmin } from '../../shared/auth.js';
import { hashPassword } from '../../shared/crypto.js';
import * as db from '../../lib/db.js';

/**
 * Parse CSV string into array of objects
 */
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV must have header row and at least one data row');
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length !== headers.length) {
      console.warn(`Skipping line ${i + 1}: column count mismatch`);
      continue;
    }

    const row = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx].trim();
    });
    rows.push(row);
  }

  return rows;
}

/**
 * Parse a single CSV line handling quoted values
 */
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

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
 * POST /api/admin/import - Import members from CSV
 */
export async function importCSV(request, env) {
  // Verify admin
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const body = await request.json();
    const { csv } = body;

    if (!csv || typeof csv !== 'string') {
      return error('CSV data is required', 400);
    }

    // Parse CSV
    const rows = parseCSV(csv);
    if (rows.length === 0) {
      return error('No valid rows found in CSV', 400);
    }

    // Validate required columns
    const requiredColumns = ['firstname', 'lastname', 'email', 'teamname'];
    const firstRow = rows[0];
    const missingColumns = requiredColumns.filter(col => !(col in firstRow));
    if (missingColumns.length > 0) {
      return error(`Missing required columns: ${missingColumns.join(', ')}`, 400);
    }

    // Get existing teams
    const existingTeams = await db.getTeams(env.DB);
    const teamMap = new Map(existingTeams.map(t => [t.name.toLowerCase(), t]));

    // Track stats
    const stats = {
      teamsCreated: 0,
      membersImported: 0,
      membersSkipped: 0,
      errors: []
    };

    // Group rows by team
    const teamGroups = new Map();
    for (const row of rows) {
      const teamName = row.teamname || 'Sans équipe';
      if (!teamGroups.has(teamName)) {
        teamGroups.set(teamName, []);
      }
      teamGroups.get(teamName).push(row);
    }

    // Process each team
    for (const [teamName, members] of teamGroups) {
      let team = teamMap.get(teamName.toLowerCase());

      // Create team if doesn't exist
      if (!team) {
        try {
          // Password is the team name
          const passwordHash = await hashPassword(teamName);
          const result = await env.DB.prepare(
            'INSERT INTO teams (name, description, password_hash) VALUES (?, ?, ?)'
          ).bind(teamName, '', passwordHash).run();

          team = {
            id: result.meta.last_row_id,
            name: teamName
          };
          teamMap.set(teamName.toLowerCase(), team);
          stats.teamsCreated++;
        } catch (err) {
          stats.errors.push(`Failed to create team "${teamName}": ${err.message}`);
          continue;
        }
      }

      // Add members to team
      for (const row of members) {
        try {
          const firstName = row.firstname || '';
          const lastName = row.lastname || '';
          const email = (row.email || '').toLowerCase();
          const foodDiet = row.fooddiet || 'none';
          const bacLevel = parseInt(row.baclevel, 10) || 0;
          const isLeader = row.ismanager === 'Yes' || row.ismanager === 'yes' || row.ismanager === '1' ? 1 : 0;

          if (!firstName || !lastName || !email) {
            stats.membersSkipped++;
            stats.errors.push(`Skipped member: missing name or email (${firstName} ${lastName})`);
            continue;
          }

          // Check if member already exists
          const existing = await env.DB.prepare(
            'SELECT id FROM members WHERE first_name = ? AND last_name = ?'
          ).bind(firstName, lastName).first();

          if (existing) {
            stats.membersSkipped++;
            continue;
          }

          // Insert member
          await env.DB.prepare(
            'INSERT INTO members (team_id, first_name, last_name, email, bac_level, is_leader, food_diet) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).bind(team.id, firstName, lastName, email, bacLevel, isLeader, foodDiet).run();

          stats.membersImported++;
        } catch (err) {
          stats.membersSkipped++;
          stats.errors.push(`Failed to import ${row.firstname} ${row.lastname}: ${err.message}`);
        }
      }
    }

    return json({
      success: true,
      stats: {
        teamsCreated: stats.teamsCreated,
        membersImported: stats.membersImported,
        membersSkipped: stats.membersSkipped,
        totalRows: rows.length,
        errors: stats.errors.slice(0, 10) // Limit errors returned
      }
    });

  } catch (err) {
    console.error('Import error:', err);
    return error(err.message || 'Failed to import CSV', 500);
  }
}
