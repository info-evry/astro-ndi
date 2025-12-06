/**
 * Admin state management
 * Global state for the admin dashboard
 */

import { $ } from './utils.js';

// ============================================================
// DATA STATE
// ============================================================

export let teamsData = [];
export let selectedMembers = new Set();
export let pizzasConfig = [];

/**
 * Set teams data
 * @param {Array} data
 */
export function setTeamsData(data) {
  teamsData = data;
}

/**
 * Get teams data
 * @returns {Array}
 */
export function getTeamsData() {
  return teamsData;
}

/**
 * Clear selected members
 */
export function clearSelectedMembers() {
  selectedMembers.clear();
}

/**
 * Toggle member selection
 * @param {string} memberId
 */
export function toggleMemberSelection(memberId) {
  if (selectedMembers.has(memberId)) {
    selectedMembers.delete(memberId);
  } else {
    selectedMembers.add(memberId);
  }
}

/**
 * Get selected members
 * @returns {Set}
 */
export function getSelectedMembers() {
  return selectedMembers;
}

/**
 * Set pizzas config
 * @param {Array} config
 */
export function setPizzasConfig(config) {
  pizzasConfig = config;
}

/**
 * Get pizzas config
 * @returns {Array}
 */
export function getPizzasConfig() {
  return pizzasConfig;
}

// ============================================================
// SETTINGS STATE
// ============================================================

export const settingsState = {
  maxTeamSize: 15,
  maxTotalParticipants: 200,
  minTeamSize: 1,
  schoolName: "Université d'Evry",
  pizzas: [],
  bacLevels: [],
  isDirty: false
};

/**
 * Update settings state
 * @param {Object} updates
 */
export function updateSettings(updates) {
  Object.assign(settingsState, updates);
}

/**
 * Mark settings as dirty
 */
export function markSettingsDirty() {
  settingsState.isDirty = true;
}

/**
 * Mark settings as clean
 */
export function markSettingsClean() {
  settingsState.isDirty = false;
}

// ============================================================
// IMPORT STATE
// ============================================================

export let csvData = null;
export let parsedRows = [];

/**
 * Set CSV data
 * @param {any} data
 */
export function setCsvData(data) {
  csvData = data;
}

/**
 * Get CSV data
 * @returns {any}
 */
export function getCsvData() {
  return csvData;
}

/**
 * Set parsed rows
 * @param {Array} rows
 */
export function setParsedRows(rows) {
  parsedRows = rows;
}

/**
 * Get parsed rows
 * @returns {Array}
 */
export function getParsedRows() {
  return parsedRows;
}

// ============================================================
// DOM ELEMENTS CACHE
// ============================================================

let elementsCache = null;

/**
 * Get cached DOM elements
 * @returns {Object}
 */
export function getElements() {
  if (elementsCache) return elementsCache;
  
  elementsCache = {
    authSection: $('auth-section'),
    adminContent: $('admin-content'),
    tokenInput: $('admin-token'),
    authBtn: $('auth-btn'),
    authError: $('auth-error'),
    statsGrid: $('stats-grid'),
    foodStats: $('food-stats'),
    teamsContainer: $('teams-container'),
    exportOfficialBtn: $('export-official-btn'),
    exportAllBtn: $('export-all-btn'),
    refreshBtn: $('refresh-btn'),
    addTeamBtn: $('add-team-btn'),
    addMemberBtn: $('add-member-btn'),
    selectAllBtn: $('select-all-btn'),
    deleteSelectedBtn: $('delete-selected-btn'),
    teamModal: $('team-modal'),
    memberModal: $('member-modal'),
    confirmModal: $('confirm-modal'),
    teamForm: $('team-form'),
    memberForm: $('member-form'),
    confirmDeleteBtn: $('confirm-delete-btn')
  };
  
  return elementsCache;
}

/**
 * Clear elements cache (for testing or re-initialization)
 */
export function clearElementsCache() {
  elementsCache = null;
}
