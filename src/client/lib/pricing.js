/**
 * Client-side pricing utilities
 * Pure functions that can be tested without DOM
 */

/**
 * Calculate the pricing tier based on deadline
 * @param {string|Date} deadline - Registration deadline
 * @param {number} cutoffDays - Days before deadline for tier1
 * @param {Date} now - Current date (for testing)
 * @returns {'tier1'|'tier2'} Pricing tier
 */
export function calculateTier(deadline, cutoffDays = 7, now = new Date()) {
  if (!deadline) return 'tier2';

  const deadlineDate = deadline instanceof Date ? deadline : new Date(deadline);
  if (Number.isNaN(deadlineDate.getTime())) return 'tier2';

  // Calculate cutoff date (deadline minus cutoff days)
  const cutoffDate = new Date(deadlineDate);
  cutoffDate.setDate(cutoffDate.getDate() - cutoffDays);

  // If we're before the cutoff, it's tier1 (early bird)
  return now < cutoffDate ? 'tier1' : 'tier2';
}

/**
 * Get the price for a tier
 * @param {'tier1'|'tier2'} tier - Pricing tier
 * @param {object} config - Pricing configuration
 * @param {number} config.priceTier1 - Price for tier1 in cents
 * @param {number} config.priceTier2 - Price for tier2 in cents
 * @returns {number} Price in cents
 */
export function getTierPrice(tier, config) {
  const { priceTier1 = 500, priceTier2 = 700 } = config || {};
  return tier === 'tier1' ? priceTier1 : priceTier2;
}

/**
 * Get the on-site payment price for a tier
 * @param {'asso_member'|'non_member'|'late'|'organisation'} tier - On-site payment tier
 * @param {object} config - Pricing configuration
 * @returns {number} Price in cents
 */
export function getOnsitePrice(tier, config) {
  const {
    priceAssoMember = 500,
    priceNonMember = 800,
    priceLate = 1000
  } = config || {};

  switch (tier) {
    case 'organisation': {
      // Organization members are always free
      return 0;
    }
    case 'asso_member': {
      return priceAssoMember;
    }
    case 'non_member': {
      return priceNonMember;
    }
    case 'late': {
      return priceLate;
    }
    default: {
      return priceAssoMember;
    }
  }
}

/**
 * Get human-readable tier label
 * @param {'tier1'|'tier2'} tier - Pricing tier
 * @param {string} locale - Locale (default: 'fr')
 * @returns {string} Tier label
 */
export function getTierLabel(tier, locale = 'fr') {
  const labels = {
    fr: {
      tier1: 'Inscription anticipée',
      tier2: 'Inscription standard'
    },
    en: {
      tier1: 'Early bird',
      tier2: 'Standard'
    }
  };

  const lang = labels[locale] || labels.fr;
  return lang[tier] || tier;
}

/**
 * Get on-site tier label
 * @param {'asso_member'|'non_member'|'late'|'organisation'} tier - On-site tier
 * @param {string} locale - Locale (default: 'fr')
 * @returns {string} Tier label
 */
export function getOnsiteTierLabel(tier, locale = 'fr') {
  const labels = {
    fr: {
      organisation: 'Organisation (gratuit)',
      asso_member: 'Membre asso',
      non_member: 'Non-membre',
      late: 'Retardataire'
    },
    en: {
      organisation: 'Organization (free)',
      asso_member: 'Association member',
      non_member: 'Non-member',
      late: 'Late arrival'
    }
  };

  const lang = labels[locale] || labels.fr;
  return lang[tier] || tier;
}

/**
 * Get pricing summary for display
 * @param {object} config - Pricing configuration
 * @param {Date} now - Current date (for testing)
 * @returns {object} Pricing summary
 */
export function getPricingSummary(config, now = new Date()) {
  const {
    priceTier1 = 500,
    priceTier2 = 700,
    tier1CutoffDays = 7,
    registrationDeadline
  } = config || {};

  const currentTier = calculateTier(registrationDeadline, tier1CutoffDays, now);
  const currentPrice = getTierPrice(currentTier, { priceTier1, priceTier2 });

  let cutoffDate = null;
  let deadlineDate = null;
  let daysUntilCutoff = null;
  let daysUntilDeadline = null;

  if (registrationDeadline) {
    deadlineDate = new Date(registrationDeadline);
    if (!Number.isNaN(deadlineDate.getTime())) {
      cutoffDate = new Date(deadlineDate);
      cutoffDate.setDate(cutoffDate.getDate() - tier1CutoffDays);

      const msPerDay = 24 * 60 * 60 * 1000;
      daysUntilCutoff = Math.ceil((cutoffDate - now) / msPerDay);
      daysUntilDeadline = Math.ceil((deadlineDate - now) / msPerDay);
    }
  }

  return {
    currentTier,
    currentPrice,
    priceTier1,
    priceTier2,
    cutoffDate,
    deadlineDate,
    daysUntilCutoff,
    daysUntilDeadline,
    isBeforeCutoff: currentTier === 'tier1',
    isDeadlinePassed: daysUntilDeadline !== null && daysUntilDeadline < 0
  };
}

/**
 * Calculate total revenue from attendance data
 * @param {object[]} members - Array of members with payment info
 * @returns {object} Revenue breakdown
 */
export function calculateRevenue(members) {
  if (!Array.isArray(members)) {
    return {
      total: 0,
      onlineTotal: 0,
      onsiteTotal: 0,
      byTier: {},
      count: 0
    };
  }

  let total = 0;
  let onlineTotal = 0;
  let onsiteTotal = 0;
  const byTier = {};
  let count = 0;

  for (const m of members) {
    if (m.payment_amount > 0) {
      total += m.payment_amount;
      count++;

      const tier = m.payment_status === 'paid'
        ? (m.registration_tier || 'online')
        : (m.payment_tier || 'unknown');

      byTier[tier] = (byTier[tier] || 0) + m.payment_amount;

      if (m.payment_status === 'paid') {
        onlineTotal += m.payment_amount;
      } else if (m.payment_tier) {
        onsiteTotal += m.payment_amount;
      }
    }
  }

  return {
    total,
    onlineTotal,
    onsiteTotal,
    byTier,
    count
  };
}

/**
 * Determine available payment options based on time
 * @param {string} lateCutoffTime - Late cutoff time in HH:MM format
 * @param {Date} now - Current time (for testing)
 * @param {boolean} includeOrg - Whether to include organisation tier (default: false)
 * @returns {object} Available options
 */
export function getAvailablePaymentOptions(lateCutoffTime, now = new Date(), includeOrg = false) {
  const [hours, minutes] = (lateCutoffTime || '19:00').split(':').map(Number);
  const cutoff = new Date(now);
  cutoff.setHours(hours, minutes, 0, 0);

  const isAfterCutoff = now >= cutoff;

  // Base options based on time
  let options = isAfterCutoff
    ? ['asso_member', 'late']
    : ['asso_member', 'non_member'];

  // Add organisation tier if requested (for admin use)
  if (includeOrg) {
    options = ['organisation', ...options];
  }

  return {
    isAfterCutoff,
    options
  };
}
