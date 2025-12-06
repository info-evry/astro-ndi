/**
 * Registration form state management
 * Centralized state for the registration page
 */
/* eslint-env browser */

/**
 * Application state
 * @type {{
 *   config: object|null,
 *   teams: Array,
 *   stats: object|null,
 *   pricing: object|null,
 *   isNewTeam: boolean,
 *   selectedTeamId: number|null,
 *   isAtCapacity: boolean,
 *   paymentEnabled: boolean
 * }}
 */
export const state = {
  config: null,
  teams: [],
  stats: null,
  pricing: null,
  isNewTeam: true,
  selectedTeamId: null,
  isAtCapacity: false,
  paymentEnabled: false
};

/**
 * Update config
 * @param {object} config - Configuration object
 */
export function setConfig(config) {
  state.config = config;
}

/**
 * Update teams list
 * @param {Array} teams - Teams array
 */
export function setTeams(teams) {
  state.teams = teams;
}

/**
 * Update stats
 * @param {object} stats - Stats object
 */
export function setStats(stats) {
  state.stats = stats;
}

/**
 * Update pricing
 * @param {object} pricing - Pricing object
 */
export function setPricing(pricing) {
  state.pricing = pricing;
  state.paymentEnabled = pricing?.enabled ?? false;
}

/**
 * Set team mode (new or join)
 * @param {boolean} isNew - True for new team, false for join
 */
export function setTeamMode(isNew) {
  state.isNewTeam = isNew;
}

/**
 * Set selected team for viewing
 * @param {number|null} teamId - Team ID
 */
export function setSelectedTeam(teamId) {
  state.selectedTeamId = teamId;
}

/**
 * Set capacity status
 * @param {boolean} atCapacity - True if at capacity
 */
export function setAtCapacity(atCapacity) {
  state.isAtCapacity = atCapacity;
}
