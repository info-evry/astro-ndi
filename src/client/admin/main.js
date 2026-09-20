/**
 * Admin Dashboard Main Entry Point
 *
 * This module bootstraps the admin dashboard by:
 * 1. Reading baseUrl from DOM data attribute
 * 2. Creating the API client
 * 3. Initializing all modules
 * 4. Setting up event listeners (including delegated data-action/data-change handling)
 */
/* eslint-env browser */

// Core utilities
import { $ } from './utils.js';
import { toastError } from './toast.js';
import { createApiClient, setToken } from './api.js';
import { initTabs } from './tabs.js';
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

let api;
let adminToken = '';

/**
 * Get baseUrl from DOM data attribute
 */
function getBaseUrl() {
  const el = document.getElementById('admin-config');
  return el?.dataset.baseUrl || '';
}

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
      localStorage.removeItem('ndi_admin_token');
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

async function handleAuth() {
  const token = elements.tokenInput?.value?.trim();
  if (!token) {
    showAuthError('Veuillez entrer un token');
    return;
  }

  hideAuthError();
  adminToken = token;
  setToken(token);
  localStorage.setItem('ndi_admin_token', token);

  try {
    await loadData();
    showAdmin();
  } catch (error) {
    showAuthError(error.message === 'Unauthorized' ? 'Token invalide' : error.message);
    localStorage.removeItem('ndi_admin_token');
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
  // Get base URL and create API client
  const baseUrl = getBaseUrl();
  const apiBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  api = createApiClient(apiBase);

  // Check for stored token
  adminToken = localStorage.getItem('ndi_admin_token') || '';
  if (adminToken) {
    setToken(adminToken);
  }

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

  // Modal close on backdrop click
  for (const modal of document.querySelectorAll('.modal')) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  }

  // Initialize tabs and modules
  initTabs();
  initTeamsSearch();
  initAttendance(api);
  initPizza(api);
  initRooms(api);

  // Try to load data if we have a token
  if (adminToken) {
    try {
      await loadData();
      showAdmin();
      initSettings(api);
      initImport(api, loadData);
      initAllParticipants();
      initArchives(api, apiBase, adminToken, loadData);
    } catch (error) {
      showAuth();
      if (error.message === 'Unauthorized') {
        localStorage.removeItem('ndi_admin_token');
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
