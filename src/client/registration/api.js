/**
 * Registration API client
 * Handles all API calls for the registration page
 */
/* eslint-env browser */

let apiBase = '';

/**
 * Initialize API with base URL
 * @param {string} baseUrl - Base URL from Astro
 */
export function initApi(baseUrl) {
  apiBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

/**
 * Make API request
 * @param {string} endpoint - API endpoint
 * @param {object} options - Fetch options
 * @returns {Promise<object>}
 */
async function api(endpoint, options = {}) {
  const response = await fetch(`${apiBase}/api${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
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
 * Load pricing information
 * @returns {Promise<object|null>}
 */
export async function loadPricing() {
  try {
    const pricing = await api('/payment/pricing');
    return pricing;
  } catch (err) {
    console.log('Pricing not available:', err.message);
    return null;
  }
}

/**
 * Submit registration
 * @param {object} data - Registration data
 * @returns {Promise<object>}
 */
export async function submitRegistration(data) {
  return api('/register', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

/**
 * View team members (with password)
 * @param {number} teamId - Team ID
 * @param {string} password - Team password
 * @returns {Promise<object>}
 */
export async function viewTeamMembers(teamId, password) {
  return api(`/teams/${teamId}/view`, {
    method: 'POST',
    body: JSON.stringify({ password })
  });
}
