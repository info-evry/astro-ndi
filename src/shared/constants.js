/**
 * Constants shared by the Worker (API) and the browser bundles.
 *
 * Pure module: no imports, no environment access, so the server and the
 * client import the very same values (`import ... from '<rel>/shared/constants.js'`).
 */

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

/** Name of the organisers' team: excluded from capacity, spots and payment stats. */
export const ORGANISATION_TEAM_NAME = 'Organisation';

/** @param {unknown} name */
export function isOrganisationTeamName(name) {
  return name === ORGANISATION_TEAM_NAME;
}

/** Fallback school name written in the official export. */
export const DEFAULT_SCHOOL_NAME = "Université d'Evry";

// ---------------------------------------------------------------------------
// Capacity and retention defaults (used when neither D1 nor the environment sets them)
// ---------------------------------------------------------------------------

export const DEFAULT_MAX_TEAM_SIZE = 15;
export const DEFAULT_MAX_TOTAL_PARTICIPANTS = 200;
export const DEFAULT_MIN_TEAM_SIZE = 1;

/** Years the personal data of an archive is kept before it is anonymised. */
export const DEFAULT_GDPR_RETENTION_YEARS = 3;

// ---------------------------------------------------------------------------
// Pizza
// ---------------------------------------------------------------------------

/**
 * `food_diet` values meaning "no pizza": the empty value, the default config id
 * (`none`) and the id used by the production D1 migration (`0-rien`).
 */
/** Catalogue id of the "Aucune" (no pizza) choice; always present, not deletable. */
export const NO_PIZZA_ID = '0-rien';

export const NO_PIZZA_VALUES = Object.freeze(['', 'none', '0-rien']);

/** Value the registration form sends when no pizza is wanted. */
export const NO_PIZZA = 'none';

const NO_PIZZA_SET = new Set(NO_PIZZA_VALUES);

/**
 * True when a stored/submitted `food_diet` means "no pizza".
 * @param {unknown} value
 * @returns {boolean}
 */
export function isNoPizza(value) {
  if (value === null || value === undefined) return true;
  return typeof value === 'string' && NO_PIZZA_SET.has(value.trim().toLowerCase());
}

/** Longest accepted `food_diet` (a pizza id). */
export const MAX_FOOD_DIET_LENGTH = 64;

// ---------------------------------------------------------------------------
// Payments
//
// Everything is paid on the day, on site: the admin picks a tier in the
// check-in modal. There is no online payment any more. The database keeps the
// historical online columns (`payment_status`, `checkout_id`, ...) and rows
// written by the former online flow (`tier1`, `tier2`, `online_tier1`, ...);
// they are only ever read (and escaped) for display, never written.
// ---------------------------------------------------------------------------

/** `members.payment_tier` values accepted on check-in (chosen by the admin). */
export const PAYMENT_TIER = Object.freeze({
  ASSO_MEMBER: 'asso_member',
  NON_MEMBER: 'non_member',
  LATE: 'late',
  ORGANISATION: 'organisation'
});

/** Every value accepted for `paymentTier` on check-in (the on-site tiers). */
export const PAYMENT_TIERS = Object.freeze(Object.values(PAYMENT_TIER));

const PAYMENT_TIER_SET = new Set(PAYMENT_TIERS);

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isPaymentTier(value) {
  return typeof value === 'string' && PAYMENT_TIER_SET.has(value);
}

/** Default prices, in cents (single source for the API, the settings and the admin client). */
export const DEFAULT_PRICES = Object.freeze({
  assoMember: 500,
  nonMember: 800,
  late: 1000
});

/** On-site arrivals after this time (HH:MM) pay the "late" price. */
export const DEFAULT_LATE_CUTOFF_TIME = '19:00';

/** Highest price / payment amount accepted, in cents (1000 EUR). */
export const MAX_PAYMENT_AMOUNT_CENTS = 100_000;

// ---------------------------------------------------------------------------
// Request caps
// ---------------------------------------------------------------------------

/** Most ids accepted by a batch endpoint (`parseIdList` max). */
export const MAX_BATCH_IDS = 1000;

/** Most assignments accepted by the batch room endpoint. */
export const MAX_ROOM_ASSIGNMENTS = 1000;

/** Longest room name. */
export const MAX_ROOM_NAME_LENGTH = 50;

/** Default maximum size of a JSON request body, in bytes. */
export const MAX_BODY_BYTES = 262_144;

/** Maximum size of the JSON body of the CSV import (it carries the CSV text). */
export const MAX_IMPORT_BODY_BYTES = 1_048_576;

/** Most data rows accepted by one CSV import. */
export const MAX_IMPORT_ROWS = 2000;

/** Import errors listed in the response (the total is always counted). */
export const MAX_IMPORT_ERRORS_SHOWN = 10;

/** Accepted range of an archive / event year. */
export const MIN_EVENT_YEAR = 2000;
export const MAX_EVENT_YEAR = 2100;
