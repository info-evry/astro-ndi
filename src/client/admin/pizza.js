/**
 * Pizza module - Pizza distribution management
 */
/* eslint-env browser */

import { $, escapeHtml, formatTeamWithRoom } from './utils.js';
import { toastSuccess, toastError } from './toast.js';
import {
  pizzaData,
  setPizzaData,
  pizzaFilter,
  setPizzaFilter,
  settingsState,
  pizzasConfig
} from './state.js';

// Local state
let pizzaSearchTerm = '';
let pizzaTypeFilter = '';
let pizzaSortKey = 'name';
let pizzaSortDir = 'asc';
let pizzaTypes = {};

/**
 * Load pizza data
 * @param {Function} api - API function
 */
export async function loadPizzaData(api) {
  try {
    const data = await api('/admin/pizza', { method: 'GET' });
    setPizzaData(data.members || []);
    renderPizzaStats(data.stats);
    renderPizza();
    updatePizzaBadge(data.stats.pending);
  } catch (error) {
    console.error('Error loading pizza data:', error);
    toastError('Erreur lors du chargement des pizzas');
  }
}

/**
 * Render pizza statistics
 * @param {Object} stats - Stats from API
 */
export function renderPizzaStats(stats) {
  const grid = $('pizza-stats-grid');
  if (!grid) return;

  const percentage = stats.total > 0 ? Math.round((stats.received / stats.total) * 100) : 0;

  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${stats.received}</div>
      <div class="stat-label">Servis</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${stats.pending}</div>
      <div class="stat-label">En attente</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${stats.total}</div>
      <div class="stat-label">Total</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${percentage}%</div>
      <div class="stat-label">Progression</div>
    </div>
  `;

  // By type stats
  const typeGrid = $('pizza-by-type-grid');
  if (typeGrid && stats.by_type && stats.by_type.length > 0) {
    typeGrid.innerHTML = stats.by_type.map(t => {
      const toServe = t.total - t.received;
      return `
        <div class="stat-card stat-card-sm">
          <div class="stat-value">${t.total}</div>
          <div class="stat-label">${pizzaTypes[t.food_diet] || t.food_diet}</div>
          <div class="stat-sublabel">${t.received} servis${toServe > 0 ? `, ${toServe} restants` : ''}</div>
        </div>
      `;
    }).join('');
  }

  // Present members stats
  const presentGrid = $('pizza-present-stats-grid');
  if (presentGrid && stats.present) {
    const present = stats.present;
    const presentPercentage = present.total > 0 ? Math.round((present.received / present.total) * 100) : 0;

    presentGrid.innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${present.received}</div>
        <div class="stat-label">Servis</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${present.pending}</div>
        <div class="stat-label">À servir</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${present.total}</div>
        <div class="stat-label">Présents</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${presentPercentage}%</div>
        <div class="stat-label">Progression</div>
      </div>
    `;
  }

  // Present by type
  const presentTypeGrid = $('pizza-present-by-type-grid');
  if (presentTypeGrid && stats.present?.by_type && stats.present.by_type.length > 0) {
    presentTypeGrid.innerHTML = stats.present.by_type.map(t => {
      const toServe = t.total - t.received;
      return `
        <div class="stat-card stat-card-sm">
          <div class="stat-value">${t.total}</div>
          <div class="stat-label">${pizzaTypes[t.food_diet] || t.food_diet}</div>
          <div class="stat-sublabel">${toServe > 0 ? `${toServe} à servir` : 'Tous servis'}</div>
        </div>
      `;
    }).join('');
  }
}

/**
 * Render pizza table
 */
export function renderPizza() {
  const tbody = $('pizza-tbody');
  if (!tbody) return;

  let filtered = [...pizzaData];

  // Apply search filter
  if (pizzaSearchTerm) {
    const term = pizzaSearchTerm.toLowerCase();
    filtered = filtered.filter(m =>
      m.first_name.toLowerCase().includes(term) ||
      m.last_name.toLowerCase().includes(term) ||
      m.email.toLowerCase().includes(term) ||
      (m.team_name || '').toLowerCase().includes(term)
    );
  }

  // Apply status filter
  if (pizzaFilter === 'pending') {
    filtered = filtered.filter(m => m.pizza_received === 0 || m.pizza_received === null);
  } else if (pizzaFilter === 'received') {
    filtered = filtered.filter(m => m.pizza_received === 1);
  } else if (pizzaFilter === 'checkedin') {
    filtered = filtered.filter(m => m.checked_in === 1);
  }

  // Apply pizza type filter
  if (pizzaTypeFilter) {
    filtered = filtered.filter(m => m.food_diet === pizzaTypeFilter);
  }

  // Apply sorting
  filtered.sort((a, b) => {
    let valA, valB;
    switch (pizzaSortKey) {
      case 'name': {
        valA = `${a.first_name} ${a.last_name}`.toLowerCase();
        valB = `${b.first_name} ${b.last_name}`.toLowerCase();
        break;
      }
      case 'team': {
        valA = (a.team_name || '').toLowerCase();
        valB = (b.team_name || '').toLowerCase();
        break;
      }
      case 'pizza': {
        valA = a.food_diet || '';
        valB = b.food_diet || '';
        break;
      }
      case 'checkin': {
        valA = a.checked_in || 0;
        valB = b.checked_in || 0;
        break;
      }
      case 'status': {
        valA = a.pizza_received || 0;
        valB = b.pizza_received || 0;
        break;
      }
      case 'time': {
        valA = a.pizza_received_at || '';
        valB = b.pizza_received_at || '';
        break;
      }
      default: {
        valA = a.first_name.toLowerCase();
        valB = b.first_name.toLowerCase();
      }
    }

    if (valA < valB) return pizzaSortDir === 'asc' ? -1 : 1;
    if (valA > valB) return pizzaSortDir === 'asc' ? 1 : -1;
    return 0;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Aucun participant trouvé</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(m => {
    const isPizzaReceived = m.pizza_received === 1;
    const isCheckedIn = m.checked_in === 1;
    const pizzaTime = m.pizza_received_at ? new Date(m.pizza_received_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '-';
    const teamInfo = formatTeamWithRoom(m.team_name, m.team_room, 40);

    return `
      <tr class="member-row ${isPizzaReceived ? 'checked-in' : ''}" data-member-id="${m.id}">
        <td><strong>${escapeHtml(m.first_name)} ${escapeHtml(m.last_name)}</strong></td>
        <td class="team-col" title="${escapeHtml(teamInfo.full)}">${escapeHtml(teamInfo.truncated)}</td>
        <td>${pizzaTypes[m.food_diet] || escapeHtml(m.food_diet) || '-'}</td>
        <td class="status-col">
          ${isCheckedIn
            ? '<span class="badge badge-success">Présent</span>'
            : '<span class="badge badge-muted">Absent</span>'}
        </td>
        <td class="status-col">
          ${isPizzaReceived
            ? '<span class="badge badge-success">􀁣 Servi</span>'
            : '<span class="badge badge-muted">􀁡 En attente</span>'}
        </td>
        <td class="time-col">${pizzaTime}</td>
        <td class="actions-col">
          <div class="action-buttons">
            ${isPizzaReceived
              ? `<button type="button" class="icon-btn danger" onclick="handleRevokePizza(${m.id})" title="Annuler" aria-label="Annuler la distribution">􀁡</button>`
              : `<button type="button" class="icon-btn success" onclick="handleGivePizza(${m.id})" title="Donner pizza" aria-label="Donner pizza">􀁣</button>`}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Update pizza badge
 * @param {number} pending - Pending count
 */
export function updatePizzaBadge(pending) {
  const badge = $('pizza-badge');
  if (badge) badge.textContent = pending || 0;
}

/**
 * Handle give pizza
 * @param {number} memberId - Member ID
 * @param {Function} api - API function
 * @param {Function} loadData - Reload callback
 */
export async function handleGivePizza(memberId, api, loadData) {
  try {
    await api(`/admin/pizza/give/${memberId}`, { method: 'POST' });
    await loadData();
    toastSuccess('Pizza distribuée');
  } catch (error) {
    console.error('Error giving pizza:', error);
    toastError('Erreur lors de la distribution');
  }
}

/**
 * Handle revoke pizza
 * @param {number} memberId - Member ID
 * @param {Function} api - API function
 * @param {Function} loadData - Reload callback
 */
export async function handleRevokePizza(memberId, api, loadData) {
  try {
    await api(`/admin/pizza/revoke/${memberId}`, { method: 'POST' });
    await loadData();
    toastSuccess('Distribution annulée');
  } catch (error) {
    console.error('Error revoking pizza:', error);
    toastError('Erreur lors de l\'annulation');
  }
}

/**
 * Initialize pizza module
 * @param {Function} api - API function
 */
export function initPizza(api) {
  // Load pizza types from settings
  if (settingsState.pizzas) {
    for (const p of settingsState.pizzas) { pizzaTypes[p.id] = p.name; }
  }

  if (pizzasConfig && pizzasConfig.length > 0) {
    for (const p of pizzasConfig) { pizzaTypes[p.id] = p.name; }
  }

  // Populate type filter
  const typeFilter = $('pizza-type-filter');
  if (typeFilter) {
    const pizzaList = settingsState.pizzas || pizzasConfig || [];
    typeFilter.innerHTML = '<option value="">Toutes les pizzas</option>' +
      pizzaList.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');
  }

  // Search
  const searchInput = $('pizza-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      pizzaSearchTerm = e.target.value;
      renderPizza();
    });
  }

  // Filter pills
  const filterRadios = document.querySelectorAll('input[name="pizza-filter"]');
  for (const radio of filterRadios) {
    radio.addEventListener('change', (e) => {
      setPizzaFilter(e.target.value);
      updatePizzaFilterPills();
      renderPizza();
    });
  }

  // Type filter
  const typeFilterSelect = $('pizza-type-filter');
  if (typeFilterSelect) {
    typeFilterSelect.addEventListener('change', (e) => {
      pizzaTypeFilter = e.target.value;
      renderPizza();
    });
  }

  // Sortable headers
  const sortableHeaders = document.querySelectorAll('#pizza-table .sortable-header');
  for (const header of sortableHeaders) {
    header.addEventListener('click', () => {
      const sortKey = header.dataset.sort;
      if (pizzaSortKey === sortKey) {
        pizzaSortDir = pizzaSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        pizzaSortKey = sortKey;
        pizzaSortDir = 'asc';
      }
      updatePizzaSortIndicators();
      renderPizza();
    });
  }

  // Refresh button
  const refreshBtn = $('refresh-pizza-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadPizzaData(api));
  }

  updatePizzaFilterPills();
}

/**
 * Update filter pills
 */
function updatePizzaFilterPills() {
  for (const pill of document.querySelectorAll('[id^="pizza-filter-"]')) {
    const radio = pill.querySelector('input[type="radio"]');
    if (radio?.checked) {
      pill.classList.add('active');
    } else {
      pill.classList.remove('active');
    }
  }
}

/**
 * Update sort indicators
 */
function updatePizzaSortIndicators() {
  const headers = document.querySelectorAll('#pizza-table .sortable-header');
  for (const header of headers) {
    const sortKey = header.dataset.sort;
    if (sortKey === pizzaSortKey) {
      header.setAttribute('data-sort-dir', pizzaSortDir);
      header.querySelector('.sort-indicator').textContent = pizzaSortDir === 'asc' ? '@sfs:chevron.up@' : '@sfs:chevron.down@';
    } else {
      header.removeAttribute('data-sort-dir');
      header.querySelector('.sort-indicator').textContent = '@sfs:arrow.up.arrow.down@';
    }
  }
}
