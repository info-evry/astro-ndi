/**
 * Admin Dashboard Main Entry Point
 *
 * This module bootstraps the admin dashboard by:
 * 1. Reading baseUrl from DOM data attribute
 * 2. Creating the API client
 * 3. Initializing all modules
 * 4. Setting up event listeners
 * 5. Exposing global functions for onclick handlers
 */
/* eslint-env browser */

// Core utilities
import { $ } from './utils.js';
import { toastSuccess, toastError } from './toast.js';
import { createApiClient, setToken } from './api.js';
import { closeModal, toggleDisclosure } from './modals.js';
import { initTabs } from './tabs.js';

// State management
import {
  teamsData,
  setTeamsData,
  selectedMembers,
  setPizzasConfig,
  pricingSettings,
  attendanceData
} from './state.js';

// Domain modules
import {
  renderStats,
  renderTeams,
  updateTeamSelect,
  toggleTeam,
  toggleSelectAll,
  toggleMemberSelect,
  sortTeamMembers,
  editTeam,
  editMember,
  confirmDeleteTeam,
  confirmDeleteMember,
  deleteSelectedMembers,
  handleTeamSubmit,
  handleMemberSubmit,
  exportTeam,
  exportTeamOfficial,
  handleExportOfficial,
  handleExportAll,
  initTeamsSearch,
  initAllParticipants,
  sortAllParticipants,
  openAddTeamModal,
  openAddMemberModal,
  selectAllParticipants
} from './registrations.js';

import {
  loadAttendanceData,
  handleCheckIn,
  handleCheckOut,
  confirmCheckIn,
  initAttendance
} from './attendance.js';

import {
  loadPizzaData,
  handleGivePizza,
  handleRevokePizza,
  initPizza
} from './pizza.js';

import {
  loadRoomsData,
  handleRoomChange,
  handleClearRoom,
  initRooms
} from './rooms.js';

import {
  loadArchives,
  viewArchive,
  deleteArchive,
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

  } catch (err) {
    console.error('Error loading data:', err);
    if (err.message === 'Unauthorized') {
      showAuth();
      localStorage.removeItem('ndi_admin_token');
      adminToken = '';
    } else {
      toastError('Erreur lors du chargement des données');
    }
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
  } catch (err) {
    showAuthError(err.message === 'Unauthorized' ? 'Token invalide' : err.message);
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
// GLOBAL EXPORTS FOR ONCLICK HANDLERS
// ============================================================

// Modals
window.closeModal = closeModal;
window.toggleDisclosure = toggleDisclosure;

// Teams
window.toggleTeam = toggleTeam;
window.editTeam = editTeam;
window.confirmDeleteTeam = (teamId, teamName) => confirmDeleteTeam(teamId, teamName, api, loadData);
window.exportTeam = (teamId, teamName) => exportTeam(teamId, teamName, api);
window.exportTeamOfficial = (teamId, teamName) => exportTeamOfficial(teamId, teamName, api);
window.toggleSelectAll = (teamId, checked) => {
  toggleSelectAll(teamId, checked);
  updateDeleteButton();
};
window.toggleMemberSelect = (memberId, checked) => {
  toggleMemberSelect(memberId, checked);
  updateDeleteButton();
};
window.sortTeamMembers = sortTeamMembers;

// Members
window.editMember = editMember;
window.confirmDeleteMember = (memberId, memberName) => confirmDeleteMember(memberId, memberName, api, loadData);

// All Participants
window.sortAllParticipants = sortAllParticipants;

// Attendance
window.handleCheckIn = (memberId) => handleCheckIn(memberId, api, loadData);
window.handleCheckOut = (memberId) => handleCheckOut(memberId, api, loadData);
window.confirmCheckIn = () => confirmCheckIn(api, loadData);

// Pizza
window.handleGivePizza = (memberId) => handleGivePizza(memberId, api, loadData);
window.handleRevokePizza = (memberId) => handleRevokePizza(memberId, api, loadData);

// Rooms
window.handleRoomChange = (teamId, room) => handleRoomChange(teamId, room, api, loadData);
window.handleClearRoom = (teamId) => handleClearRoom(teamId, api, loadData);

// Archives
window.viewArchive = (year) => viewArchive(year, api);
window.deleteArchive = (year) => deleteArchive(year, api, loadData);

// Data loading
window.loadData = loadData;

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
  elements.deleteSelectedBtn?.addEventListener('click', () => deleteSelectedMembers(api, loadData));

  // Set up forms
  elements.teamForm?.addEventListener('submit', (e) => handleTeamSubmit(e, api, loadData));
  elements.memberForm?.addEventListener('submit', (e) => handleMemberSubmit(e, api, loadData));

  // Modal close on backdrop click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  });

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
      initArchives(api, loadData);
    } catch (err) {
      showAuth();
      if (err.message === 'Unauthorized') {
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
  init();
}
