/**
 * Admin utility functions
 * DOM helpers and text formatting
 */

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
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Truncate text with ellipsis
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string}
 */
export function truncateText(str, maxLength = 40) {
  if (!str || str.length <= maxLength) return str;
  return str.substring(0, maxLength - 1) + '…';
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
