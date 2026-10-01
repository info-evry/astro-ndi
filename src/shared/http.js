/**
 * Request helpers shared by the API handlers (thin layer over astro-core).
 *
 * Error contract: every error body is `{ error, code }`, see astro-core/http.
 */

import { parseIdList } from 'astro-core/ids';
import { readJsonOrRespond } from 'astro-core/request';
import { badRequest, invalidBody, invalidId } from 'astro-core/http';
import { MAX_BATCH_IDS, MAX_BODY_BYTES } from './constants.js';

/**
 * Read a mandatory JSON object body.
 * Resolves `{ data }`, or `{ response }` (400 `invalid_body` / 413 `payload_too_large`).
 *
 * @param {Request} request
 * @param {number} [maxBytes]
 * @returns {Promise<{ data: Record<string, any>, response: null } | { data: null, response: Response }>}
 */
export function readBody(request, maxBytes = MAX_BODY_BYTES) {
  return readJsonOrRespond(request, { maxBytes });
}

/**
 * Read an optional JSON object body: an absent or empty body is `{ data: null,
 * response: null }` (the caller proceeds without options), whereas a body that
 * is present but malformed (not JSON, `null`, an array, ...) is a 400.
 *
 * @param {Request} request
 * @param {number} [maxBytes]
 * @returns {Promise<{ data: Record<string, any>|null, response: Response|null }>}
 */
export async function readOptionalBody(request, maxBytes = MAX_BODY_BYTES) {
  if (request.body === null) return { data: null, response: null };

  // Keep a second branch of the stream: when the parse fails we need to know
  // whether the body was empty (fine) or malformed (400). The size limit is
  // enforced by the first read, so the clone is only read when the whole body
  // is known to be within the limit.
  const copy = request.clone();
  const { data, response } = await readJsonOrRespond(request, { maxBytes });
  if (data) return { data, response: null };
  if (response.status === 400) {
    const text = await copy.text().catch(() => 'invalid');
    if (text.trim() === '') return { data: null, response: null };
  }
  return { data: null, response };
}

/**
 * Read `{ [key]: [...ids] }` from the body and validate the list: a non-empty
 * array of positive integers, at most MAX_BATCH_IDS long.
 *
 * @param {Request} request
 * @param {string} key - Body property holding the ids (e.g. `memberIds`)
 * @returns {Promise<{ ids: number[], response: null } | { ids: null, response: Response }>}
 */
export async function readIdList(request, key) {
  const { data, response } = await readBody(request);
  if (response) return { ids: null, response };

  const parsed = parseIdList(data[key], { max: MAX_BATCH_IDS });
  if (parsed.ids) return { ids: parsed.ids, response: null };

  switch (parsed.error) {
    case 'invalid_id': {
      return { ids: null, response: invalidId(`Identifiant invalide dans ${key}`) };
    }
    case 'too_many': {
      return {
        ids: null,
        response: badRequest(`Trop d'identifiants (maximum ${MAX_BATCH_IDS})`, 'too_many_ids')
      };
    }
    default: {
      return { ids: null, response: invalidBody(`${key} doit être un tableau non vide d'identifiants`) };
    }
  }
}
