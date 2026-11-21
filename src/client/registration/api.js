/**
 * Registration API client
 * Handles all API calls for the registration page
 */

import { createPublicClient } from '@info-evry/astro-design/scripts/public-client';

/** @type {import('@info-evry/astro-design/scripts/public-client').PublicClient} */
let client = createPublicClient({ baseUrl: '' });

/**
 * Initialize API with base URL
 * @param {string} baseUrl - Base URL from Astro
 */
export function initApi(baseUrl) {
  client = createPublicClient({ baseUrl });
}

/**
 * Make an API request. Failures are `ApiError`s (never a bare SyntaxError):
 * `message` is the server's (French) error text, `code` its error code.
 * @param {string} endpoint - API endpoint
 * @param {{ method?: string, body?: unknown }} [options]
 * @returns {Promise<object>}
 */
function api(endpoint, { method = 'GET', body } = {}) {
  if (method === 'GET') return client.get(endpoint);
  return method === 'PUT' ? client.put(endpoint, body) : client.post(endpoint, body);
}

/**
 * Load configuration
 * @returns {Promise<object>}
 */
export async function loadConfig() {
  const { config } = await api('/config');
  return config;
}

/**
 * Load teams list
 * @returns {Promise<Array>}
 */
export async function loadTeams() {
  const { teams } = await api('/teams');
  return teams;
}

/**
 * Load stats
 * @returns {Promise<object>}
 */
export async function loadStats() {
  const { stats } = await api('/stats');
  return stats;
}

/**
 * Submit registration
 * @param {object} data - Registration data
 * @returns {Promise<object>}
 */
export async function submitRegistration(data) {
  return api('/register', { method: 'POST', body: data });
}

/**
 * View team members (with the team's secret code)
 * @param {number} teamId - Team ID
 * @param {string} password - Team secret code (API field name: `password`)
 * @returns {Promise<object>}
 */
export async function viewTeamMembers(teamId, password) {
  return api(`/teams/${teamId}/view`, { method: 'POST', body: { password } });
}

/**
 * Change the pizza of one member of a team (with the team's secret code)
 * @param {number} teamId - Team ID
 * @param {number} memberId - Member ID
 * @param {string} password - Team secret code (API field name: `password`)
 * @param {string} foodDiet - Id of the chosen pizza
 * @returns {Promise<object>}
 */
export async function changeMemberPizza(teamId, memberId, password, foodDiet) {
  return api(`/teams/${teamId}/members/${memberId}/pizza`, { method: 'PUT', body: { password, foodDiet } });
}
