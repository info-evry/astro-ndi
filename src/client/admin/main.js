/**
 * Admin Dashboard Main Entry Point
 *
 * This module bootstraps the admin dashboard by:
 * 1. Creating the API client (base URL read from <meta name="base-url">)
 * 2. Initializing all modules
 * 3. Setting up event listeners (including delegated data-action/data-change handling)
 */
/* eslint-env browser */

// Shared design-system client scripts
import { $ } from '@info-evry/astro-design/scripts/dom';
import { toastError } from '@info-evry/astro-design/scripts/toast';
import { createApiClient, readBaseUrl } from '@info-evry/astro-design/scripts/api-client';
import { initTabs } from '@info-evry/astro-design/scripts/tabs';
import { initModals } from '@info-evry/astro-design/scripts/modal';
import { buildActions, bindDelegation } from './actions.js';

// State management
import {
  selectedMembers,
  setPizzasConfig
} from './state.js';

// Domain modules
import {
  renderStats,
  renderTeams,
  deleteSelectedMembers,
  handleTeamSubmit,
  handleMemberSubmit,
  handleExportOfficial,
  handleExportAll,
  initTeamsSearch,
  initAllParticipants,
  openAddTeamModal,
  openAddMemberModal,
  selectAllParticipants
} from './registrations.js';

import {
  loadAttendanceData,
  initAttendance
} from './attendance.js';

import {
  loadPizzaData,
  initPizza
} from './pizza.js';

import {
  loadRoomsData,
  initRooms
} from './rooms.js';

import {
  loadArchives,
  initArchives
} from './archives.js';

import {
  loadSettings,
  initSettings
} from './settings.js';

import {
  initImport
} from './import.js';

// ============================================================
// INITIALIZATION
// ============================================================

const TOKEN_KEY = 'ndi_admin_token';
const client = createApiClient({ tokenKey: TOKEN_KEY });
const { api, setToken, getToken, clearToken } = client;
const apiBase = readBaseUrl();

let adminToken = getToken();

/**
 * Load all data
 */
async function loadData() {
  try {
    const data = await api('/admin/stats', { method: 'GET' });

    // Render stats
    const statsGrid = $('stats-grid');
    const foodStats = $('food-stats');
    renderStats(data.stats, statsGrid, foodStats);

    // Render teams
    const teamsContainer = $('teams-container');
    if (teamsContainer) {
      renderTeams(data.teams || [], teamsContainer);
    }

    // Store pizzas config
    if (data.pizzas) {
      setPizzasConfig(data.pizzas);
    }

    // Load other data in parallel
    await Promise.all([
      loadAttendanceData(api),
      loadPizzaData(api),
      loadRoomsData(api),
      loadArchives(api),
      loadSettings(api)
    ]);

  } catch (error) {
    console.error('Error loading data:', error);
    if (error.message === 'Unauthorized') {
      showAuth();
      clearToken();
      adminToken = '';
    } else {
      toastError('Erreur lors du chargement des données');
    }
    throw error; // Re-throw to let caller know loading failed
  }
}

// ============================================================
// AUTH HANDLING
// ============================================================

const elements = {
  get authSection() { return $('auth-section'); },
  get adminContent() { return $('admin-content'); },
  get tokenInput() { return $('admin-token'); },
  get authBtn() { return $('auth-btn'); },
  get authError() { return $('auth-error'); },
  get exportOfficialBtn() { return $('export-official-btn'); },
  get exportAllBtn() { return $('export-all-btn'); },
  get refreshBtn() { return $('refresh-btn'); },
  get addTeamBtn() { return $('add-team-btn'); },
  get addMemberBtn() { return $('add-member-btn'); },
  get selectAllBtn() { return $('select-all-btn'); },
  get deleteSelectedBtn() { return $('delete-selected-btn'); },
  get teamForm() { return $('team-form'); },
  get memberForm() { return $('member-form'); }
};

function showAuth() {
  elements.authSection?.classList.remove('hidden');
  elements.adminContent?.classList.add('hidden');
}

function showAdmin() {
  elements.authSection?.classList.add('hidden');
  elements.adminContent?.classList.remove('hidden');
}

function showAuthError(message) {
  if (elements.authError) {
    elements.authError.textContent = message;
    elements.authError.classList.remove('hidden');
  }
}

function hideAuthError() {
  elements.authError?.classList.add('hidden');
}

let authedModulesReady = false;

/**
 * Initialise the modules that need an authenticated API client.
 * Runs once, on either the stored-token or the interactive login path.
 */
function initAuthedModules() {
  if (authedModulesReady) return;
  authedModulesReady = true;
  initSettings(api);
  initImport(api, loadData);
  initAllParticipants();
  initArchives(api, apiBase, adminToken, loadData);
}

async function handleAuth() {
  const token = elements.tokenInput?.value?.trim();
  if (!token) {
    showAuthError('Veuillez entrer un token');
    return;
  }

  hideAuthError();
  adminToken = token;
  setToken(token);

  try {
    await loadData();
    showAdmin();
    initAuthedModules();
  } catch (error) {
    showAuthError(error.message === 'Unauthorized' ? 'Token invalide' : error.message);
    clearToken();
    adminToken = '';
  }
}

function handleRefresh() {
  loadData();
}

function updateDeleteButton() {
  if (elements.deleteSelectedBtn) {
    elements.deleteSelectedBtn.disabled = selectedMembers.size === 0;
    elements.deleteSelectedBtn.textContent = selectedMembers.size > 0
      ? `Supprimer sélection (${selectedMembers.size})`
      : 'Supprimer sélection';
  }
}

// ============================================================
// MAIN INIT
// ============================================================

async function init() {
  // Wire up delegated data-action/data-change handlers
  const { actions, changes } = buildActions({ api, loadData, updateDeleteButton });
  bindDelegation(actions, changes);

  // Set up auth event listeners
  elements.authBtn?.addEventListener('click', handleAuth);
  elements.tokenInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleAuth();
  });

  // Set up action buttons
  elements.exportOfficialBtn?.addEventListener('click', () => handleExportOfficial(api));
  elements.exportAllBtn?.addEventListener('click', () => handleExportAll(api));
  elements.refreshBtn?.addEventListener('click', handleRefresh);
  elements.addTeamBtn?.addEventListener('click', openAddTeamModal);
  elements.addMemberBtn?.addEventListener('click', openAddMemberModal);
  elements.selectAllBtn?.addEventListener('click', () => {
    selectAllParticipants();
    updateDeleteButton();
  });
  elements.deleteSelectedBtn?.addEventListener('click', () => deleteSelectedMembers(api, loadData, updateDeleteButton));

  // Set up forms
  elements.teamForm?.addEventListener('submit', (e) => handleTeamSubmit(e, api, loadData));
  elements.memberForm?.addEventListener('submit', (e) => handleMemberSubmit(e, api, loadData));

  // Initialize tabs and modals. Disclosure.astro instances self-init via
  // their own inline script (see astro-design/components/Disclosure.astro);
  // calling initDisclosures() again here would double-bind their toggle
  // listeners. Hand-written `.disclosure-group` sections elsewhere in this
  // dashboard use `data-action="toggle-disclosure"`, wired through the
  // delegated dispatcher below instead.
  initTabs();
  initModals();
  initTeamsSearch();
  initAttendance(api);
  initPizza(api);
  initRooms(api);

  // Try to load data if we have a token
  if (adminToken) {
    try {
      await loadData();
      showAdmin();
      initAuthedModules();
    } catch (error) {
      showAuth();
      if (error.message === 'Unauthorized') {
        clearToken();
        adminToken = '';
      }
    }
  } else {
    showAuth();
  }
}

// Run on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init(); // eslint-disable-line unicorn/prefer-top-level-await -- IIFE pattern for broader compatibility
}
