/**
 * Registration page modal handling
 * Team view modal functionality
 */
/* eslint-env browser */

import { escapeHtml } from '../admin/utils.js';
import { state, setSelectedTeam } from './state.js';
import { elements } from './elements.js';
import { viewTeamMembers } from './api.js';

/**
 * Open team view modal
 * @param {number} teamId - Team ID
 */
export function openTeamViewModal(teamId) {
  const team = state.teams.find(t => t.id === teamId);
  if (!team) return;

  setSelectedTeam(teamId);
  elements.teamViewTitle.textContent = `Voir l'équipe: ${team.name}`;
  elements.teamViewPassword.value = '';
  elements.teamViewError.classList.add('hidden');
  elements.teamViewAuth.classList.remove('hidden');
  elements.teamViewContent.classList.add('hidden');
  elements.teamViewModal.classList.remove('hidden');
  elements.teamViewPassword.focus();
}

/**
 * Close team view modal
 */
export function closeTeamViewModal() {
  setSelectedTeam(null);
  elements.teamViewModal.classList.add('hidden');
  elements.teamViewPassword.value = '';
  elements.teamViewError.classList.add('hidden');
}

/**
 * Handle team view password submission
 */
export async function handleTeamViewSubmit() {
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
  } catch (error) {
    elements.teamViewError.textContent = error.message;
    elements.teamViewError.classList.remove('hidden');
  } finally {
    elements.teamViewSubmit.disabled = false;
    elements.teamViewSubmit.textContent = 'Voir les membres';
  }
}

/**
 * Show team members in modal
 * @param {object} team - Team object with members
 */
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

/**
 * Setup modal event listeners
 */
export function setupModalListeners() {
  // Team view modal
  elements.teamViewSubmit?.addEventListener('click', handleTeamViewSubmit);
  elements.teamViewCancel?.addEventListener('click', closeTeamViewModal);
  elements.teamViewClose?.addEventListener('click', closeTeamViewModal);

  // Allow Enter key to submit password
  elements.teamViewPassword?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTeamViewSubmit();
    }
  });

  // Close modal on backdrop click
  elements.teamViewModal?.addEventListener('click', (e) => {
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
