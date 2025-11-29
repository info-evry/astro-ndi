/**
 * API client module
 */

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Make an API request
 * @param {string} endpoint - API endpoint (without /api prefix)
 * @param {RequestInit} options - Fetch options
 * @returns {Promise<any>} - Parsed JSON response
 */
export async function api(endpoint, options = {}) {
  const response = await fetch(`/api${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  const data = await response.json();
  if (!response.ok) {
    throw new ApiError(data.error || 'Request failed', response.status);
  }
  return data;
}

/**
 * GET request
 */
export function get(endpoint, options = {}) {
  return api(endpoint, { method: 'GET', ...options });
}

/**
 * POST request
 */
export function post(endpoint, body, options = {}) {
  return api(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
    ...options
  });
}

/**
 * PUT request
 */
export function put(endpoint, body, options = {}) {
  return api(endpoint, {
    method: 'PUT',
    body: JSON.stringify(body),
    ...options
  });
}

/**
 * DELETE request
 */
export function del(endpoint, options = {}) {
  return api(endpoint, { method: 'DELETE', ...options });
}

/**
 * API with admin token
 */
export function adminApi(endpoint, options = {}) {
  const token = localStorage.getItem('ndi_admin_token') || '';
  return api(endpoint, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    }
  });
}

export function adminGet(endpoint) {
  return adminApi(endpoint, { method: 'GET' });
}

export function adminPost(endpoint, body) {
  return adminApi(endpoint, {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function adminPut(endpoint, body) {
  return adminApi(endpoint, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
}

export function adminDel(endpoint) {
  return adminApi(endpoint, { method: 'DELETE' });
}
