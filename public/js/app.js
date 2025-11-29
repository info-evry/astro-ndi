/**
 * Nuit de l'Info - Registration App
 * Vanilla JavaScript, ES Modules, No Dependencies
 */

// State
const state = {
  config: null,
  teams: [],
  stats: null,
  members: [],
  isNewTeam: true,
  selectedTeamId: null,
  isAtCapacity: false
};

// DOM Elements
const elements = {
  statsContainer: document.getElementById('stats'),
  teamsList: document.getElementById('teams-list'),
  teamsBadge: document.getElementById('teams-badge'),
  teamSelect: document.getElementById('team-select'),
  newTeamFields: document.getElementById('new-team-fields'),
  joinTeamFields: document.getElementById('join-team-fields'),
  membersContainer: document.getElementById('members-container'),
  memberCount: document.getElementById('member-count'),
  addMemberBtn: document.getElementById('add-member'),
  form: document.getElementById('registration-form'),
  formSection: document.getElementById('form-section'),
  submitBtn: document.getElementById('submit-btn'),
  errorsDiv: document.getElementById('form-errors'),
  successModal: document.getElementById('success-modal'),
  successMessage: document.getElementById('success-message'),
  capacityWarning: document.getElementById('capacity-warning'),
  capacityWarningText: document.getElementById('capacity-warning-text'),
  // Team view modal elements
  teamViewModal: document.getElementById('team-view-modal'),
  teamViewAuth: document.getElementById('team-view-auth'),
  teamViewContent: document.getElementById('team-view-content'),
  teamViewTitle: document.getElementById('team-view-title'),
  teamViewPassword: document.getElementById('team-view-password'),
  teamViewError: document.getElementById('team-view-error'),
  teamViewSubmit: document.getElementById('team-view-submit'),
  teamViewCancel: document.getElementById('team-view-cancel'),
  teamViewClose: document.getElementById('team-view-close'),
  teamDetailName: document.getElementById('team-detail-name'),
  teamDetailDesc: document.getElementById('team-detail-desc'),
  teamMembersList: document.getElementById('team-members-list')
};

// Disclosure toggle function (global for onclick)
window.toggleDisclosure = function(name) {
  const group = document.querySelector(`[data-disclosure="${name}"]`);
  if (group) {
    group.classList.toggle('open');
  }
};

// API Functions
async function api(endpoint, options = {}) {
  const response = await fetch(`/api${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function loadConfig() {
  const { config } = await api('/config');
  state.config = config;
  return config;
}

async function loadTeams() {
  const { teams } = await api('/teams');
  state.teams = teams;
  return teams;
}

async function loadStats() {
  const { stats } = await api('/stats');
  state.stats = stats;
  return stats;
}

async function submitRegistration(data) {
  return api('/register', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

async function viewTeamMembers(teamId, password) {
  return api(`/teams/${teamId}/view`, {
    method: 'POST',
    body: JSON.stringify({ password })
  });
}

// Render Functions
function renderStats(stats) {
  const percentUsed = (stats.total_participants / stats.max_participants) * 100;
  const isNearCapacity = percentUsed >= 80;
  const isAtCapacity = stats.available_spots <= 0;

  state.isAtCapacity = isAtCapacity;

  elements.statsContainer.innerHTML = `
    <div class="stat">
      <span class="stat-value">${stats.total_teams}</span>
      <span class="stat-label">équipes</span>
    </div>
    <div class="stat">
      <span class="stat-value">${stats.total_participants}/${stats.max_participants}</span>
      <span class="stat-label">participants</span>
    </div>
    <div class="stat">
      <span class="stat-value">${stats.available_spots}</span>
      <span class="stat-label">places disponibles</span>
    </div>
  `;

  // Handle capacity warning
  if (isAtCapacity) {
    elements.capacityWarning.classList.remove('hidden');
    elements.capacityWarning.classList.add('capacity-full');
    elements.capacityWarningText.innerHTML = '<strong>Inscriptions closes</strong> — Le nombre maximum de participants a été atteint.';
    disableForm();
  } else if (isNearCapacity) {
    elements.capacityWarning.classList.remove('hidden');
    elements.capacityWarning.classList.remove('capacity-full');
    elements.capacityWarningText.innerHTML = `<strong>Places limitées</strong> — Il ne reste que <strong>${stats.available_spots}</strong> place${stats.available_spots > 1 ? 's' : ''} disponible${stats.available_spots > 1 ? 's' : ''}.`;
  } else {
    elements.capacityWarning.classList.add('hidden');
  }
}

function disableForm() {
  elements.form.classList.add('disabled');
  elements.submitBtn.disabled = true;
  elements.submitBtn.textContent = 'Inscriptions closes';
  elements.addMemberBtn.disabled = true;

  // Disable all inputs
  elements.form.querySelectorAll('input, select, textarea').forEach(el => {
    el.disabled = true;
  });
}

function renderTeams(teams) {
  // Update badge with team count (excluding Organisation)
  const teamCount = teams.filter(t => !t.is_organisation).length;
  elements.teamsBadge.textContent = teamCount;

  if (teams.length === 0) {
    elements.teamsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#128101;</div>
        <p class="empty-state-text">Aucune équipe inscrite pour le moment.</p>
      </div>
    `;
    return;
  }

  elements.teamsList.innerHTML = teams.map(team => {
    const isOrg = team.is_organisation;
    const cardClasses = [
      'team-card',
      'clickable',
      team.is_full ? 'full' : '',
      isOrg ? 'organisation' : ''
    ].filter(Boolean).join(' ');

    const spotsClasses = [
      'team-spots',
      team.is_full ? 'full' : '',
      isOrg ? 'unlimited' : ''
    ].filter(Boolean).join(' ');

    let spotsText = '';
    if (isOrg) {
      spotsText = 'Illimité';
    } else if (team.is_full) {
      spotsText = 'Complet';
    } else {
      spotsText = `${team.available_slots} place${team.available_slots > 1 ? 's' : ''}`;
    }

    return `
      <div class="${cardClasses}" data-team-id="${team.id}">
        <h3 class="team-name">${escapeHtml(team.name)}</h3>
        ${team.description ? `<p class="team-desc">${escapeHtml(team.description)}</p>` : ''}
        <div class="team-meta">
          <span class="team-members">${team.member_count} membre${team.member_count > 1 ? 's' : ''}</span>
          <span class="${spotsClasses}">${spotsText}</span>
        </div>
        <div class="team-view-hint">Cliquez pour voir les membres</div>
      </div>
    `;
  }).join('');

  // Add click event listeners to team cards
  elements.teamsList.querySelectorAll('.team-card').forEach(card => {
    card.addEventListener('click', () => {
      const teamId = parseInt(card.dataset.teamId, 10);
      openTeamViewModal(teamId);
    });
  });
}

function renderTeamSelect(teams) {
  const availableTeams = teams.filter(t => !t.is_full && !t.is_organisation);
  elements.teamSelect.innerHTML = `
    <option value="">-- Choisir une équipe --</option>
    ${availableTeams.map(team => `
      <option value="${team.id}">
        ${escapeHtml(team.name)} (${team.available_slots} place${team.available_slots > 1 ? 's' : ''})
      </option>
    `).join('')}
  `;
}

function createMemberCard(index) {
  const { pizzas, bacLevels } = state.config;

  const card = document.createElement('div');
  card.className = 'member-card';
  card.dataset.index = index;

  card.innerHTML = `
    <div class="member-header">
      <span class="member-title">Membre ${index + 1}</span>
      ${index > 0 ? '<button type="button" class="remove-btn">Retirer</button>' : ''}
    </div>

    <div class="member-grid">
      <div class="form-group">
        <label>
          <span class="toggle-group">
            <span class="toggle">
              <input type="checkbox" name="members[${index}].isLeader">
              <span class="toggle-slider"></span>
            </span>
            Chef d'équipe
          </span>
        </label>
      </div>

      <div></div>

      <div class="form-group">
        <label>Prénom *</label>
        <input type="text" name="members[${index}].firstName" required maxlength="128">
      </div>

      <div class="form-group">
        <label>Nom *</label>
        <input type="text" name="members[${index}].lastName" required maxlength="128">
      </div>

      <div class="form-group">
        <label>Email *</label>
        <input type="email" name="members[${index}].email" required maxlength="256">
      </div>

      <div class="form-group">
        <label>Niveau d'études *</label>
        <select name="members[${index}].bacLevel" required>
          ${bacLevels.map(level => `
            <option value="${level.value}">${level.label}</option>
          `).join('')}
        </select>
      </div>

      <div class="form-group full-width">
        <label>Choix de pizza</label>
        <div class="pizza-grid">
          ${pizzas.map((pizza, i) => `
            <label class="pizza-option ${i === 0 ? 'selected' : ''}">
              <input type="radio" name="members[${index}].foodDiet" value="${pizza.id}" ${i === 0 ? 'checked' : ''}>
              <div class="pizza-info">
                <div class="pizza-name">${escapeHtml(pizza.name)}</div>
                ${pizza.description ? `<div class="pizza-desc">${escapeHtml(pizza.description)}</div>` : ''}
              </div>
            </label>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  // Event listeners
  const removeBtn = card.querySelector('.remove-btn');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => removeMember(index));
  }

  // Pizza selection highlighting
  card.querySelectorAll('.pizza-option input').forEach(input => {
    input.addEventListener('change', (e) => {
      card.querySelectorAll('.pizza-option').forEach(opt => opt.classList.remove('selected'));
      e.target.closest('.pizza-option').classList.add('selected');
    });
  });

  return card;
}

function addMember() {
  if (state.isAtCapacity) return;

  const maxSize = state.config.maxTeamSize;
  if (state.members.length >= maxSize) {
    showErrors([`Maximum ${maxSize} membres par équipe`]);
    return;
  }

  // Check available spots
  if (state.stats && state.members.length >= state.stats.available_spots) {
    showErrors([`Il ne reste que ${state.stats.available_spots} place(s) disponible(s)`]);
    return;
  }

  const index = state.members.length;
  const card = createMemberCard(index);
  elements.membersContainer.appendChild(card);
  state.members.push({ index });
  updateMemberCount();
}

function removeMember(index) {
  if (state.members.length <= 1) {
    showErrors(['Au moins un membre est requis']);
    return;
  }

  const card = elements.membersContainer.querySelector(`[data-index="${index}"]`);
  if (card) {
    card.style.animation = 'fadeIn 0.2s ease-out reverse';
    setTimeout(() => {
      card.remove();
      state.members = state.members.filter(m => m.index !== index);
      reindexMembers();
      updateMemberCount();
    }, 200);
  }
}

function reindexMembers() {
  const cards = elements.membersContainer.querySelectorAll('.member-card');
  state.members = [];

  cards.forEach((card, newIndex) => {
    card.dataset.index = newIndex;
    card.querySelector('.member-title').textContent = `Membre ${newIndex + 1}`;

    // Update all input names
    card.querySelectorAll('input, select').forEach(input => {
      if (input.name) {
        input.name = input.name.replace(/members\[\d+\]/, `members[${newIndex}]`);
      }
    });

    // Show/hide remove button
    const removeBtn = card.querySelector('.remove-btn');
    if (newIndex === 0 && removeBtn) {
      removeBtn.remove();
    } else if (newIndex > 0 && !removeBtn) {
      const header = card.querySelector('.member-header');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'remove-btn';
      btn.textContent = 'Retirer';
      btn.addEventListener('click', () => removeMember(newIndex));
      header.appendChild(btn);
    }

    state.members.push({ index: newIndex });
  });
}

function updateMemberCount() {
  elements.memberCount.textContent = `(${state.members.length})`;

  // Check capacity
  const maxSize = state.config.maxTeamSize;
  const maxBySpots = state.stats ? state.stats.available_spots : maxSize;
  elements.addMemberBtn.disabled = state.members.length >= Math.min(maxSize, maxBySpots) || state.isAtCapacity;
}

// Form Handling
function collectFormData() {
  const formData = new FormData(elements.form);
  const data = {
    createNewTeam: state.isNewTeam,
    members: []
  };

  if (state.isNewTeam) {
    data.teamName = formData.get('teamName');
    data.teamDescription = formData.get('teamDescription');
    data.teamPassword = formData.get('teamPassword');
  } else {
    data.teamId = parseInt(formData.get('teamId'), 10);
    data.teamPassword = formData.get('joinPassword');
  }

  // Collect members
  state.members.forEach((_, i) => {
    data.members.push({
      firstName: formData.get(`members[${i}].firstName`),
      lastName: formData.get(`members[${i}].lastName`),
      email: formData.get(`members[${i}].email`),
      bacLevel: parseInt(formData.get(`members[${i}].bacLevel`), 10),
      isLeader: formData.get(`members[${i}].isLeader`) === 'on',
      foodDiet: formData.get(`members[${i}].foodDiet`) || 'none'
    });
  });

  return data;
}

function validateForm() {
  const errors = [];
  const data = collectFormData();

  if (state.isNewTeam) {
    if (!data.teamName?.trim()) {
      errors.push("Le nom de l'équipe est requis");
    }
    if (!data.teamPassword?.trim()) {
      errors.push("Le mot de passe de l'équipe est requis");
    } else if (data.teamPassword.length < 4) {
      errors.push("Le mot de passe doit faire au moins 4 caractères");
    }

    const hasLeader = data.members.some(m => m.isLeader);
    if (!hasLeader) {
      errors.push("Une nouvelle équipe doit avoir au moins un chef d'équipe");
    }
  } else {
    if (!data.teamId) {
      errors.push("Veuillez sélectionner une équipe");
    }
    if (!data.teamPassword?.trim()) {
      errors.push("Le mot de passe de l'équipe est requis");
    }
  }

  // Validate each member
  data.members.forEach((member, i) => {
    if (!member.firstName?.trim()) errors.push(`Membre ${i + 1}: Prénom requis`);
    if (!member.lastName?.trim()) errors.push(`Membre ${i + 1}: Nom requis`);
    if (!member.email?.trim()) errors.push(`Membre ${i + 1}: Email requis`);
    else if (!isValidEmail(member.email)) errors.push(`Membre ${i + 1}: Email invalide`);
  });

  // Check duplicates
  const seen = new Set();
  data.members.forEach((m, i) => {
    const key = `${m.firstName?.toLowerCase()}|${m.lastName?.toLowerCase()}`;
    if (seen.has(key)) {
      errors.push(`Membre ${i + 1}: Nom en double`);
    }
    seen.add(key);
  });

  return errors;
}

async function handleSubmit(e) {
  e.preventDefault();

  if (state.isAtCapacity) {
    showErrors(['Les inscriptions sont closes']);
    return;
  }

  const errors = validateForm();
  if (errors.length > 0) {
    showErrors(errors);
    return;
  }

  hideErrors();
  setLoading(true);

  try {
    const data = collectFormData();
    const result = await submitRegistration(data);

    elements.successMessage.textContent = result.message;
    elements.successModal.classList.remove('hidden');

  } catch (err) {
    showErrors([err.message]);
  } finally {
    setLoading(false);
  }
}

// UI Helpers
function showErrors(errors) {
  elements.errorsDiv.innerHTML = `<ul>${errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`;
  elements.errorsDiv.classList.remove('hidden');
  elements.errorsDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hideErrors() {
  elements.errorsDiv.classList.add('hidden');
}

function setLoading(loading) {
  elements.submitBtn.disabled = loading;
  elements.form.classList.toggle('loading', loading);
  elements.submitBtn.textContent = loading ? 'Inscription en cours...' : "S'inscrire";
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Team View Modal Functions
function openTeamViewModal(teamId) {
  const team = state.teams.find(t => t.id === teamId);
  if (!team) return;

  state.selectedTeamId = teamId;
  elements.teamViewTitle.textContent = `Voir l'équipe: ${team.name}`;
  elements.teamViewPassword.value = '';
  elements.teamViewError.classList.add('hidden');
  elements.teamViewAuth.classList.remove('hidden');
  elements.teamViewContent.classList.add('hidden');
  elements.teamViewModal.classList.remove('hidden');
  elements.teamViewPassword.focus();
}

function closeTeamViewModal() {
  state.selectedTeamId = null;
  elements.teamViewModal.classList.add('hidden');
  elements.teamViewPassword.value = '';
  elements.teamViewError.classList.add('hidden');
}

async function handleTeamViewSubmit() {
  const password = elements.teamViewPassword.value.trim();
  if (!password) {
    elements.teamViewError.textContent = 'Veuillez entrer le mot de passe';
    elements.teamViewError.classList.remove('hidden');
    return;
  }

  elements.teamViewSubmit.disabled = true;
  elements.teamViewSubmit.textContent = 'Chargement...';

  try {
    const result = await viewTeamMembers(state.selectedTeamId, password);
    showTeamMembers(result.team);
  } catch (err) {
    elements.teamViewError.textContent = err.message;
    elements.teamViewError.classList.remove('hidden');
  } finally {
    elements.teamViewSubmit.disabled = false;
    elements.teamViewSubmit.textContent = 'Voir les membres';
  }
}

function showTeamMembers(team) {
  elements.teamDetailName.textContent = team.name;
  elements.teamDetailDesc.textContent = team.description || '';

  const bacLabels = {
    0: 'Non bachelier',
    1: 'BAC+1',
    2: 'BAC+2',
    3: 'BAC+3 (Licence)',
    4: 'BAC+4',
    5: 'BAC+5 (Master)',
    6: 'BAC+6',
    7: 'BAC+7',
    8: 'BAC+8 (Doctorat)'
  };

  elements.teamMembersList.innerHTML = team.members.map(member => `
    <div class="member-item ${member.isLeader ? 'leader' : ''}">
      <div class="member-info">
        <span class="member-name">${escapeHtml(member.firstName)} ${escapeHtml(member.lastName)}</span>
        ${member.isLeader ? '<span class="badge-leader">Chef</span>' : ''}
      </div>
      <div class="member-details">
        <span class="member-email">${escapeHtml(member.email)}</span>
        <span class="member-bac">${bacLabels[member.bacLevel] || 'N/A'}</span>
        ${member.foodDiet ? `<span class="member-food">${escapeHtml(member.foodDiet)}</span>` : ''}
      </div>
    </div>
  `).join('');

  elements.teamViewAuth.classList.add('hidden');
  elements.teamViewContent.classList.remove('hidden');
}

// Event Listeners
function setupEventListeners() {
  // Team mode toggle
  document.querySelectorAll('input[name="team-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.isNewTeam = e.target.value === 'new';
      elements.newTeamFields.classList.toggle('hidden', !state.isNewTeam);
      elements.joinTeamFields.classList.toggle('hidden', state.isNewTeam);
    });
  });

  // Add member button
  elements.addMemberBtn.addEventListener('click', addMember);

  // Form submission
  elements.form.addEventListener('submit', handleSubmit);

  // Team view modal
  elements.teamViewSubmit.addEventListener('click', handleTeamViewSubmit);
  elements.teamViewCancel.addEventListener('click', closeTeamViewModal);
  elements.teamViewClose.addEventListener('click', closeTeamViewModal);

  // Allow Enter key to submit password
  elements.teamViewPassword.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTeamViewSubmit();
    }
  });

  // Close modal on backdrop click
  elements.teamViewModal.addEventListener('click', (e) => {
    if (e.target === elements.teamViewModal) {
      closeTeamViewModal();
    }
  });

  // Close modal on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!elements.teamViewModal.classList.contains('hidden')) {
        closeTeamViewModal();
      }
      if (!elements.successModal.classList.contains('hidden')) {
        location.reload();
      }
    }
  });
}

// Initialize
async function init() {
  try {
    // Load data in parallel
    const [config, teams, stats] = await Promise.all([
      loadConfig(),
      loadTeams(),
      loadStats()
    ]);

    renderStats(stats);
    renderTeams(teams);
    renderTeamSelect(teams);

    // Only add initial member if not at capacity
    if (!state.isAtCapacity) {
      addMember();
    }

    setupEventListeners();

  } catch (err) {
    console.error('Initialization error:', err);
    showErrors(['Erreur de chargement. Veuillez rafraîchir la page.']);
  }
}

// Start app
init();
