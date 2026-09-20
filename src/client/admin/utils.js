/**
 * Admin utility functions
 * DOM helpers and text formatting
 */
/* eslint-env browser */

/**
 * Shorthand for document.getElementById
 * @param {string} id - Element ID
 * @returns {HTMLElement | null}
 */
export function $(id) {
  return document.getElementById(id);
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string}
 */
export function escapeHtml(str) {
  if (!str) return '';
  // Escape quotes as well: values are interpolated into attributes and
  // inline onclick="fn('...')" strings, not only into text nodes.
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Truncate text with ellipsis
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string}
 */
export function truncateText(str, maxLength = 40) {
  if (!str || str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + '…';
}

/**
 * Format team name with room
 * @param {string} teamName - Team name
 * @param {string} teamRoom - Room assignment
 * @param {number} maxLength - Maximum length
 * @returns {{truncated: string, full: string}}
 */
export function formatTeamWithRoom(teamName, teamRoom, maxLength = 40) {
  if (!teamName) return { truncated: '-', full: '-' };
  const fullText = teamRoom ? `${teamName} (${teamRoom})` : teamName;
  const truncated = truncateText(fullText, maxLength);
  return { truncated, full: fullText };
}

/**
 * Format currency in EUR
 * @param {number} cents - Amount in cents
 * @returns {string}
 */
export function formatCurrency(cents) {
  return (cents / 100).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR'
  });
}
