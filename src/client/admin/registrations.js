/**
 * Registrations module - Team and member management
 */
/* eslint-env browser */

import { $, escapeHtml, formatTeamWithRoom } from './utils.js';
import { toastSuccess, toastError } from './toast.js';
import { openModal, closeModal } from './modals.js';
import {
  teamsData,
  setTeamsData,
  selectedMembers,
  pizzasConfig,
  allParticipantsData,
  setAllParticipantsData,
  allParticipantsSearchTerm,
  setAllParticipantsSearchTerm,
  allParticipantsSortKey,
  setAllParticipantsSortKey,
  allParticipantsSortDir,
  setAllParticipantsSortDir
} from './state.js';

// Element ID constants
const EL_MEMBER_FORM_TEAM = 'member-form-team';
const EL_MEMBER_FORM_FOOD = 'member-form-food';
const EL_CONFIRM_MODAL = 'confirm-modal';
const MSG_EXPORT_ERROR = 'Erreur export: ';

// Team sort state per team
const teamSortState = {};

/**
 * Render registration statistics
 * @param {Object} stats - Stats object from API
 * @param {HTMLElement} statsGrid - Container element
 * @param {HTMLElement} foodStats - Food stats container
 */
export function renderStats(stats, statsGrid, foodStats) {
  if (statsGrid) {
    statsGrid.innerHTML = `
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

  if (foodStats) {
    foodStats.innerHTML = !stats.food_preferences || stats.food_preferences.length === 0 ? '<p>Aucune préférence enregistrée</p>' : stats.food_preferences
        .map(item => `
          <div class="food-item">
            <span class="count">${item.count}</span> ${escapeHtml(item.food_diet)}
          </div>
        `)
        .join('');
  }
}

/**
 * Render teams list
 * @param {Array} teams - Teams array from API
 * @param {HTMLElement} container - Container element
 */
export function renderTeams(teams, container) {
  setTeamsData(teams);
  updateTeamSelect();

  if (!teams || teams.length === 0) {
    container.innerHTML = '<p>Aucune équipe inscrite</p>';
    return;
  }

  container.innerHTML = teams.map(team => `
    <div class="team-block" data-team-id="${team.id}">
      <div class="team-header" onclick="toggleTeam(${team.id})">
        <h3>${escapeHtml(team.name)}${team.room ? ` <span class="badge badge-muted">${escapeHtml(team.room)}</span>` : ''}</h3>
        <div class="team-info">
          <span>${team.members?.length || 0} membre(s)</span>
        </div>
      </div>
      <div class="team-body">
        ${team.description ? `<p><em>${escapeHtml(team.description)}</em></p>` : ''}
        <div class="team-actions action-buttons">
          <button type="button" class="icon-btn" onclick="editTeam(${team.id})" title="Modifier" aria-label="Modifier l'équipe">􀈊</button>
          <button type="button" class="action-btn" onclick="exportTeam(${team.id}, '${escapeHtml(team.name)}')">Exporter CSV</button>
          <button type="button" class="action-btn primary" onclick="exportTeamOfficial(${team.id}, '${escapeHtml(team.name)}')">Export Officiel</button>
          ${team.name === 'Organisation' ? '' : `<button type="button" class="icon-btn danger" onclick="confirmDeleteTeam(${team.id}, '${escapeHtml(team.name)}')" title="Supprimer" aria-label="Supprimer l'équipe">􀈑</button>`}
        </div>
        ${renderMembersTable(team.members, team.id)}
      </div>
    </div>
  `).join('');
}

/**
 * Render members table for a team
 * @param {Array} members - Members array
 * @param {number} teamId - Team ID
 * @returns {string} HTML string
 */
export function renderMembersTable(members, teamId) {
  if (!members || members.length === 0) {
    return '<p>Aucun membre</p>';
  }

  const sortedMembers = [...members].sort((a, b) => {
    const nameA = `${a.first_name} ${a.last_name}`.toLowerCase();
    const nameB = `${b.first_name} ${b.last_name}`.toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return `
    <div class="table-container">
    <table class="members-table" data-team-id="${teamId}">
      <thead>
        <tr>
          <th class="checkbox-col">
            <label class="select-all-label">
              <input type="checkbox" onchange="toggleSelectAll(${teamId}, this.checked)">
            </label>
          </th>
          <th class="sortable-header" data-sort="name" onclick="sortTeamMembers(${teamId}, 'name', this)">Nom <span class="sort-indicator sf-symbol">@sfs:arrow.up.arrow.down@</span></th>
          <th class="sortable-header" data-sort="email" onclick="sortTeamMembers(${teamId}, 'email', this)">Email <span class="sort-indicator sf-symbol">@sfs:arrow.up.arrow.down@</span></th>
          <th class="sortable-header" data-sort="bac" onclick="sortTeamMembers(${teamId}, 'bac', this)">Niveau <span class="sort-indicator sf-symbol">@sfs:arrow.up.arrow.down@</span></th>
          <th>Pizza</th>
          <th>Rôle</th>
          <th class="actions-col">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${sortedMembers.map(m => `
          <tr class="member-row" data-member-id="${m.id}">
            <td class="checkbox-col">
              <input type="checkbox" onchange="toggleMemberSelect(${m.id}, this.checked)" ${selectedMembers.has(m.id) ? 'checked' : ''}>
            </td>
            <td>${escapeHtml(m.first_name)} ${escapeHtml(m.last_name)}</td>
            <td><a href="mailto:${escapeHtml(m.email)}">${escapeHtml(m.email)}</a></td>
            <td><span class="badge badge-bac">BAC+${m.bac_level}</span></td>
            <td>${escapeHtml(m.food_diet) || '-'}</td>
            <td>${m.is_leader ? '<span class="badge badge-leader">􀋀 Chef</span>' : ''}</td>
            <td class="actions-col">
              <div class="action-buttons">
                <button type="button" class="icon-btn" onclick="editMember(${m.id}, ${teamId})" title="Modifier" aria-label="Modifier le membre">􀈊</button>
                <button type="button" class="icon-btn danger" onclick="confirmDeleteMember(${m.id}, '${escapeHtml(m.first_name)} ${escapeHtml(m.last_name)}')" title="Supprimer" aria-label="Supprimer le membre">􀈑</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    </div>
  `;
}

/**
 * Update team select dropdown
 */
export function updateTeamSelect() {
  const select = $(EL_MEMBER_FORM_TEAM);
  if (select) {
    select.innerHTML = teamsData.map(t =>
      `<option value="${t.id}">${escapeHtml(t.name)}</option>`
    ).join('');
  }
}

/**
 * Update pizza select dropdown
 */
export function updatePizzaSelect() {
  const select = $(EL_MEMBER_FORM_FOOD);
  if (!select) return;

  select.innerHTML = '<option value="">Aucune</option>' +
    pizzasConfig.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');
}

/**
 * Toggle team expand/collapse
 * @param {number} teamId - Team ID
 */
export function toggleTeam(teamId) {
  const block = document.querySelector(`[data-team-id="${teamId}"]`);
  if (block) block.classList.toggle('open');
}

/**
 * Toggle select all members in a team
 * @param {number} teamId - Team ID
 * @param {boolean} checked - Checked state
 * @param {Function} updateDeleteButton - Callback to update delete button
 */
export function toggleSelectAll(teamId, checked, updateDeleteButton) {
  const block = document.querySelector(`[data-team-id="${teamId}"]`);
  for (const cb of block.querySelectorAll('.member-row input[type="checkbox"]')) {
    cb.checked = checked;
    const memberId = Number.parseInt(cb.closest('.member-row').dataset.memberId);
    if (checked) {
      selectedMembers.add(memberId);
    } else {
      selectedMembers.delete(memberId);
    }
  }
  updateDeleteButton();
}

/**
 * Toggle member selection
 * @param {number} memberId - Member ID
 * @param {boolean} checked - Checked state
 * @param {Function} updateDeleteButton - Callback to update delete button
 */
export function toggleMemberSelect(memberId, checked, updateDeleteButton) {
  if (checked) {
    selectedMembers.add(memberId);
  } else {
    selectedMembers.delete(memberId);
  }
  updateDeleteButton();
}

/**
 * Sort team members
 * @param {number} teamId - Team ID
 * @param {string} sortKey - Sort key
 * @param {HTMLElement} headerElement - Header element clicked
 */
export function sortTeamMembers(teamId, sortKey, headerElement) {
  const team = teamsData.find(t => t.id === teamId);
  if (!team || !team.members) return;

  if (!teamSortState[teamId]) {
    teamSortState[teamId] = { key: sortKey, dir: 'asc' };
  } else if (teamSortState[teamId].key === sortKey) {
    teamSortState[teamId].dir = teamSortState[teamId].dir === 'asc' ? 'desc' : 'asc';
  } else {
    teamSortState[teamId] = { key: sortKey, dir: 'asc' };
  }

  const { key, dir } = teamSortState[teamId];

  team.members.sort((a, b) => {
    let valA, valB;
    switch (key) {
      case 'name': {
        valA = `${a.first_name} ${a.last_name}`.toLowerCase();
        valB = `${b.first_name} ${b.last_name}`.toLowerCase();
        break;
      }
      case 'email': {
        valA = a.email.toLowerCase();
        valB = b.email.toLowerCase();
        break;
      }
      case 'bac': {
        valA = a.bac_level || 0;
        valB = b.bac_level || 0;
        break;
      }
      default: {
        valA = a.first_name.toLowerCase();
        valB = b.first_name.toLowerCase();
      }
    }

    if (valA < valB) return dir === 'asc' ? -1 : 1;
    if (valA > valB) return dir === 'asc' ? 1 : -1;
    return 0;
  });

  // Update sort indicators
  const table = headerElement.closest('table');
  for (const h of table.querySelectorAll('.sortable-header')) {
    if (h.dataset.sort === key) {
      h.setAttribute('data-sort-dir', dir);
      h.querySelector('.sort-indicator').textContent = dir === 'asc' ? '@sfs:chevron.up@' : '@sfs:chevron.down@';
    } else {
      h.removeAttribute('data-sort-dir');
      h.querySelector('.sort-indicator').textContent = '@sfs:arrow.up.arrow.down@';
    }
  }

  // Re-render the table body
  const tbody = table.querySelector('tbody');
  tbody.innerHTML = team.members.map(m => `
    <tr class="member-row" data-member-id="${m.id}">
      <td class="checkbox-col">
        <input type="checkbox" onchange="toggleMemberSelect(${m.id}, this.checked)" ${selectedMembers.has(m.id) ? 'checked' : ''}>
      </td>
      <td>${escapeHtml(m.first_name)} ${escapeHtml(m.last_name)}</td>
      <td><a href="mailto:${escapeHtml(m.email)}">${escapeHtml(m.email)}</a></td>
      <td><span class="badge badge-bac">BAC+${m.bac_level}</span></td>
      <td>${escapeHtml(m.food_diet) || '-'}</td>
      <td>${m.is_leader ? '<span class="badge badge-leader">􀋀 Chef</span>' : ''}</td>
      <td class="actions-col">
        <div class="action-buttons">
          <button type="button" class="icon-btn" onclick="editMember(${m.id}, ${teamId})" title="Modifier" aria-label="Modifier le membre">􀈊</button>
          <button type="button" class="icon-btn danger" onclick="confirmDeleteMember(${m.id}, '${escapeHtml(m.first_name)} ${escapeHtml(m.last_name)}')" title="Supprimer" aria-label="Supprimer le membre">􀈑</button>
        </div>
      </td>
    </tr>
  `).join('');
}

/**
 * Open edit team modal
 * @param {number} teamId - Team ID
 */
export function editTeam(teamId) {
  const team = teamsData.find(t => t.id === teamId);
  if (!team) return;

  $('team-modal-title').textContent = 'Modifier l\'équipe';
  $('team-form-id').value = teamId;
  $('team-form-name').value = team.name;
  $('team-form-desc').value = team.description || '';
  $('team-form-password').value = '';
  openModal('team-modal');
}

/**
 * Open add team modal
 */
export function openAddTeamModal() {
  $('team-modal-title').textContent = 'Nouvelle équipe';
  $('team-form-id').value = '';
  $('team-form-name').value = '';
  $('team-form-desc').value = '';
  $('team-form-password').value = '';
  openModal('team-modal');
}

/**
 * Open edit member modal
 * @param {number} memberId - Member ID
 * @param {number} teamId - Team ID
 */
export function editMember(memberId, teamId) {
  const team = teamsData.find(t => t.id === teamId);
  const member = team?.members?.find(m => m.id === memberId);
  if (!member) return;

  $('member-modal-title').textContent = 'Modifier le membre';
  $('member-form-id').value = memberId;
  $(EL_MEMBER_FORM_TEAM).value = teamId;
  $('member-form-firstname').value = member.first_name;
  $('member-form-lastname').value = member.last_name;
  $('member-form-email').value = member.email;
  $('member-form-bac').value = member.bac_level;
  $(EL_MEMBER_FORM_FOOD).value = member.food_diet || '';
  $('member-form-leader').checked = !!member.is_leader;
  openModal('member-modal');
}

/**
 * Open add member modal
 */
export function openAddMemberModal() {
  $('member-modal-title').textContent = 'Nouveau membre';
  $('member-form-id').value = '';
  $(EL_MEMBER_FORM_TEAM).value = teamsData[0]?.id || '';
  $('member-form-firstname').value = '';
  $('member-form-lastname').value = '';
  $('member-form-email').value = '';
  $('member-form-bac').value = '0';
  $(EL_MEMBER_FORM_FOOD).value = '';
  $('member-form-leader').checked = false;
  openModal('member-modal');
}

/**
 * Confirm delete team
 * @param {number} teamId - Team ID
 * @param {string} teamName - Team name
 * @param {Function} onConfirm - Callback on confirm
 */
export function confirmDeleteTeam(teamId, teamName, onConfirm) {
  $('confirm-message').textContent =
    `Êtes-vous sûr de vouloir supprimer l'équipe "${teamName}" et tous ses membres ?`;
  $('confirm-delete-btn').onclick = () => onConfirm(teamId);
  openModal(EL_CONFIRM_MODAL);
}

/**
 * Confirm delete member
 * @param {number} memberId - Member ID
 * @param {string} memberName - Member name
 * @param {Function} onConfirm - Callback on confirm
 */
export function confirmDeleteMember(memberId, memberName, onConfirm) {
  $('confirm-message').textContent =
    `Êtes-vous sûr de vouloir supprimer ${memberName} ?`;
  $('confirm-delete-btn').onclick = () => onConfirm(memberId);
  openModal(EL_CONFIRM_MODAL);
}

/**
 * Handle team form submission
 * @param {Event} e - Form submit event
 * @param {Function} api - API function
 * @param {Function} loadData - Callback to reload data
 */
export async function handleTeamSubmit(e, api, loadData) {
  e.preventDefault();
  const id = $('team-form-id').value;
  const name = $('team-form-name').value;
  const description = $('team-form-desc').value;
  const password = $('team-form-password').value;

  try {
    if (id) {
      await api(`/admin/teams/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, description, password })
      });
      toastSuccess('Équipe mise à jour');
    } else {
      await api('/admin/teams', {
        method: 'POST',
        body: JSON.stringify({ name, description, password })
      });
      toastSuccess('Équipe créée');
    }
    closeModal('team-modal');
    loadData();
  } catch (error) {
    toastError('Erreur: ' + error.message);
  }
}

/**
 * Handle member form submission
 * @param {Event} e - Form submit event
 * @param {Function} api - API function
 * @param {Function} loadData - Callback to reload data
 */
export async function handleMemberSubmit(e, api, loadData) {
  e.preventDefault();
  const id = $('member-form-id').value;
  const teamId = Number.parseInt($(EL_MEMBER_FORM_TEAM).value);
  const firstName = $('member-form-firstname').value;
  const lastName = $('member-form-lastname').value;
  const email = $('member-form-email').value;
  const bacLevel = Number.parseInt($('member-form-bac').value);
  const foodDiet = $(EL_MEMBER_FORM_FOOD).value;
  const isLeader = $('member-form-leader').checked;

  try {
    if (id) {
      await api(`/admin/members/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ teamId, firstName, lastName, email, bacLevel, foodDiet, isLeader })
      });
      toastSuccess('Membre mis à jour');
    } else {
      await api('/admin/members', {
        method: 'POST',
        body: JSON.stringify({ teamId, firstName, lastName, email, bacLevel, foodDiet, isLeader })
      });
      toastSuccess('Membre ajouté');
    }
    closeModal('member-modal');
    loadData();
  } catch (error) {
    toastError('Erreur: ' + error.message);
  }
}

/**
 * Delete team
 * @param {number} teamId - Team ID
 * @param {Function} api - API function
 * @param {Function} loadData - Callback to reload data
 */
export async function deleteTeam(teamId, api, loadData) {
  try {
    await api(`/admin/teams/${teamId}`, { method: 'DELETE' });
    toastSuccess('Équipe supprimée');
    closeModal(EL_CONFIRM_MODAL);
    loadData();
  } catch (error) {
    toastError('Erreur: ' + error.message);
  }
}

/**
 * Delete member
 * @param {number} memberId - Member ID
 * @param {Function} api - API function
 * @param {Function} loadData - Callback to reload data
 * @param {Function} updateDeleteButton - Callback to update delete button
 */
export async function deleteMember(memberId, api, loadData, updateDeleteButton) {
  try {
    await api(`/admin/members/${memberId}`, { method: 'DELETE' });
    toastSuccess('Membre supprimé');
    closeModal(EL_CONFIRM_MODAL);
    selectedMembers.delete(memberId);
    updateDeleteButton();
    loadData();
  } catch (error) {
    toastError('Erreur: ' + error.message);
  }
}

/**
 * Delete selected members
 * @param {Function} api - API function
 * @param {Function} loadData - Callback to reload data
 * @param {Function} updateDeleteButton - Callback to update delete button
 */
export async function deleteSelectedMembers(api, loadData, updateDeleteButton) {
  if (selectedMembers.size === 0) return;

  $('confirm-message').textContent =
    `Êtes-vous sûr de vouloir supprimer ${selectedMembers.size} membre(s) ?`;
  $('confirm-delete-btn').onclick = async () => {
    try {
      await api('/admin/members/delete-batch', {
        method: 'POST',
        body: JSON.stringify({ memberIds: [...selectedMembers] })
      });
      toastSuccess(`${selectedMembers.size} membre(s) supprimé(s)`);
      closeModal(EL_CONFIRM_MODAL);
      selectedMembers.clear();
      updateDeleteButton();
      loadData();
    } catch (error) {
      toastError('Erreur: ' + error.message);
    }
  };
  openModal(EL_CONFIRM_MODAL);
}

/**
 * Select all participants across all teams
 * @param {Function} updateDeleteButton - Callback to update delete button
 * @param {HTMLElement} selectAllBtn - Select all button
 */
export function selectAllParticipants(updateDeleteButton, selectAllBtn) {
  const allCheckboxes = document.querySelectorAll('.member-row input[type="checkbox"]');
  const allSelected = selectedMembers.size === allCheckboxes.length && allCheckboxes.length > 0;

  for (const cb of allCheckboxes) {
    const memberId = Number.parseInt(cb.closest('.member-row').dataset.memberId);
    if (allSelected) {
      cb.checked = false;
      selectedMembers.delete(memberId);
    } else {
      cb.checked = true;
      selectedMembers.add(memberId);
    }
  }

  for (const cb of document.querySelectorAll('.team-block input[type="checkbox"]')) {
    if (!cb.closest('.member-row')) {
      cb.checked = !allSelected;
    }
  }

  updateDeleteButton();
  selectAllBtn.textContent = allSelected ? 'Tout sélectionner' : 'Tout désélectionner';
}

// ============================================================
// ALL PARTICIPANTS LIST
// ============================================================

/**
 * Render all participants list
 */
export function renderAllParticipants() {
  const tbody = $('all-participants-tbody');
  if (!tbody) return;

  // Build flat list from teamsData
  const participantsData = [];
  for (const team of teamsData) {
    if (team.members) {
      for (const member of team.members) {
        participantsData.push({
          ...member,
          team_name: team.name
        });
      }
    }
  }
  setAllParticipantsData(participantsData);

  let filtered = [...allParticipantsData];

  // Apply search filter
  if (allParticipantsSearchTerm) {
    const term = allParticipantsSearchTerm.toLowerCase();
    filtered = filtered.filter(m =>
      m.first_name.toLowerCase().includes(term) ||
      m.last_name.toLowerCase().includes(term) ||
      m.email.toLowerCase().includes(term) ||
      m.team_name.toLowerCase().includes(term)
    );
  }

  // Apply sorting
  filtered.sort((a, b) => {
    let valA, valB;
    switch (allParticipantsSortKey) {
      case 'email': {
        valA = a.email.toLowerCase();
        valB = b.email.toLowerCase();
        break;
      }
      case 'team': {
        valA = a.team_name.toLowerCase();
        valB = b.team_name.toLowerCase();
        break;
      }
      case 'pizza': {
        valA = (a.food_diet || '').toLowerCase();
        valB = (b.food_diet || '').toLowerCase();
        break;
      }
      case 'bac': {
        valA = a.bac_level || 0;
        valB = b.bac_level || 0;
        break;
      }
      case 'manager': {
        valA = a.is_leader ? 1 : 0;
        valB = b.is_leader ? 1 : 0;
        break;
      }
      default: {
        // 'name' or any other value defaults to sorting by full name
        valA = `${a.first_name} ${a.last_name}`.toLowerCase();
        valB = `${b.first_name} ${b.last_name}`.toLowerCase();
      }
    }

    if (valA < valB) return allParticipantsSortDir === 'asc' ? -1 : 1;
    if (valA > valB) return allParticipantsSortDir === 'asc' ? 1 : -1;
    return 0;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Aucun participant trouvé</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(m => {
    const teamInfo = formatTeamWithRoom(m.team_name, m.team_room, 40);
    return `
    <tr class="member-row" data-member-id="${m.id}">
      <td><strong>${escapeHtml(m.first_name)} ${escapeHtml(m.last_name)}</strong></td>
      <td><a href="mailto:${escapeHtml(m.email)}">${escapeHtml(m.email)}</a></td>
      <td class="team-col" title="${escapeHtml(teamInfo.full)}">${escapeHtml(teamInfo.truncated)}</td>
      <td>${escapeHtml(m.food_diet) || '-'}</td>
      <td><span class="badge badge-bac">BAC+${m.bac_level || '?'}</span></td>
      <td>${m.is_leader ? '<span class="badge badge-leader">􀋀 Chef</span>' : '<span class="badge badge-muted">Membre</span>'}</td>
    </tr>
  `;}).join('');
}

/**
 * Sort all participants
 * @param {string} key - Sort key
 */
export function sortAllParticipants(key) {
  if (allParticipantsSortKey === key) {
    setAllParticipantsSortDir(allParticipantsSortDir === 'asc' ? 'desc' : 'asc');
  } else {
    setAllParticipantsSortKey(key);
    setAllParticipantsSortDir('asc');
  }

  // Update sort indicators
  for (const h of document.querySelectorAll('#all-participants-table .sortable-header')) {
    const indicator = h.querySelector('.sort-indicator');
    if (h.dataset.sort === allParticipantsSortKey) {
      indicator.textContent = allParticipantsSortDir === 'asc' ? '@sfs:chevron.up@' : '@sfs:chevron.down@';
    } else {
      indicator.textContent = '@sfs:arrow.up.arrow.down@';
    }
  }

  renderAllParticipants();
}

/**
 * Initialize all participants search
 */
export function initAllParticipants() {
  const searchInput = $('all-participants-search');
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      setAllParticipantsSearchTerm(e.target.value);
      renderAllParticipants();
    });
  }
}

// ============================================================
// TEAMS SEARCH
// ============================================================

let teamsSearchTerm = '';

/**
 * Initialize teams search
 */
export function initTeamsSearch() {
  const searchInput = $('teams-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      teamsSearchTerm = e.target.value.toLowerCase();
      filterTeams();
    });
  }
}

/**
 * Filter teams based on search
 */
export function filterTeams() {
  const container = $('teams-container');
  if (!container) return;

  const teamBlocks = container.querySelectorAll('.team-block');

  for (const block of teamBlocks) {
    const teamName = block.querySelector('.team-header h3')?.textContent.toLowerCase() || '';
    const memberNames = [...block.querySelectorAll('.member-row td:nth-child(2)')].map(td => td.textContent.toLowerCase());
    const memberEmails = [...block.querySelectorAll('.member-row td:nth-child(3)')].map(td => td.textContent.toLowerCase());

    const matchesTeam = teamName.includes(teamsSearchTerm);
    const matchesMember = memberNames.some(name => name.includes(teamsSearchTerm)) ||
                          memberEmails.some(email => email.includes(teamsSearchTerm));

    if (teamsSearchTerm === '' || matchesTeam || matchesMember) {
      block.style.display = '';
      if (matchesMember && teamsSearchTerm !== '') {
        block.classList.add('open');
      }
    } else {
      block.style.display = 'none';
    }
  }
}

// ============================================================
// EXPORT FUNCTIONS
// ============================================================

/**
 * Export team CSV
 * @param {number} teamId - Team ID
 * @param {string} teamName - Team name
 * @param {Function} api - API function
 */
export async function exportTeam(teamId, teamName, api) {
  try {
    const response = await api(`/admin/export/${teamId}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `participants_${teamName.replaceAll(/[^a-z0-9]/gi, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    toastError(MSG_EXPORT_ERROR + error.message);
  }
}

/**
 * Export team official CSV
 * @param {number} teamId - Team ID
 * @param {string} teamName - Team name
 * @param {Function} api - API function
 */
export async function exportTeamOfficial(teamId, teamName, api) {
  try {
    const response = await api(`/admin/export-official/${teamId}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `participants_officiel_${teamName.replaceAll(/[^a-z0-9]/gi, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toastSuccess('Export officiel téléchargé');
  } catch (error) {
    toastError(MSG_EXPORT_ERROR + error.message);
  }
}

/**
 * Export all participants CSV
 * @param {Function} api - API function
 */
export async function handleExportAll(api) {
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
  } catch (error) {
    toastError(MSG_EXPORT_ERROR + error.message);
  }
}

/**
 * Export official participants CSV
 * @param {Function} api - API function
 */
export async function handleExportOfficial(api) {
  try {
    const response = await api('/admin/export-official');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'participants_officiel.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toastSuccess('Export officiel téléchargé');
  } catch (error) {
    toastError(MSG_EXPORT_ERROR + error.message);
  }
}
