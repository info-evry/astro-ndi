/**
 * Registration page DOM element references
 * Centralized element cache for better performance
 */
/* eslint-env browser */

/**
 * DOM element references
 * Lazily accessed via getters to ensure DOM is ready
 */
export const elements = {
  // Hero KPIs
  get kpiTeams() { return document.getElementById('kpi-teams'); },
  get kpiParticipants() { return document.getElementById('kpi-participants'); },
  get kpiSpots() { return document.getElementById('kpi-spots'); },

  // Teams
  get teamsList() { return document.getElementById('teams-list'); },
  get teamsBadge() { return document.getElementById('teams-badge'); },
  get teamSelect() { return document.getElementById('team-select'); },

  // Form
  get newTeamFields() { return document.getElementById('new-team-fields'); },
  get joinTeamFields() { return document.getElementById('join-team-fields'); },
  get form() { return document.getElementById('registration-form'); },
  get submitBtn() { return document.getElementById('submit-btn'); },
  get errorsDiv() { return document.getElementById('form-errors'); },
  get successModal() { return document.getElementById('success-modal'); },
  get successMessage() { return document.getElementById('success-message'); },
  get capacityWarning() { return document.getElementById('capacity-warning'); },
  get capacityWarningText() { return document.getElementById('capacity-warning-text'); },
  get inscriptionSection() { return document.getElementById('inscription'); },
  get heroRegisterBtn() { return document.getElementById('hero-register-btn'); },

  // Member form elements
  get memberBacLevel() { return document.getElementById('member-bac-level'); },
  get pizzaOptions() { return document.getElementById('pizza-options'); },
  get leaderToggle() { return document.getElementById('leader-toggle-container'); },
  get memberIsLeader() { return document.getElementById('member-is-leader'); },

  // Payment elements
  get paymentSection() { return document.getElementById('payment-section'); },
  get pricingInfo() { return document.getElementById('pricing-info'); },
  get currentPrice() { return document.getElementById('current-price'); },
  get currentTierLabel() { return document.getElementById('current-tier-label'); },
  get pricingDeadlineNote() { return document.getElementById('pricing-deadline-note'); },
  get paymentDisabled() { return document.getElementById('payment-disabled'); },

  // Team view modal elements
  get teamViewModal() { return document.getElementById('team-view-modal'); },
  get teamViewAuth() { return document.getElementById('team-view-auth'); },
  get teamViewContent() { return document.getElementById('team-view-content'); },
  get teamViewTitle() { return document.getElementById('team-view-title'); },
  get teamViewPassword() { return document.getElementById('team-view-password'); },
  get teamViewError() { return document.getElementById('team-view-error'); },
  get teamViewSubmit() { return document.getElementById('team-view-submit'); },
  get teamViewCancel() { return document.getElementById('team-view-cancel'); },
  get teamViewClose() { return document.getElementById('team-view-close'); },
  get teamDetailName() { return document.getElementById('team-detail-name'); },
  get teamDetailDesc() { return document.getElementById('team-detail-desc'); },
  get teamMembersList() { return document.getElementById('team-members-list'); }
};
