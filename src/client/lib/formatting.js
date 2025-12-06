/**
 * Client-side formatting utilities
 * Pure functions that can be tested without DOM
 */

/**
 * Escape HTML entities to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Truncate text to a maximum length
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length (default: 40)
 * @returns {string} Truncated string with ellipsis if needed
 */
export function truncateText(str, maxLength = 40) {
  if (!str || str.length <= maxLength) return str || '';
  return str.substring(0, maxLength - 1) + '…';
}

/**
 * Format team name with optional room info
 * @param {string} teamName - Team name
 * @param {string|null} teamRoom - Room name (optional)
 * @param {number} maxLength - Maximum length for truncation
 * @returns {{ full: string, truncated: string }} Full and truncated versions
 */
export function formatTeamWithRoom(teamName, teamRoom, maxLength = 40) {
  const full = teamRoom ? `${teamName} (${teamRoom})` : teamName;
  return {
    full,
    truncated: truncateText(full, maxLength)
  };
}

/**
 * Format currency in cents to display format
 * @param {number} cents - Amount in cents
 * @param {string} locale - Locale for formatting (default: 'fr-FR')
 * @param {string} currency - Currency code (default: 'EUR')
 * @returns {string} Formatted currency string
 */
export function formatCurrency(cents, locale = 'fr-FR', currency = 'EUR') {
  if (typeof cents !== 'number' || isNaN(cents)) return '0,00 €';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency
  }).format(cents / 100);
}

/**
 * Format date to locale string
 * @param {string|Date} date - Date to format
 * @param {string} locale - Locale for formatting (default: 'fr-FR')
 * @returns {string} Formatted date string
 */
export function formatDate(date, locale = 'fr-FR') {
  if (!date) return '-';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Format time to locale string
 * @param {string|Date} date - Date to format
 * @param {string} locale - Locale for formatting (default: 'fr-FR')
 * @returns {string} Formatted time string (HH:MM)
 */
export function formatTime(date, locale = 'fr-FR') {
  if (!date) return '-';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Format datetime to locale string
 * @param {string|Date} date - Date to format
 * @param {string} locale - Locale for formatting (default: 'fr-FR')
 * @returns {string} Formatted datetime string
 */
export function formatDateTime(date, locale = 'fr-FR') {
  if (!date) return '-';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Format BAC level to display string
 * @param {number|string} level - BAC level (0-8)
 * @returns {string} Formatted BAC level
 */
export function formatBacLevel(level) {
  const num = parseInt(level, 10);
  if (isNaN(num) || num < 0) return '-';
  if (num === 0) return 'Non bachelier';
  return `BAC+${num}`;
}

/**
 * Get payment tier label
 * @param {string} tier - Payment tier
 * @returns {string} Tier label
 */
export function getPaymentTierLabel(tier) {
  const labels = {
    'asso_member': 'Membre asso',
    'non_member': 'Non-membre',
    'late': 'Retardataire',
    'tier1': 'Anticipé',
    'tier2': 'Standard',
    'online_tier1': 'En ligne (anticipé)',
    'online_tier2': 'En ligne (standard)'
  };
  return labels[tier] || tier || '-';
}

/**
 * Get payment status info for display
 * @param {object} member - Member object with payment info
 * @returns {{ label: string, badgeClass: string, icon: string }}
 */
export function getPaymentStatusDisplay(member) {
  if (member.payment_status === 'paid') {
    const tierLabels = { 'tier1': 'Anticipé', 'tier2': 'Standard' };
    return {
      label: tierLabels[member.registration_tier] || 'En ligne',
      badgeClass: 'badge-success',
      icon: '💳'
    };
  }
  if (member.payment_status === 'delayed') {
    return {
      label: 'À payer',
      badgeClass: 'badge-warning',
      icon: '📅'
    };
  }
  if (member.payment_status === 'pending') {
    return {
      label: 'En cours',
      badgeClass: 'badge-info',
      icon: '⏳'
    };
  }
  if (member.payment_tier) {
    const tierLabels = {
      'asso_member': 'Membre asso',
      'non_member': 'Non-membre',
      'late': 'Retardataire'
    };
    return {
      label: tierLabels[member.payment_tier] || member.payment_tier,
      badgeClass: 'badge-success',
      icon: '✓'
    };
  }
  return {
    label: '-',
    badgeClass: 'badge-muted',
    icon: ''
  };
}
