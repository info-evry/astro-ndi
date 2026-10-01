/**
 * Admin Dashboard Main Entry Point
 *
 * This module bootstraps the admin dashboard by:
 * 1. Creating the API client (base URL read from <meta name="base-url">)
 * 2. Creating the admin shell (login flow: stored token, interactive login,
 *    401 handling; see astro-design/scripts/admin-shell)
 * 3. Initializing all modules
 * 4. Setting up event listeners (including delegated data-action/data-change handling)
 */
/* eslint-env browser */

// Shared design-system client scripts
import { $ } from '@info-evry/astro-design/scripts/dom';
import { toastError } from '@info-evry/astro-design/scripts/toast';
import { createApiClient } from '@info-evry/astro-design/scripts/api-client';
import { createAdminShell } from '@info-evry/astro-design/scripts/admin-shell';
import { bindDelegation } from '@info-evry/astro-design/scripts/delegation';
import { initTabs } from '@info-evry/astro-design/scripts/tabs';
import { initModals } from '@info-evry/astro-design/scripts/modal';
import { buildActions } from './actions.js';

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
const { api } = client;

/**
 * Load and render all the data. Throws on failure: the admin shell decides
 * what a 401 or any other failure means (login screen, toast).
 */
async function loadData() {
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
}

let authedModulesReady = false;

/**
 * Initialise the modules that need an authenticated API client.
 * The shell runs it once, after the first successful login (stored token or
 * interactive). They all share the live `api` client, so none of them keeps a
 * stale copy of the token.
 */
function initAuthedModules() {
  if (authedModulesReady) return;
  authedModulesReady = true;
  initSettings(api);
  initImport(api, reloadData);
  initAllParticipants();
  initArchives(api, reloadData);
}

const shell = createAdminShell({
  api: client,
  selectors: {
    authSection: '#auth-section',
    adminContent: '#admin-content',
    tokenInput: '#admin-token',
    authBtn: '#auth-btn',
    authError: '#auth-error'
  },
  load: loadData,
  afterLogin: initAuthedModules
});

/**
 * loadData for fire-and-forget callers (buttons, forms, domain modules).
 * Never throws: a 401 sends the admin back to the login form, any other
 * failure is reported with a toast (see `shell.reload`).
 */
function reloadData() {
  return shell.reload();
}

// ============================================================
// ELEMENTS
// ============================================================

const elements = {
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

function handleRefresh() {
  reloadData();
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
  const { actions, changes } = buildActions({ api, loadData: reloadData, updateDeleteButton });
  bindDelegation(actions, changes, { onError: (error) => toastError(error?.message || 'Une erreur est survenue') });

  // Set up action buttons
  elements.exportOfficialBtn?.addEventListener('click', () => handleExportOfficial(api));
  elements.exportAllBtn?.addEventListener('click', () => handleExportAll(api));
  elements.refreshBtn?.addEventListener('click', handleRefresh);
  elements.addTeamBtn?.addEventListener('click', openAddTeamModal);
  elements.addMemberBtn?.addEventListener('click', openAddMemberModal);
  elements.selectAllBtn?.addEventListener('click', () => {
    // selectAllParticipants refreshes the delete button and the toggle label itself
    selectAllParticipants(updateDeleteButton, elements.selectAllBtn);
  });
  elements.deleteSelectedBtn?.addEventListener('click', () => deleteSelectedMembers(api, reloadData, updateDeleteButton));

  // Set up forms
  elements.teamForm?.addEventListener('submit', (e) => handleTeamSubmit(e, api, reloadData));
  elements.memberForm?.addEventListener('submit', (e) => handleMemberSubmit(e, api, reloadData));

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

  // Log in with the stored token, or show the login form
  await shell.init();
}

// Run on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init(); // eslint-disable-line unicorn/prefer-top-level-await -- IIFE pattern for broader compatibility
}
