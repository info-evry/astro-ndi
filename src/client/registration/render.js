/**
 * Registration page render functions
 * Handles all DOM rendering for stats, teams, and form initialization
 */
/* eslint-env browser */

import { escapeHtml } from '../admin/utils.js';
import { state, setAtCapacity } from './state.js';
import { elements } from './elements.js';

/**
 * Render stats in hero KPIs
 * @param {object} stats - Stats object
 */
export function renderStats(stats) {
  const percentUsed = (stats.total_participants / stats.max_participants) * 100;
  const isNearCapacity = percentUsed >= 80;
  const isAtCapacity = stats.available_spots <= 0;

  setAtCapacity(isAtCapacity);

  // Update hero KPIs
  elements.kpiTeams.textContent = stats.total_teams;
  // Show x/max when open, just x when closed
  elements.kpiParticipants.textContent = isAtCapacity
    ? stats.total_participants
    : `${stats.total_participants}/${stats.max_participants}`;
  elements.kpiSpots.textContent = stats.available_spots;

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

/**
 * Disable form when at capacity
 */
function disableForm() {
  // Hide the entire inscription section when closed
  elements.inscriptionSection.classList.add('hidden');
  // Also hide the hero register button
  elements.heroRegisterBtn.classList.add('hidden');
}

/**
 * Render teams grid
 * @param {Array} teams - Teams array
 * @param {function} onTeamClick - Callback when team card is clicked
 */
export function renderTeams(teams, onTeamClick) {
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
  for (const card of elements.teamsList.querySelectorAll('.team-card')) {
    card.addEventListener('click', () => {
      const teamId = Number.parseInt(card.dataset.teamId, 10);
      onTeamClick(teamId);
    });
  }
}

/**
 * Render team select dropdown
 * @param {Array} teams - Teams array
 */
export function renderTeamSelect(teams) {
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

/**
 * Initialize member form with options from config
 */
export function initMemberForm() {
  const { pizzas, bacLevels } = state.config;

  // Populate BAC level dropdown
  elements.memberBacLevel.innerHTML = bacLevels.map(level =>
    `<option value="${level.value}">${escapeHtml(level.label)}</option>`
  ).join('');

  // Populate pizza options
  elements.pizzaOptions.innerHTML = pizzas.map((pizza, i) => `
    <label class="pizza-option ${i === 0 ? 'selected' : ''}">
      <input type="radio" name="foodDiet" value="${pizza.id}" ${i === 0 ? 'checked' : ''}>
      <div class="pizza-info">
        <div class="pizza-name">${escapeHtml(pizza.name)}</div>
        ${pizza.description ? `<div class="pizza-desc">${escapeHtml(pizza.description)}</div>` : ''}
      </div>
    </label>
  `).join('');

  // Add pizza selection highlighting
  for (const input of elements.pizzaOptions.querySelectorAll('.pizza-option input')) {
    input.addEventListener('change', (e) => {
      for (const opt of elements.pizzaOptions.querySelectorAll('.pizza-option')) opt.classList.remove('selected');
      e.target.closest('.pizza-option').classList.add('selected');
    });
  }
}

/**
 * Render pricing information
 * @param {object|null} pricing - Pricing object
 */
export function renderPricing(pricing) {
  if (!pricing) {
    elements.paymentSection.classList.add('hidden');
    return;
  }

  // Update price display
  elements.currentPrice.textContent = pricing.currentPriceFormatted;
  elements.currentTierLabel.textContent = pricing.currentTier === 'tier1'
    ? 'Inscription anticipée'
    : 'Inscription standard';

  // Update deadline note
  if (pricing.daysUntilDeadline !== null && pricing.currentTier === 'tier1') {
    elements.pricingDeadlineNote.textContent =
      `Prix valable jusqu'au ${new Date(pricing.registrationDeadline).toLocaleDateString('fr-FR')}. Après cette date : ${pricing.tier2.priceFormatted}`;
  } else if (pricing.daysUntilDeadline !== null && pricing.daysUntilDeadline <= 0) {
    elements.pricingDeadlineNote.textContent = 'Date limite de pré-inscription dépassée.';
  } else {
    elements.pricingDeadlineNote.textContent = '';
  }

  // Show/hide payment options based on enabled state
  if (pricing.enabled) {
    elements.paymentDisabled.classList.add('hidden');
    for (const el of document.querySelectorAll('.payment-method')) el.classList.remove('hidden');
  } else {
    elements.paymentDisabled.classList.remove('hidden');
    for (const el of document.querySelectorAll('.payment-method')) el.classList.add('hidden');
  }
}

/**
 * Update leader toggle visibility based on team mode
 */
export function updateLeaderToggle() {
  // When creating a new team, user is automatically leader (hide toggle)
  // When joining a team, show toggle so user can optionally become a leader
  if (state.isNewTeam) {
    elements.leaderToggle.classList.add('hidden');
    elements.memberIsLeader.checked = true; // Auto-check for new teams
  } else {
    elements.leaderToggle.classList.remove('hidden');
    elements.memberIsLeader.checked = false; // Uncheck by default when joining
  }
}
