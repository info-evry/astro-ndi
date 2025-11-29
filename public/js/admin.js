/**
 * NDI Admin Dashboard
 * Full CRUD functionality for teams and members
 */

import { initSettings, loadSettings } from './admin/admin-settings.js';
import { initImport } from './admin/admin-import.js';

// State
let adminToken = localStorage.getItem('ndi_admin_token') || '';
let teamsData = [];
let selectedMembers = new Set();

// DOM Elements
const elements = {
  authSection: document.getElementById('auth-section'),
  adminContent: document.getElementById('admin-content'),
  tokenInput: document.getElementById('admin-token'),
  authBtn: document.getElementById('auth-btn'),
  authError: document.getElementById('auth-error'),
  statsGrid: document.getElementById('stats-grid'),
  foodStats: document.getElementById('food-stats'),
  teamsContainer: document.getElementById('teams-container'),
  exportAllBtn: document.getElementById('export-all-btn'),
  refreshBtn: document.getElementById('refresh-btn'),
  addTeamBtn: document.getElementById('add-team-btn'),
  addMemberBtn: document.getElementById('add-member-btn'),
  deleteSelectedBtn: document.getElementById('delete-selected-btn'),
  // Modals
  teamModal: document.getElementById('team-modal'),
  memberModal: document.getElementById('member-modal'),
  confirmModal: document.getElementById('confirm-modal'),
  // Forms
  teamForm: document.getElementById('team-form'),
  memberForm: document.getElementById('member-form'),
  confirmDeleteBtn: document.getElementById('confirm-delete-btn')
};

// API Functions
async function api(endpoint, options = {}) {
  const response = await fetch(`/api${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });

  if (response.status === 401) {
    throw new Error('Unauthorized');
  }

  // Handle CSV downloads
  if (response.headers.get('Content-Type')?.includes('text/csv')) {
    return response;
  }

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Request failed');
  }

  return response.json();
}

// Toast notifications
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Modal functions
window.closeModal = function(modalId) {
  document.getElementById(modalId).classList.add('hidden');
};

function openModal(modalId) {
  document.getElementById(modalId).classList.remove('hidden');
}

// Disclosure group toggle
window.toggleDisclosure = function(name) {
  const group = document.querySelector(`[data-disclosure="${name}"]`);
  if (group) {
    group.classList.toggle('open');
  }
};

// Render Functions
function renderStats(stats) {
  elements.statsGrid.innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${stats.total_teams}</div>
      <div class="stat-label">Équipes</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${stats.total_participants}</div>
      <div class="stat-label">Participants</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${stats.max_participants}</div>
      <div class="stat-label">Capacité max</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${stats.available_spots}</div>
      <div class="stat-label">Places restantes</div>
    </div>
  `;
}

function renderFoodStats(foodPreferences) {
  if (!foodPreferences || foodPreferences.length === 0) {
    elements.foodStats.innerHTML = '<p>Aucune préférence enregistrée</p>';
    return;
  }

  elements.foodStats.innerHTML = foodPreferences
    .map(item => `
      <div class="food-item">
        <span class="count">${item.count}</span> ${escapeHtml(item.food_diet)}
      </div>
    `)
    .join('');
}

function renderTeams(teams) {
  teamsData = teams;
  updateTeamSelect();

  if (!teams || teams.length === 0) {
    elements.teamsContainer.innerHTML = '<p>Aucune équipe inscrite</p>';
    return;
  }

  elements.teamsContainer.innerHTML = teams.map(team => `
    <div class="team-block" data-team-id="${team.id}">
      <div class="team-header" onclick="toggleTeam(${team.id})">
        <h3>${escapeHtml(team.name)}</h3>
        <div class="team-info">
          <span>${team.members?.length || 0} membre(s)</span>
        </div>
      </div>
      <div class="team-body">
        ${team.description ? `<p><em>${escapeHtml(team.description)}</em></p>` : ''}
        <div class="team-actions">
          <button type="button" class="btn btn-sm btn-secondary" onclick="editTeam(${team.id})">Modifier</button>
          <button type="button" class="btn btn-sm btn-secondary" onclick="exportTeam(${team.id}, '${escapeHtml(team.name)}')">Exporter CSV</button>
          ${team.name !== 'Organisation' ? `<button type="button" class="btn btn-sm btn-danger" onclick="confirmDeleteTeam(${team.id}, '${escapeHtml(team.name)}')">Supprimer</button>` : ''}
        </div>
        ${renderMembersTable(team.members, team.id)}
      </div>
    </div>
  `).join('');
}

function renderMembersTable(members, teamId) {
  if (!members || members.length === 0) {
    return '<p>Aucun membre</p>';
  }

  return `
    <table class="members-table">
      <thead>
        <tr>
          <th class="checkbox-col">
            <label class="select-all-label">
              <input type="checkbox" onchange="toggleSelectAll(${teamId}, this.checked)">
            </label>
          </th>
          <th>Nom</th>
          <th>Email</th>
          <th>Niveau</th>
          <th>Pizza</th>
          <th>Rôle</th>
          <th class="actions-col">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${members.map(m => `
          <tr class="member-row" data-member-id="${m.id}">
            <td class="checkbox-col">
              <input type="checkbox" onchange="toggleMemberSelect(${m.id}, this.checked)">
            </td>
            <td>${escapeHtml(m.first_name)} ${escapeHtml(m.last_name)}</td>
            <td><a href="mailto:${escapeHtml(m.email)}">${escapeHtml(m.email)}</a></td>
            <td><span class="badge badge-bac">BAC+${m.bac_level}</span></td>
            <td>${escapeHtml(m.food_diet) || '-'}</td>
            <td>${m.is_leader ? '<span class="badge badge-leader">Chef</span>' : ''}</td>
            <td class="actions-col">
              <button type="button" class="btn btn-sm btn-secondary" onclick="editMember(${m.id}, ${teamId})">Modifier</button>
              <button type="button" class="btn btn-sm btn-danger" onclick="confirmDeleteMember(${m.id}, '${escapeHtml(m.first_name)} ${escapeHtml(m.last_name)}')">×</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function updateTeamSelect() {
  const select = document.getElementById('member-form-team');
  if (select) {
    select.innerHTML = teamsData.map(t =>
      `<option value="${t.id}">${escapeHtml(t.name)}</option>`
    ).join('');
  }
}

// UI Helpers
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showAuth() {
  elements.authSection.classList.remove('hidden');
  elements.adminContent.classList.add('hidden');
}

function showAdmin() {
  elements.authSection.classList.add('hidden');
  elements.adminContent.classList.remove('hidden');
}

function showAuthError(message) {
  elements.authError.textContent = message;
  elements.authError.classList.remove('hidden');
}

function hideAuthError() {
  elements.authError.classList.add('hidden');
}

function updateDeleteButton() {
  elements.deleteSelectedBtn.disabled = selectedMembers.size === 0;
  elements.deleteSelectedBtn.textContent = selectedMembers.size > 0
    ? `Supprimer sélection (${selectedMembers.size})`
    : 'Supprimer sélection';
}

// Global functions for onclick handlers
window.toggleTeam = function(teamId) {
  const block = document.querySelector(`[data-team-id="${teamId}"]`);
  if (block) block.classList.toggle('open');
};

window.toggleSelectAll = function(teamId, checked) {
  const block = document.querySelector(`[data-team-id="${teamId}"]`);
  block.querySelectorAll('.member-row input[type="checkbox"]').forEach(cb => {
    cb.checked = checked;
    const memberId = parseInt(cb.closest('.member-row').dataset.memberId);
    if (checked) {
      selectedMembers.add(memberId);
    } else {
      selectedMembers.delete(memberId);
    }
  });
  updateDeleteButton();
};

window.toggleMemberSelect = function(memberId, checked) {
  if (checked) {
    selectedMembers.add(memberId);
  } else {
    selectedMembers.delete(memberId);
  }
  updateDeleteButton();
};

window.exportTeam = async function(teamId, teamName) {
  try {
    const response = await api(`/admin/export/${teamId}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `participants_${teamName.replace(/[^a-z0-9]/gi, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    showToast('Erreur export: ' + err.message, 'error');
  }
};

// Team CRUD
window.editTeam = function(teamId) {
  const team = teamsData.find(t => t.id === teamId);
  if (!team) return;

  document.getElementById('team-modal-title').textContent = 'Modifier l\'équipe';
  document.getElementById('team-form-id').value = teamId;
  document.getElementById('team-form-name').value = team.name;
  document.getElementById('team-form-desc').value = team.description || '';
  document.getElementById('team-form-password').value = '';
  openModal('team-modal');
};

function openAddTeamModal() {
  document.getElementById('team-modal-title').textContent = 'Nouvelle équipe';
  document.getElementById('team-form-id').value = '';
  document.getElementById('team-form-name').value = '';
  document.getElementById('team-form-desc').value = '';
  document.getElementById('team-form-password').value = '';
  openModal('team-modal');
}

window.confirmDeleteTeam = function(teamId, teamName) {
  document.getElementById('confirm-message').textContent =
    `Êtes-vous sûr de vouloir supprimer l'équipe "${teamName}" et tous ses membres ?`;
  elements.confirmDeleteBtn.onclick = () => deleteTeam(teamId);
  openModal('confirm-modal');
};

async function deleteTeam(teamId) {
  try {
    await api(`/admin/teams/${teamId}`, { method: 'DELETE' });
    showToast('Équipe supprimée');
    closeModal('confirm-modal');
    loadData();
  } catch (err) {
    showToast('Erreur: ' + err.message, 'error');
  }
}

// Member CRUD
window.editMember = function(memberId, teamId) {
  const team = teamsData.find(t => t.id === teamId);
  const member = team?.members?.find(m => m.id === memberId);
  if (!member) return;

  document.getElementById('member-modal-title').textContent = 'Modifier le membre';
  document.getElementById('member-form-id').value = memberId;
  document.getElementById('member-form-team').value = teamId;
  document.getElementById('member-form-firstname').value = member.first_name;
  document.getElementById('member-form-lastname').value = member.last_name;
  document.getElementById('member-form-email').value = member.email;
  document.getElementById('member-form-bac').value = member.bac_level;
  document.getElementById('member-form-food').value = member.food_diet || '';
  document.getElementById('member-form-leader').checked = !!member.is_leader;
  openModal('member-modal');
};

function openAddMemberModal() {
  document.getElementById('member-modal-title').textContent = 'Nouveau membre';
  document.getElementById('member-form-id').value = '';
  document.getElementById('member-form-team').value = teamsData[0]?.id || '';
  document.getElementById('member-form-firstname').value = '';
  document.getElementById('member-form-lastname').value = '';
  document.getElementById('member-form-email').value = '';
  document.getElementById('member-form-bac').value = '0';
  document.getElementById('member-form-food').value = '';
  document.getElementById('member-form-leader').checked = false;
  openModal('member-modal');
}

window.confirmDeleteMember = function(memberId, memberName) {
  document.getElementById('confirm-message').textContent =
    `Êtes-vous sûr de vouloir supprimer ${memberName} ?`;
  elements.confirmDeleteBtn.onclick = () => deleteMember(memberId);
  openModal('confirm-modal');
};

async function deleteMember(memberId) {
  try {
    await api(`/admin/members/${memberId}`, { method: 'DELETE' });
    showToast('Membre supprimé');
    closeModal('confirm-modal');
    selectedMembers.delete(memberId);
    updateDeleteButton();
    loadData();
  } catch (err) {
    showToast('Erreur: ' + err.message, 'error');
  }
}

async function deleteSelectedMembers() {
  if (selectedMembers.size === 0) return;

  document.getElementById('confirm-message').textContent =
    `Êtes-vous sûr de vouloir supprimer ${selectedMembers.size} membre(s) ?`;
  elements.confirmDeleteBtn.onclick = async () => {
    try {
      await api('/admin/members/delete-batch', {
        method: 'POST',
        body: JSON.stringify({ memberIds: Array.from(selectedMembers) })
      });
      showToast(`${selectedMembers.size} membre(s) supprimé(s)`);
      closeModal('confirm-modal');
      selectedMembers.clear();
      updateDeleteButton();
      loadData();
    } catch (err) {
      showToast('Erreur: ' + err.message, 'error');
    }
  };
  openModal('confirm-modal');
}

// Form handlers
async function handleTeamSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('team-form-id').value;
  const name = document.getElementById('team-form-name').value;
  const description = document.getElementById('team-form-desc').value;
  const password = document.getElementById('team-form-password').value;

  try {
    if (id) {
      // Update
      await api(`/admin/teams/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, description, password })
      });
      showToast('Équipe mise à jour');
    } else {
      // Create
      await api('/admin/teams', {
        method: 'POST',
        body: JSON.stringify({ name, description, password })
      });
      showToast('Équipe créée');
    }
    closeModal('team-modal');
    loadData();
  } catch (err) {
    showToast('Erreur: ' + err.message, 'error');
  }
}

async function handleMemberSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('member-form-id').value;
  const teamId = parseInt(document.getElementById('member-form-team').value);
  const firstName = document.getElementById('member-form-firstname').value;
  const lastName = document.getElementById('member-form-lastname').value;
  const email = document.getElementById('member-form-email').value;
  const bacLevel = parseInt(document.getElementById('member-form-bac').value);
  const foodDiet = document.getElementById('member-form-food').value;
  const isLeader = document.getElementById('member-form-leader').checked;

  try {
    if (id) {
      // Update
      await api(`/admin/members/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ teamId, firstName, lastName, email, bacLevel, foodDiet, isLeader })
      });
      showToast('Membre mis à jour');
    } else {
      // Create
      await api('/admin/members', {
        method: 'POST',
        body: JSON.stringify({ teamId, firstName, lastName, email, bacLevel, foodDiet, isLeader })
      });
      showToast('Membre ajouté');
    }
    closeModal('member-modal');
    loadData();
  } catch (err) {
    showToast('Erreur: ' + err.message, 'error');
  }
}

// Event Handlers
async function handleAuth() {
  const token = elements.tokenInput.value.trim();
  if (!token) {
    showAuthError('Token requis');
    return;
  }

  adminToken = token;
  hideAuthError();

  try {
    await loadData();
    localStorage.setItem('ndi_admin_token', token);
    showAdmin();
    initSettings();
    initImport();
  } catch (err) {
    if (err.message === 'Unauthorized') {
      showAuthError('Token invalide');
      adminToken = '';
      localStorage.removeItem('ndi_admin_token');
    } else {
      showAuthError('Erreur: ' + err.message);
    }
  }
}

async function loadData() {
  const { stats, teams } = await api('/admin/stats');
  renderStats(stats);
  renderFoodStats(stats.food_preferences);
  renderTeams(teams);
  // Refresh settings data
  await loadSettings();
}

async function handleExportAll() {
  try {
    const response = await api('/admin/export');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'participants.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    showToast('Erreur export: ' + err.message, 'error');
  }
}

async function handleRefresh() {
  try {
    await loadData();
    showToast('Données actualisées');
  } catch (err) {
    if (err.message === 'Unauthorized') {
      showAuth();
      showAuthError('Session expirée');
    } else {
      showToast('Erreur: ' + err.message, 'error');
    }
  }
}

// Initialize
async function init() {
  // Event listeners
  elements.authBtn.addEventListener('click', handleAuth);
  elements.tokenInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleAuth();
  });
  elements.exportAllBtn.addEventListener('click', handleExportAll);
  elements.refreshBtn.addEventListener('click', handleRefresh);
  elements.addTeamBtn.addEventListener('click', openAddTeamModal);
  elements.addMemberBtn.addEventListener('click', openAddMemberModal);
  elements.deleteSelectedBtn.addEventListener('click', deleteSelectedMembers);
  elements.teamForm.addEventListener('submit', handleTeamSubmit);
  elements.memberForm.addEventListener('submit', handleMemberSubmit);

  // Close modals on backdrop click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  });

  // Check existing token
  if (adminToken) {
    try {
      await loadData();
      showAdmin();
      initSettings();
      initImport();
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

// Expose loadData globally for import module refresh
window.loadData = loadData;

init();
