/**
 * Admin global state management
 */

import {
  DEFAULT_LATE_CUTOFF_TIME,
  DEFAULT_PRICES,
  DEFAULT_SCHOOL_NAME,
  DEFAULT_TIER1_CUTOFF_DAYS
} from '../../shared/constants.js';

// Teams and members data
export let teamsData = [];
export let selectedMembers = new Set();
export let pizzasConfig = [];

// Settings state
export const settingsState = {
  maxTeamSize: 15,
  maxTotalParticipants: 200,
  minTeamSize: 1,
  schoolName: DEFAULT_SCHOOL_NAME,
  pizzas: [],
  bacLevels: [],
  isDirty: false,
  gdprRetentionYears: 3
};

// Pricing settings
export const pricingSettings = {
  priceAssoMember: DEFAULT_PRICES.assoMember,
  priceNonMember: DEFAULT_PRICES.nonMember,
  priceLate: DEFAULT_PRICES.late,
  lateCutoffTime: DEFAULT_LATE_CUTOFF_TIME,
  paymentEnabled: false,
  priceTier1: DEFAULT_PRICES.tier1,
  priceTier2: DEFAULT_PRICES.tier2,
  tier1CutoffDays: DEFAULT_TIER1_CUTOFF_DAYS,
  registrationDeadline: ''
};

// Import state
export let csvData = null;
export let parsedRows = [];

// Archives state
export let archivesData = [];
export let selectedArchive = null;

// All participants list state
export let allParticipantsData = [];
export let allParticipantsSearchTerm = '';
export let allParticipantsSortKey = 'name';
export let allParticipantsSortDir = 'asc';

// Attendance state
export let attendanceData = [];
export let attendanceFilter = 'all';
export let attendanceSearchTerm = '';
export let attendanceSortKey = 'name';
export let attendanceSortDir = 'asc';

// Pizza state
export let pizzaData = [];
export let pizzaFilter = 'all';
export let pizzaSearchTerm = '';

// Rooms state
export let roomsData = [];
export let roomFilter = 'all';

/**
 * State setters (for modules that need to update state)
 */
export function setTeamsData(data) {
  teamsData = data;
}

export function setCsvData(data) {
  csvData = data;
}

export function setParsedRows(rows) {
  parsedRows = rows;
}

export function setArchivesData(data) {
  archivesData = data;
}

export function setSelectedArchive(archive) {
  selectedArchive = archive;
}

export function setAllParticipantsData(data) {
  allParticipantsData = data;
}

export function setAllParticipantsSearchTerm(term) {
  allParticipantsSearchTerm = term;
}

export function setAllParticipantsSortKey(key) {
  allParticipantsSortKey = key;
}

export function setAllParticipantsSortDir(dir) {
  allParticipantsSortDir = dir;
}

export function setAttendanceData(data) {
  attendanceData = data;
}

export function setAttendanceFilter(filter) {
  attendanceFilter = filter;
}

export function setAttendanceSearchTerm(term) {
  attendanceSearchTerm = term;
}

export function setPizzaData(data) {
  pizzaData = data;
}

export function setPizzaFilter(filter) {
  pizzaFilter = filter;
}

export function setRoomsData(data) {
  roomsData = data;
}

export function setRoomFilter(filter) {
  roomFilter = filter;
}

export function setPizzasConfig(config) {
  pizzasConfig = config;
}

/**
 * Clear all state (for logout)
 */
export function clearState() {
  teamsData = [];
  // eslint-disable-next-line sonarjs/no-empty-collection -- Set is populated by consuming code
  selectedMembers.clear();
  pizzasConfig = [];
  csvData = null;
  parsedRows = [];
  archivesData = [];
  selectedArchive = null;
  allParticipantsData = [];
  attendanceData = [];
  pizzaData = [];
  roomsData = [];
}
