/**
 * Admin Import Module
 * Handles CSV import of teams and members.
 *
 * Accepted files: the English import headers
 * (firstname,lastname,email,teamname,baclevel,fooddiet,ismanager), the French
 * headers of the members export and the official NDI headers, with `,` or `;`
 * as delimiter (see lib/members-csv.js), so an export can be re-imported.
 */

import { json } from 'astro-core/router';
import { adminOnly } from 'astro-core/auth';
import { mapCsvHeaders, parseCsv, unescapeCsvCell } from 'astro-core/csv';
import { chunk } from 'astro-core/d1';
import { isUniqueConstraintError } from 'astro-core/request';
import { badRequest, serverError } from 'astro-core/http';
import { hashPassword } from '../../shared/crypto.js';
import { readBody } from '../../shared/http.js';
import {
  MAX_IMPORT_BODY_BYTES,
  MAX_IMPORT_ERRORS_SHOWN,
  MAX_IMPORT_ROWS,
  NO_PIZZA
} from '../../shared/constants.js';
import {
  IMPORT_FIELD_LABELS,
  IMPORT_HEADER_ALIASES,
  NO_PIZZA_LABEL,
  REQUIRED_IMPORT_FIELDS,
  parseBacLevelCell,
  parseLeaderCell
} from '../../lib/members-csv.js';
import { validateMember, validateTeamName } from '../../lib/validation.js';
import * as db from '../../lib/db.js';
import { getConfiguredPizzaIds } from '../../api/config.js';

// Alphabet without ambiguous characters (no 0/O, 1/I/l, etc.) - not a secret,
// used only to build a charset for random generation.
const GENERATION_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const GENERATED_PASSWORD_LENGTH = 16;

/** Team of the members whose file has no (or an empty) team column. */
const DEFAULT_TEAM_NAME = 'Sans équipe';

/** Members inserted per D1 batch. */
const INSERT_BATCH_SIZE = 50;

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
 * Accumulates the outcome of an import: counters plus the per-row errors
 * (all counted, only the first MAX_IMPORT_ERRORS_SHOWN kept for the response).
 */
class ImportReport {
  teamsCreated = 0;
  membersImported = 0;
  membersSkipped = 0;
  errorCount = 0;
  /** Rows whose shape does not match the header (wrong number of cells). */
  malformedRows = 0;
  errors = [];
  createdTeams = [];

  /** A row that cannot be imported and the reason why. */
  rowError(message) {
    this.membersSkipped++;
    this.errorCount++;
    if (this.errors.length < MAX_IMPORT_ERRORS_SHOWN) this.errors.push(message);
  }

  /** A row that is simply already there: skipped, not an error. */
  duplicate() {
    this.membersSkipped++;
  }
}

/**
 * Turn the parsed rows into candidate members, in file order. Invalid rows
 * are reported and left out.
 *
 * @returns {Array<{ rowNumber: number, teamName: string, member: object }>}
 */
function prepareRows(rows, columnCount, columns, pizzaIds, report) {
  const prepared = [];

  for (const [index, cells] of rows.entries()) {
    const rowNumber = index + 2; // line 1 is the header
    if (cells.length !== columnCount) {
      report.malformedRows++;
      report.rowError(`Ligne ${rowNumber} : ${columnCount} colonnes attendues, ${cells.length} trouvées`);
      continue;
    }

    const cell = (field) => (columns[field] === undefined ? '' : unescapeCsvCell(cells[columns[field]]));

    const foodCell = cell('foodDiet');
    let foodDiet = foodCell || NO_PIZZA;
    if (foodCell.toLowerCase() === NO_PIZZA_LABEL.toLowerCase()) foodDiet = '';

    const validation = validateMember({
      firstName: cell('firstName'),
      lastName: cell('lastName'),
      email: cell('email'),
      bacLevel: parseBacLevelCell(cell('bacLevel')) ?? Number.NaN,
      isLeader: parseLeaderCell(cell('isLeader')),
      foodDiet
    }, { pizzaIds });
    const teamValidation = validateTeamName(cell('team') || DEFAULT_TEAM_NAME);

    const problems = [
      ...(validation.valid ? [] : validation.errors),
      ...(teamValidation.valid ? [] : [teamValidation.error])
    ];
    if (problems.length > 0) {
      report.rowError(`Ligne ${rowNumber} : ${problems.join(', ')}`);
      continue;
    }

    prepared.push({ rowNumber, teamName: teamValidation.value, member: validation.value });
  }

  return prepared;
}

/**
 * Resolve (or create) the team of every distinct team name. Resolves to a
 * Map of lower-cased team name -> team id; a team that cannot be created is
 * absent (its rows are reported by the caller).
 */
async function ensureTeams(database, teamNames, report) {
  const existing = await db.getTeams(database);
  const teamIds = new Map(existing.map(team => [team.name.toLowerCase(), team.id]));

  for (const name of teamNames) {
    const key = name.toLowerCase();
    if (teamIds.has(key)) continue;

    const password = generateTeamPassword();
    try {
      const team = await db.createTeam(database, name, '', await hashPassword(password));
      teamIds.set(key, team.id);
      report.teamsCreated++;
      report.createdTeams.push({ team: name, password });
    } catch (error_) {
      if (!isUniqueConstraintError(error_)) throw error_;
      // Created by someone else in the meantime: use it
      const clash = await db.getTeamByName(database, name);
      if (clash) teamIds.set(key, clash.id);
    }
  }

  return teamIds;
}

function insertStatement(database, teamId, member) {
  return database.prepare(
    'INSERT INTO members (team_id, first_name, last_name, email, bac_level, is_leader, food_diet) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(teamId, member.firstName, member.lastName, member.email, member.bacLevel, member.isLeader ? 1 : 0, member.foodDiet);
}

/**
 * Replay a failed batch row by row, so a UNIQUE violation (a name registered
 * concurrently) only skips its own row.
 */
async function insertOneByOne(database, batch, report) {
  for (const { teamId, member } of batch) {
    try {
      await insertStatement(database, teamId, member).run();
      report.membersImported++;
    } catch (error_) {
      if (!isUniqueConstraintError(error_)) throw error_;
      report.duplicate();
    }
  }
}

/**
 * Insert members in atomic batches.
 */
async function insertMembers(database, entries, report) {
  for (const batch of chunk(entries, INSERT_BATCH_SIZE)) {
    try {
      await database.batch(batch.map(({ teamId, member }) => insertStatement(database, teamId, member)));
      report.membersImported += batch.length;
    } catch (error_) {
      if (!isUniqueConstraintError(error_)) throw error_;
      await insertOneByOne(database, batch, report);
    }
  }
}

/** Identity of a member for the duplicate check: the exact first + last name pair. */
const nameKey = (firstName, lastName) => `${firstName}\u0000${lastName}`;

/**
 * Leave out the members already registered (the schema makes first + last
 * name unique) or repeated earlier in the file: they count as skipped.
 */
async function dropKnownMembers(database, prepared, report) {
  const existing = await database.prepare('SELECT first_name, last_name FROM members').all();
  const knownNames = new Set(existing.results.map(row => nameKey(row.first_name, row.last_name)));

  const candidates = [];
  for (const entry of prepared) {
    const key = nameKey(entry.member.firstName, entry.member.lastName);
    if (knownNames.has(key)) {
      report.duplicate();
    } else {
      knownNames.add(key);
      candidates.push(entry);
    }
  }
  return candidates;
}

/**
 * Pair every candidate with the id of its team; a member whose team could not
 * be created is reported.
 */
function attachTeamIds(candidates, teamIds, report) {
  const toInsert = [];
  for (const { rowNumber, teamName, member } of candidates) {
    const teamId = teamIds.get(teamName.toLowerCase());
    if (teamId === undefined) {
      report.rowError(`Ligne ${rowNumber} : équipe "${teamName}" introuvable`);
    } else {
      toInsert.push({ teamId, member });
    }
  }
  return toInsert;
}

/**
 * Parse the CSV text of an import request and check its shape: not empty, at
 * most MAX_IMPORT_ROWS data rows, every required column present.
 * @returns {{ headers: string[], rows: string[][], columns: Record<string, number>, response: null }
 *   | { response: Response }}
 */
function parseImportFile(csv) {
  if (typeof csv !== 'string' || csv.trim() === '') {
    return { response: badRequest('Données CSV requises', 'csv_required') };
  }

  const { headers, rows } = parseCsv(csv);
  if (headers.length === 0 || rows.length === 0) {
    return {
      response: badRequest(
        "Le CSV doit contenir une ligne d'en-têtes et au moins une ligne de données",
        'empty_csv'
      )
    };
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      response: badRequest(
        `Trop de lignes (${rows.length}) : maximum ${MAX_IMPORT_ROWS} par import`,
        'too_many_rows'
      )
    };
  }

  const columns = mapCsvHeaders(headers, IMPORT_HEADER_ALIASES);
  const missing = REQUIRED_IMPORT_FIELDS.filter(field => columns[field] === undefined);
  if (missing.length > 0) {
    return {
      response: badRequest(
        `Colonnes obligatoires manquantes : ${missing.map(field => IMPORT_FIELD_LABELS[field]).join(', ')}`,
        'missing_columns'
      )
    };
  }

  return { headers, rows, columns, response: null };
}

/**
 * POST /api/admin/import - Import members from CSV
 */
export const importCSV = adminOnly(async (request, env) => {
  try {
    const { data, response } = await readBody(request, MAX_IMPORT_BODY_BYTES);
    if (response) return response;

    const parsed = parseImportFile(data.csv);
    if (parsed.response) return parsed.response;
    const { headers, rows, columns } = parsed;

    const report = new ImportReport();
    const pizzaIds = await getConfiguredPizzaIds(env);
    const prepared = prepareRows(rows, headers.length, columns, pizzaIds, report);
    if (report.malformedRows === rows.length) {
      return badRequest(`Aucune ligne valide dans le CSV. ${report.errors[0]}`, 'no_valid_rows');
    }

    const candidates = await dropKnownMembers(env.DB, prepared, report);
    const teamIds = await ensureTeams(env.DB, new Set(candidates.map(entry => entry.teamName)), report);
    const toInsert = attachTeamIds(candidates, teamIds, report);
    await insertMembers(env.DB, toInsert, report);

    return json({
      success: true,
      stats: {
        teamsCreated: report.teamsCreated,
        membersImported: report.membersImported,
        membersSkipped: report.membersSkipped,
        totalRows: rows.length,
        errors: report.errors,
        errorCount: report.errorCount
      },
      passwords: report.createdTeams
    });
  } catch (error_) {
    return serverError('Import error:', error_, "Échec de l'import du CSV");
  }
});
