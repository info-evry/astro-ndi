/**
 * Registration Page Main Entry Point
 *
 * This module bootstraps the registration form by:
 * 1. Reading baseUrl from DOM data attribute
 * 2. Initializing the API client
 * 3. Loading all data
 * 4. Setting up event listeners
 */
/* eslint-env browser */

import { initApi, loadConfig, loadTeams, loadStats, loadPricing } from './api.js';
import { state, setConfig, setTeams, setStats, setPricing, setTeamMode } from './state.js';
import { elements } from './elements.js';
import { renderStats, renderTeams, renderTeamSelect, renderPricing, initMemberForm, updateLeaderToggle } from './render.js';
import { handleSubmit, showErrors } from './form.js';
import { openTeamViewModal, setupModalListeners } from './modals.js';

/**
 * Get baseUrl from DOM data attribute
 * @returns {string}
 */
function getBaseUrl() {
  const el = document.getElementById('registration-config');
  return el?.dataset.baseUrl || '';
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Team mode toggle
  for (const radio of document.querySelectorAll('input[name="team-mode"]')) {
    radio.addEventListener('change', (e) => {
      setTeamMode(e.target.value === 'new');
      elements.newTeamFields.classList.toggle('hidden', !state.isNewTeam);
      elements.joinTeamFields.classList.toggle('hidden', state.isNewTeam);
      updateLeaderToggle();
    });
  }

  // Payment method selection
  for (const radio of document.querySelectorAll('input[name="paymentMethod"]')) {
    radio.addEventListener('change', (e) => {
      for (const m of document.querySelectorAll('.payment-method')) m.classList.remove('selected');
      e.target.closest('.payment-method').classList.add('selected');
    });
  }

  // Form submission
  elements.form?.addEventListener('submit', handleSubmit);

  // Setup modal listeners
  setupModalListeners();
}

/**
 * Initialize application
 */
async function init() {
  // Get base URL and initialize API
  const baseUrl = getBaseUrl();
  initApi(baseUrl);

  try {
    // Load data in parallel
    const [config, teams, stats, pricing] = await Promise.all([
      loadConfig(),
      loadTeams(),
      loadStats(),
      loadPricing()
    ]);

    // Store data in state
    setConfig(config);
    setTeams(teams);
    setStats(stats);
    setPricing(pricing);

    // Render UI
    renderStats(stats);
    renderTeams(teams, openTeamViewModal);
    renderTeamSelect(teams);
    renderPricing(pricing);

    // Initialize member form if not at capacity
    if (!state.isAtCapacity) {
      initMemberForm();
      updateLeaderToggle();
    }

    // Setup event listeners
    setupEventListeners();

  } catch (error) {
    console.error('Initialization error:', error);
    showErrors(['Erreur de chargement. Veuillez rafraîchir la page.']);
  }
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init(); // eslint-disable-line unicorn/prefer-top-level-await -- IIFE pattern for broader compatibility
}
