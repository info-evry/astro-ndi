/**
 * Price display helpers shared by the Worker (SSR page) and the browser.
 *
 * Pure module: no imports, no environment access.
 */

/**
 * Format an amount in cents for the public page: whole euros without
 * decimals ("5€"), otherwise two decimals with a French comma ("7,50€").
 * @param {number} cents - Non-negative integer amount in cents
 * @returns {string}
 */
export function formatPriceEuros(cents) {
  const euros = Math.trunc(cents / 100);
  const remainder = cents % 100;
  return remainder === 0 ? `${euros}€` : `${euros},${String(remainder).padStart(2, '0')}€`;
}
