/**
 * Rooms module - Room assignment management
 */
/* eslint-env browser */

import { $, escapeHtml, truncateText } from './utils.js';
import { toastSuccess, toastError } from './toast.js';
import {
  roomsData,
  setRoomsData,
  roomFilter,
  setRoomFilter,
  settingsState,
  pizzasConfig
} from './state.js';

// Local state
let roomsSearchTerm = '';
let roomsSortKey = 'name';
let roomsSortDir = 'asc';
let availableRooms = [];
let pizzaTypes = {};

/**
 * Load rooms data
 * @param {Function} api - API function
 */
export async function loadRoomsData(api) {
  try {
    const data = await api('/admin/rooms', { method: 'GET' });
    setRoomsData(data.teams || []);
    availableRooms = data.rooms || [];
    renderRoomsStats(data.stats);
    renderPizzaByRoom(data.pizza_by_room || []);
    renderRooms();
    updateRoomsBadge(data.stats?.unassigned_teams || 0);
  } catch (err) {
    console.error('Error loading rooms data:', err);
    toastError('Erreur lors du chargement des salles');
  }
}

/**
 * Render pizza by room breakdown
 * @param {Array} pizzaByRoom - Pizza breakdown by room
 */
export function renderPizzaByRoom(pizzaByRoom) {
  // Load pizza types
  if (settingsState.pizzas) {
    settingsState.pizzas.forEach(p => { pizzaTypes[p.id] = p.name; });
  }
  if (pizzasConfig && pizzasConfig.length > 0) {
    pizzasConfig.forEach(p => { pizzaTypes[p.id] = p.name; });
  }

  const container = $('room-pizza-container');
  if (!container) return;

  if (!pizzaByRoom || pizzaByRoom.length === 0) {
    container.innerHTML = '<p class="text-muted">Aucune salle avec des équipes assignées</p>';
    return;
  }

  container.innerHTML = pizzaByRoom.map(room => `
    <div class="room-pizza-block" style="margin-bottom: var(--space-4); padding: var(--space-4); background: var(--bg-secondary); border-radius: var(--radius-md);">
      <h4 style="margin-bottom: var(--space-3); display: flex; align-items: center; gap: var(--space-2);">
        <span>${escapeHtml(room.room)}</span>
        <span class="badge badge-muted">${room.totals.total} inscrits</span>
        <span class="badge badge-success">${room.totals.present} présents</span>
      </h4>
      <div class="stats-grid">
        ${room.pizzas.map(p => `
          <div class="stat-card stat-card-sm">
            <div class="stat-value">${p.total}</div>
            <div class="stat-label">${pizzaTypes[p.food_diet] || p.food_diet}</div>
            <div class="stat-sublabel">${p.present} présents</div>
          </div>
        `).join('')}
        <div class="stat-card stat-card-sm" style="background: var(--bg-tertiary);">
          <div class="stat-value">${room.totals.total}</div>
          <div class="stat-label">Total</div>
          <div class="stat-sublabel">${room.totals.present} présents</div>
        </div>
      </div>
    </div>
  `).join('');
}

/**
 * Render rooms statistics
 * @param {Object} stats - Stats from API
 */
export function renderRoomsStats(stats) {
  const grid = $('room-stats-grid');
  if (!grid) return;

  const assigned = stats?.assigned_teams || 0;
  const unassigned = stats?.unassigned_teams || 0;
  const total = stats?.total_teams || 0;
  const percent = total > 0 ? Math.round((assigned / total) * 100) : 0;

  grid.innerHTML = `
    <div class="stat-card">
      <span class="stat-value">${assigned}</span>
      <span class="stat-label">Équipes assignées</span>
    </div>
    <div class="stat-card">
      <span class="stat-value">${unassigned}</span>
      <span class="stat-label">Non assignées</span>
    </div>
    <div class="stat-card">
      <span class="stat-value">${total}</span>
      <span class="stat-label">Total équipes</span>
    </div>
    <div class="stat-card">
      <span class="stat-value">${percent}%</span>
      <span class="stat-label">Progression</span>
    </div>
  `;

  // By room stats
  const byRoomGrid = $('room-by-room-grid');
  if (byRoomGrid && stats?.by_room?.length > 0) {
    byRoomGrid.innerHTML = stats.by_room.map(r => `
      <div class="stat-card stat-card-sm">
        <span class="stat-value">${r.team_count}</span>
        <span class="stat-label">${escapeHtml(r.room)}</span>
        <span class="stat-sublabel">${r.member_count} membres</span>
      </div>
    `).join('');
  } else if (byRoomGrid) {
    byRoomGrid.innerHTML = '';
  }
}

/**
 * Render rooms table
 */
export function renderRooms() {
  const tbody = $('rooms-tbody');
  if (!tbody) return;

  let filtered = [...roomsData];

  // Search filter
  if (roomsSearchTerm) {
    filtered = filtered.filter(t =>
      t.name.toLowerCase().includes(roomsSearchTerm) ||
      (t.room || '').toLowerCase().includes(roomsSearchTerm)
    );
  }

  // Status filter
  if (roomFilter === 'assigned') {
    filtered = filtered.filter(t => t.room && t.room !== '');
  } else if (roomFilter === 'unassigned') {
    filtered = filtered.filter(t => !t.room || t.room === '');
  }

  // Sort
  filtered.sort((a, b) => {
    let valA, valB;
    switch (roomsSortKey) {
      case 'name':
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
        break;
      case 'members':
        valA = a.member_count || 0;
        valB = b.member_count || 0;
        break;
      case 'room':
        valA = (a.room || '').toLowerCase();
        valB = (b.room || '').toLowerCase();
        break;
      default:
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
    }

    if (valA < valB) return roomsSortDir === 'asc' ? -1 : 1;
    if (valA > valB) return roomsSortDir === 'asc' ? 1 : -1;
    return 0;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Aucune équipe trouvée</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(t => {
    const hasRoom = t.room && t.room !== '';
    const roomOptions = availableRooms
      .filter(r => r !== t.room)
      .map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`)
      .join('');

    return `
      <tr class="member-row ${hasRoom ? 'checked-in' : ''}" data-team-id="${t.id}">
        <td class="team-col" title="${escapeHtml(t.name)}">${escapeHtml(truncateText(t.name, 40))}</td>
        <td>${t.member_count || 0}</td>
        <td>
          <div class="room-input-wrapper">
            <input type="text"
                   class="room-input"
                   value="${escapeHtml(t.room || '')}"
                   placeholder="Salle..."
                   list="room-datalist-${t.id}"
                   data-team-id="${t.id}"
                   onchange="handleRoomChange(${t.id}, this.value)"
                   style="width: 120px; padding: 4px 8px; font-size: var(--text-sm); border: 1px solid var(--border-default); border-radius: var(--radius);">
            <datalist id="room-datalist-${t.id}">
              ${roomOptions}
            </datalist>
          </div>
        </td>
        <td class="actions-col">
          <div class="action-buttons">
            ${hasRoom
              ? `<button type="button" class="icon-btn danger" onclick="handleClearRoom(${t.id})" title="Retirer de la salle" aria-label="Retirer de la salle"><span class="sf-symbol">@sfs:xmark@</span></button>`
              : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Handle room change
 * @param {number} teamId - Team ID
 * @param {string} room - Room name
 * @param {Function} api - API function
 * @param {Function} loadData - Reload callback
 */
export async function handleRoomChange(teamId, room, api, loadData) {
  try {
    await api(`/admin/rooms/${teamId}`, {
      method: 'PUT',
      body: JSON.stringify({ room: room || null })
    });
    await loadData();
    toastSuccess(room ? `Équipe assignée à ${room}` : 'Salle retirée');
  } catch (err) {
    console.error('Error setting room:', err);
    toastError('Erreur lors de l\'assignation');
  }
}

/**
 * Handle clear room
 * @param {number} teamId - Team ID
 * @param {Function} api - API function
 * @param {Function} loadData - Reload callback
 */
export async function handleClearRoom(teamId, api, loadData) {
  try {
    await api(`/admin/rooms/${teamId}`, {
      method: 'PUT',
      body: JSON.stringify({ room: null })
    });
    await loadData();
    toastSuccess('Salle retirée');
  } catch (err) {
    console.error('Error clearing room:', err);
    toastError('Erreur lors de la suppression');
  }
}

/**
 * Update rooms badge
 * @param {number} unassigned - Unassigned count
 */
export function updateRoomsBadge(unassigned) {
  const badge = $('rooms-badge');
  if (badge) badge.textContent = unassigned || 0;
}

/**
 * Initialize rooms module
 * @param {Function} api - API function
 */
export function initRooms(api) {
  // Search
  const searchInput = $('rooms-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      roomsSearchTerm = e.target.value.toLowerCase();
      renderRooms();
    });
  }

  // Filter pills
  document.querySelectorAll('input[name="rooms-filter"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      setRoomFilter(e.target.value);
      updateRoomsFilterPills();
      renderRooms();
    });
  });

  // Sortable headers
  const sortableHeaders = document.querySelectorAll('#rooms-table .sortable-header');
  sortableHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const sortKey = header.dataset.sort;
      if (roomsSortKey === sortKey) {
        roomsSortDir = roomsSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        roomsSortKey = sortKey;
        roomsSortDir = 'asc';
      }
      updateRoomsSortIndicators();
      renderRooms();
    });
  });

  // Refresh button
  const refreshBtn = $('refresh-rooms-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadRoomsData(api));
  }

  updateRoomsFilterPills();
}

/**
 * Update filter pills
 */
function updateRoomsFilterPills() {
  document.querySelectorAll('[id^="rooms-filter-"]').forEach(pill => {
    const radio = pill.querySelector('input[type="radio"]');
    if (radio?.checked) {
      pill.classList.add('active');
    } else {
      pill.classList.remove('active');
    }
  });
}

/**
 * Update sort indicators
 */
function updateRoomsSortIndicators() {
  const headers = document.querySelectorAll('#rooms-table .sortable-header');
  headers.forEach(header => {
    const sortKey = header.dataset.sort;
    if (sortKey === roomsSortKey) {
      header.setAttribute('data-sort-dir', roomsSortDir);
      header.querySelector('.sort-indicator').textContent = roomsSortDir === 'asc' ? '@sfs:chevron.up@' : '@sfs:chevron.down@';
    } else {
      header.removeAttribute('data-sort-dir');
      header.querySelector('.sort-indicator').textContent = '@sfs:arrow.up.arrow.down@';
    }
  });
}
