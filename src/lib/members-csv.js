/**
 * Members CSV: the exported formats and the matching import header aliases.
 *
 * Exports use `;` and French headers (what French spreadsheets expect) and a
 * UTF-8 BOM. The import accepts those same headers (so an export can be
 * re-imported), the official NDI headers, and the English headers of the
 * original import format, with either `,` or `;` as delimiter.
 */

import { CSV_BOM, generateCsv } from 'astro-core/csv';

export { CSV_BOM };

export const CSV_DELIMITER = ';';

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Headers of the full members export (single source for export AND import). */
export const EXPORT_HEADERS = Object.freeze({
  id: 'ID',
  firstName: 'Prénom',
  lastName: 'Nom',
  email: 'Email',
  team: 'Équipe',
  bacLevel: 'Niveau BAC',
  isLeader: "Chef d'équipe",
  foodDiet: 'Pizza',
  createdAt: "Date d'inscription"
});

/** Headers of the official NDI export. */
export const OFFICIAL_HEADERS = Object.freeze({
  firstName: 'prenom',
  lastName: 'nom',
  email: 'mail',
  bacLevel: 'niveauBac',
  team: 'equipe',
  isLeader: String.raw`estLeader (0\1)`,
  school: 'ecole (nom exact saisi sur le site)'
});

/** Value written in the pizza column of the full export when there is none. */
export const NO_PIZZA_LABEL = 'Aucune';

const LEADER_YES = 'Oui';
const LEADER_NO = 'Non';

/**
 * Full members export (`;`, French headers, BOM).
 * @param {Array<Record<string, any>>} members - rows of `getAllMembers` (plus `team_name`)
 * @returns {string}
 */
export function generateMembersCsv(members) {
  return generateCsv(members, {
    delimiter: CSV_DELIMITER,
    bom: true,
    columns: [
      { header: EXPORT_HEADERS.id, value: m => m.id },
      { header: EXPORT_HEADERS.firstName, value: m => m.first_name },
      { header: EXPORT_HEADERS.lastName, value: m => m.last_name },
      { header: EXPORT_HEADERS.email, value: m => m.email },
      { header: EXPORT_HEADERS.team, value: m => m.team_name },
      { header: EXPORT_HEADERS.bacLevel, value: m => `BAC+${m.bac_level}` },
      { header: EXPORT_HEADERS.isLeader, value: m => (m.is_leader ? LEADER_YES : LEADER_NO) },
      { header: EXPORT_HEADERS.foodDiet, value: m => m.food_diet || NO_PIZZA_LABEL },
      { header: EXPORT_HEADERS.createdAt, value: m => m.created_at }
    ]
  });
}

/**
 * Official NDI export: prenom;nom;mail;niveauBac;equipe;estLeader (0\1);ecole
 * @param {Array<Record<string, any>>} members
 * @param {string} schoolName
 * @returns {string}
 */
export function generateOfficialMembersCsv(members, schoolName) {
  return generateCsv(members, {
    delimiter: CSV_DELIMITER,
    bom: true,
    columns: [
      { header: OFFICIAL_HEADERS.firstName, value: m => m.first_name },
      { header: OFFICIAL_HEADERS.lastName, value: m => (m.last_name || '').toUpperCase() },
      { header: OFFICIAL_HEADERS.email, value: m => m.email },
      { header: OFFICIAL_HEADERS.bacLevel, value: m => Number.parseInt(m.bac_level, 10) || 0 },
      { header: OFFICIAL_HEADERS.team, value: m => m.team_name },
      { header: OFFICIAL_HEADERS.isLeader, value: m => (m.is_leader ? 1 : 0) },
      { header: OFFICIAL_HEADERS.school, value: () => schoolName }
    ]
  });
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

const lower = (header) => header.toLowerCase();

/**
 * Header aliases for `mapCsvHeaders` (case-insensitive): the English import
 * headers, the French export headers and the official export headers.
 */
export const IMPORT_HEADER_ALIASES = Object.freeze({
  firstName: ['firstname', 'first_name', lower(EXPORT_HEADERS.firstName), 'prenom'],
  lastName: ['lastname', 'last_name', lower(EXPORT_HEADERS.lastName)],
  email: ['email', lower(OFFICIAL_HEADERS.email), 'e-mail'],
  team: ['teamname', 'team_name', 'team', lower(EXPORT_HEADERS.team), 'equipe'],
  bacLevel: ['baclevel', 'bac_level', lower(EXPORT_HEADERS.bacLevel), lower(OFFICIAL_HEADERS.bacLevel)],
  foodDiet: ['fooddiet', 'food_diet', lower(EXPORT_HEADERS.foodDiet)],
  isLeader: [
    'ismanager',
    'isleader',
    lower(EXPORT_HEADERS.isLeader),
    "chef d’équipe",
    lower(OFFICIAL_HEADERS.isLeader)
  ]
});

/** Columns an import file must contain. */
export const REQUIRED_IMPORT_FIELDS = Object.freeze(['firstName', 'lastName', 'email', 'team']);

/** English names of the required columns, for the "missing columns" message. */
export const IMPORT_FIELD_LABELS = Object.freeze({
  firstName: 'firstname',
  lastName: 'lastname',
  email: 'email',
  team: 'teamname'
});

const LEADER_TRUE = new Set(['oui', 'yes', 'y', '1', 'true', 'vrai']);

/**
 * Leader flag of an import cell: Oui / Yes / 1 / true (any case).
 * @param {string|undefined} cell
 * @returns {boolean}
 */
export function parseLeaderCell(cell) {
  return LEADER_TRUE.has(String(cell ?? '').trim().toLowerCase());
}

/**
 * BAC level of an import cell: `3`, `BAC+3`, `bac 3`. Empty is 0. Returns
 * `null` for anything else (the member validation then reports it).
 * @param {string|undefined} cell
 * @returns {number|null}
 */
export function parseBacLevelCell(cell) {
  let text = String(cell ?? '').trim().toLowerCase();
  if (text === '') return 0;
  if (text.startsWith('bac')) text = text.slice(3).trimStart();
  if (text.startsWith('+')) text = text.slice(1).trimStart();
  return /^\d{1,3}$/.test(text) ? Number(text) : null;
}
