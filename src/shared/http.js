/**
 * HTTP request helpers shared by API handlers
 */

/**
 * Parse the request body as a JSON object.
 *
 * Returns `null` when the body is not valid JSON or is not a plain object
 * (e.g. `null`, a number, a string or an array), so handlers can answer
 * with a 400 instead of crashing into a generic 500.
 *
 * @param {Request} request
 * @returns {Promise<Record<string, any>|null>}
 */
export async function readJsonObject(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  return body;
}

export const INVALID_JSON_MESSAGE = 'Invalid JSON body';
