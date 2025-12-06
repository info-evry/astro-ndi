/**
 * Admin API client
 */
/* eslint-env browser */

// Token from localStorage
let adminToken = localStorage.getItem('ndi_admin_token') || '';

/**
 * Set admin token
 * @param {string} token
 */
export function setToken(token) {
  adminToken = token;
  localStorage.setItem('ndi_admin_token', token);
}

/**
 * Get current admin token
 * @returns {string}
 */
export function getToken() {
  return adminToken;
}

/**
 * Clear admin token
 */
export function clearToken() {
  adminToken = '';
  localStorage.removeItem('ndi_admin_token');
}

/**
 * Make API request
 * @param {string} endpoint - API endpoint
 * @param {RequestInit} options - Fetch options
 * @param {string} apiBase - Base URL
 * @returns {Promise<any>}
 */
export async function api(endpoint, options = {}, apiBase = '') {
  const response = await fetch(`${apiBase}/api${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });

  if (response.status === 401) {
    throw new Error('Unauthorized');
  }

  // Handle CSV downloads
  if (response.headers.get('Content-Type')?.includes('text/csv')) {
    return response;
  }

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Request failed');
  }

  return response.json();
}

/**
 * Create API client bound to a base URL
 * @param {string} apiBase - Base URL
 * @returns {Object}
 */
export function createApiClient(apiBase) {
  return {
    get: (endpoint) => api(endpoint, { method: 'GET' }, apiBase),
    post: (endpoint, body) => api(endpoint, { method: 'POST', body: JSON.stringify(body) }, apiBase),
    put: (endpoint, body) => api(endpoint, { method: 'PUT', body: JSON.stringify(body) }, apiBase),
    delete: (endpoint) => api(endpoint, { method: 'DELETE' }, apiBase),
    raw: (endpoint, options) => api(endpoint, options, apiBase)
  };
}
