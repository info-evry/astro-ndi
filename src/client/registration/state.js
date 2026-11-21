/**
 * Registration form state management
 * Centralized state for the registration page
 */

/**
 * Application state
 * @type {{
 *   config: object|null,
 *   teams: Array,
 *   stats: object|null,
 *   isNewTeam: boolean,
 *   selectedTeamId: number|null,
 *   teamSecret: string,
 *   isAtCapacity: boolean
 * }}
 */
export const state = {
  config: null,
  teams: [],
  stats: null,
  isNewTeam: true,
  selectedTeamId: null,
  teamSecret: '',
  isAtCapacity: false
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
 * Remember the code secret the team view was opened with (memory only), so
 * the pizza of a member can be changed without asking for it again.
 * @param {string} secret - Empty to forget it
 */
export function setTeamSecret(secret) {
  state.teamSecret = secret;
}

/**
 * Set capacity status
 * @param {boolean} atCapacity - True if at capacity
 */
export function setAtCapacity(atCapacity) {
  state.isAtCapacity = atCapacity;
}
