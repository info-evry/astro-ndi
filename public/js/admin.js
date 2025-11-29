/**
 * NDI Admin Dashboard
 * Vanilla JavaScript, ES Modules
 */

// State
let adminToken = localStorage.getItem('ndi_admin_token') || '';

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
  refreshBtn: document.getElementById('refresh-btn')
};

// API Functions
async function api(endpoint) {
  const response = await fetch(`/api${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (response.status === 401) {
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Request failed');
  }

  return response;
}

async function fetchAdminStats() {
  const response = await api('/admin/stats');
  return response.json();
}

async function downloadCSV(endpoint, filename) {
  const response = await api(endpoint);
  const blob = await response.blob();

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

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
          <span>${team.created_at ? new Date(team.created_at).toLocaleDateString('fr-FR') : ''}</span>
        </div>
      </div>
      <div class="team-body">
        ${team.description ? `<p><em>${escapeHtml(team.description)}</em></p>` : ''}
        <div class="team-actions">
          <button type="button" class="btn btn-secondary" onclick="exportTeam(${team.id}, '${escapeHtml(team.name)}')">
            Exporter CSV
          </button>
        </div>
        ${renderMembersTable(team.members)}
      </div>
    </div>
  `).join('');
}

function renderMembersTable(members) {
  if (!members || members.length === 0) {
    return '<p>Aucun membre</p>';
  }

  return `
    <table class="members-table">
      <thead>
        <tr>
          <th>Nom</th>
          <th>Email</th>
          <th>Niveau</th>
          <th>Pizza</th>
          <th>Rôle</th>
        </tr>
      </thead>
      <tbody>
        ${members.map(m => `
          <tr>
            <td>${escapeHtml(m.first_name)} ${escapeHtml(m.last_name)}</td>
            <td><a href="mailto:${escapeHtml(m.email)}">${escapeHtml(m.email)}</a></td>
            <td><span class="badge badge-bac">BAC+${m.bac_level}</span></td>
            <td>${escapeHtml(m.food_diet) || 'Aucune'}</td>
            <td>${m.is_leader ? '<span class="badge badge-leader">Chef</span>' : ''}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
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

// Global functions for onclick handlers
window.toggleTeam = function(teamId) {
  const block = document.querySelector(`[data-team-id="${teamId}"]`);
  if (block) block.classList.toggle('open');
};

window.exportTeam = async function(teamId, teamName) {
  try {
    const safeName = teamName.replace(/[^a-z0-9]/gi, '_');
    await downloadCSV(`/admin/export/${teamId}`, `participants_${safeName}.csv`);
  } catch (err) {
    alert('Erreur export: ' + err.message);
  }
};

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
  const { stats, teams } = await fetchAdminStats();
  renderStats(stats);
  renderFoodStats(stats.food_preferences);
  renderTeams(teams);
}

async function handleExportAll() {
  try {
    await downloadCSV('/admin/export', 'participants.csv');
  } catch (err) {
    alert('Erreur export: ' + err.message);
  }
}

async function handleRefresh() {
  try {
    await loadData();
  } catch (err) {
    if (err.message === 'Unauthorized') {
      showAuth();
      showAuthError('Session expirée');
    } else {
      alert('Erreur: ' + err.message);
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

  // Check existing token
  if (adminToken) {
    try {
      await loadData();
      showAdmin();
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

init();
