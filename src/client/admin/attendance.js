/**
 * Attendance module - Check-in/check-out management
 */
/* eslint-env browser */

import { $, escapeHtml, formatTeamWithRoom, formatCurrency } from './utils.js';
import { toastSuccess, toastError } from './toast.js';
import { openModal, closeModal } from './modals.js';
import {
  attendanceData,
  setAttendanceData,
  attendanceFilter,
  setAttendanceFilter,
  attendanceSearchTerm,
  setAttendanceSearchTerm
} from './state.js';

// Pricing settings (loaded from settings)
let pricingSettings = {
  priceAssoMember: 500,
  priceNonMember: 800,
  priceLate: 1000,
  lateCutoffTime: '19:00'
};

// Sort state
let attendanceSortKey = 'name';
let attendanceSortDir = 'asc';

// Current check-in member
let checkInMemberId = null;

/**
 * Set pricing settings
 * @param {Object} settings - Pricing settings
 */
export function setPricingSettings(settings) {
  pricingSettings = { ...pricingSettings, ...settings };
}

/**
 * Load attendance data
 * @param {Function} api - API function
 */
export async function loadAttendanceData(api) {
  try {
    const data = await api('/admin/attendance', { method: 'GET' });
    setAttendanceData(data.members || []);
    renderAttendanceStats(data.stats);
    renderAttendance();
    updateAttendanceBadge(data.stats.checked_in);
  } catch (error) {
    console.error('Error loading attendance:', error);
    toastError('Erreur lors du chargement des présences');
  }
}

/**
 * Render attendance statistics
 * @param {Object} stats - Stats from API
 */
export function renderAttendanceStats(stats) {
  const grid = $('attendance-stats-grid');
  if (!grid) return;

  const payment = stats.payment || {};

  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${stats.checked_in}</div>
      <div class="stat-label">Présents</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${stats.not_checked_in}</div>
      <div class="stat-label">Absents</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${stats.total}</div>
      <div class="stat-label">Total inscrits</div>
    </div>
    <div class="stat-card stat-card-highlight">
      <div class="stat-value">${formatCurrency(payment.total_revenue || 0)}</div>
      <div class="stat-label">Recettes</div>
    </div>
  `;

  // Remove any existing payment breakdown first (prevents duplication on tab switch)
  const existingBreakdown = grid.nextElementSibling;
  if (existingBreakdown && existingBreakdown.classList.contains('stats-grid')) {
    existingBreakdown.remove();
  }

  // Add payment breakdown if there are any payments
  if (payment.total_paid > 0) {
    const breakdownHtml = `
      <div class="stats-grid" style="margin-top: var(--space-4);">
        <div class="stat-card stat-card-sm">
          <div class="stat-value">${payment.asso_members || 0}</div>
          <div class="stat-label">Membres asso</div>
          <div class="stat-sublabel">${formatCurrency(payment.asso_revenue || 0)}</div>
        </div>
        <div class="stat-card stat-card-sm">
          <div class="stat-value">${payment.non_members || 0}</div>
          <div class="stat-label">Non-membres</div>
          <div class="stat-sublabel">${formatCurrency(payment.non_member_revenue || 0)}</div>
        </div>
        <div class="stat-card stat-card-sm">
          <div class="stat-value">${payment.late_arrivals || 0}</div>
          <div class="stat-label">Retardataires</div>
          <div class="stat-sublabel">${formatCurrency(payment.late_revenue || 0)}</div>
        </div>
      </div>
    `;
    grid.insertAdjacentHTML('afterend', breakdownHtml);
  }
}

/**
 * Render attendance table
 */
export function renderAttendance() {
  const tbody = $('attendance-tbody');
  if (!tbody) return;

  let filtered = [...attendanceData];

  // Apply search filter
  if (attendanceSearchTerm) {
    const term = attendanceSearchTerm.toLowerCase();
    filtered = filtered.filter(m =>
      m.first_name.toLowerCase().includes(term) ||
      m.last_name.toLowerCase().includes(term) ||
      m.email.toLowerCase().includes(term) ||
      m.team_name.toLowerCase().includes(term)
    );
  }

  // Apply status filter
  if (attendanceFilter === 'present') {
    filtered = filtered.filter(m => m.checked_in === 1);
  } else if (attendanceFilter === 'absent') {
    filtered = filtered.filter(m => m.checked_in === 0 || m.checked_in === null);
  }

  // Apply sorting
  filtered.sort((a, b) => {
    let valA, valB;
    switch (attendanceSortKey) {
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
      case 'team': {
        valA = a.team_name.toLowerCase();
        valB = b.team_name.toLowerCase();
        break;
      }
      case 'status': {
        valA = a.checked_in || 0;
        valB = b.checked_in || 0;
        break;
      }
      case 'time': {
        valA = a.checked_in_at || '';
        valB = b.checked_in_at || '';
        break;
      }
      case 'payment': {
        valA = a.payment_tier || '';
        valB = b.payment_tier || '';
        break;
      }
      default: {
        valA = a.first_name.toLowerCase();
        valB = b.first_name.toLowerCase();
      }
    }

    if (valA < valB) return attendanceSortDir === 'asc' ? -1 : 1;
    if (valA > valB) return attendanceSortDir === 'asc' ? 1 : -1;
    return 0;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Aucun participant trouvé</td></tr>`;
    return;
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity -- Render logic with multiple badge variants
  tbody.innerHTML = filtered.map(m => {
    const isCheckedIn = m.checked_in === 1;
    const checkedInTime = m.checked_in_at ? new Date(m.checked_in_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '-';
    const teamInfo = formatTeamWithRoom(m.team_name, m.team_room, 40);

    // Payment badge
    let paymentBadge = '<span class="badge badge-muted">-</span>';

    if (m.payment_status === 'paid') {
      const tierLabels = { 'tier1': 'Anticipé', 'tier2': 'Standard' };
      const tierLabel = tierLabels[m.registration_tier] || 'En ligne';
      const amount = m.payment_amount ? formatCurrency(m.payment_amount) : '';
      paymentBadge = `<span class="badge badge-success"><span class="sf-symbol">@sfs:creditcard@</span> ${tierLabel}</span>`;
      if (amount) {
        paymentBadge += ` <span class="text-muted text-sm">${amount}</span>`;
      }
    } else if (m.payment_status === 'delayed') {
      paymentBadge = '<span class="badge badge-warning"><span class="sf-symbol">@sfs:calendar@</span> À payer</span>';
    } else if (m.payment_status === 'pending') {
      paymentBadge = '<span class="badge badge-info"><span class="sf-symbol">@sfs:hourglass@</span> En cours</span>';
    } else if (m.payment_tier) {
      const tierLabels = {
        'asso_member': '<span class="sf-symbol">@sfs:checkmark@</span> Membre asso',
        'non_member': '<span class="sf-symbol">@sfs:checkmark@</span> Non-membre',
        'late': '<span class="sf-symbol">@sfs:clock@</span> Retardataire'
      };
      const tierLabel = tierLabels[m.payment_tier] || m.payment_tier;
      const amount = m.payment_amount ? formatCurrency(m.payment_amount) : '';
      paymentBadge = `<span class="badge badge-success">${tierLabel}</span>`;
      if (amount) {
        paymentBadge += ` <span class="text-muted text-sm">${amount}</span>`;
      }
    }

    return `
      <tr class="member-row ${isCheckedIn ? 'checked-in' : ''}" data-member-id="${m.id}">
        <td><strong>${escapeHtml(m.first_name)} ${escapeHtml(m.last_name)}</strong></td>
        <td><a href="mailto:${escapeHtml(m.email)}">${escapeHtml(m.email)}</a></td>
        <td class="team-col" title="${escapeHtml(teamInfo.full)}">${escapeHtml(teamInfo.truncated)}</td>
        <td class="status-col">
          ${isCheckedIn
            ? '<span class="badge badge-success">􀁣 Présent</span>'
            : '<span class="badge badge-muted">􀁡 Absent</span>'}
        </td>
        <td class="time-col">${checkedInTime}</td>
        <td>${paymentBadge}</td>
        <td class="actions-col">
          <div class="action-buttons">
            ${isCheckedIn
              ? `<button type="button" class="icon-btn danger" onclick="handleCheckOut(${m.id})" title="Annuler la présence" aria-label="Annuler la présence">􀁡</button>`
              : `<button type="button" class="icon-btn success" onclick="handleCheckIn(${m.id})" title="Valider la présence" aria-label="Valider la présence">􀁣</button>`}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Update attendance badge
 * @param {number} count - Count to display
 */
export function updateAttendanceBadge(count) {
  const badge = $('attendance-badge');
  if (badge) badge.textContent = count || 0;
}

/**
 * Handle check-in button click
 * @param {number} memberId - Member ID
 * @param {Function} api - API function
 * @param {Function} loadData - Reload callback
 */
export async function handleCheckIn(memberId, api, loadData) {
  const member = attendanceData.find(m => m.id === memberId);
  if (!member) return;

  // If member already paid online, skip the payment modal
  if (member.payment_status === 'paid') {
    try {
      await api(`/admin/attendance/check-in/${memberId}`, {
        method: 'POST',
        body: JSON.stringify({
          paymentTier: member.registration_tier === 'tier1' ? 'online_tier1' : 'online_tier2',
          paymentAmount: member.payment_amount,
          skipPayment: true
        })
      });
      await loadData();
      toastSuccess(`${member.first_name} ${member.last_name} enregistré(e) (déjà payé en ligne)`);
    } catch (error) {
      console.error('Error checking in:', error);
      toastError(error.message || 'Erreur lors de l\'enregistrement');
    }
    return;
  }

  checkInMemberId = memberId;
  $('checkin-member-id').value = memberId;
  $('checkin-member-name').textContent = `${member.first_name} ${member.last_name}`;

  // Check if after cutoff time
  const now = new Date();
  const [hours, minutes] = pricingSettings.lateCutoffTime.split(':').map(Number);
  const cutoff = new Date();
  cutoff.setHours(hours, minutes, 0, 0);
  const isAfterCutoff = now >= cutoff;

  const lateOption = $('option-late');
  const nonMemberOption = $('option-non-member');

  if (isAfterCutoff) {
    lateOption.classList.remove('hidden');
    nonMemberOption.classList.add('hidden');
  } else {
    lateOption.classList.add('hidden');
    nonMemberOption.classList.remove('hidden');
  }

  // Update prices display
  $('price-asso').textContent = formatCurrency(pricingSettings.priceAssoMember);
  $('price-non-member').textContent = formatCurrency(pricingSettings.priceNonMember);
  $('price-late').textContent = formatCurrency(pricingSettings.priceLate);

  if (member.payment_status === 'delayed') {
    $('checkin-member-name').textContent = `${member.first_name} ${member.last_name} (paiement sur place)`;
  }

  document.querySelector('input[name="payment-tier"][value="asso_member"]').checked = true;
  openModal('checkin-modal');
}

/**
 * Confirm check-in with payment
 * @param {Function} api - API function
 * @param {Function} loadData - Reload callback
 */
export async function confirmCheckIn(api, loadData) {
  const tier = document.querySelector('input[name="payment-tier"]:checked').value;
  let amount;

  switch (tier) {
    case 'asso_member': {
      amount = pricingSettings.priceAssoMember;
      break;
    }
    case 'non_member': {
      amount = pricingSettings.priceNonMember;
      break;
    }
    case 'late': {
      amount = pricingSettings.priceLate;
      break;
    }
    case 'organisation': {
      amount = 0;
      break;
    }
  }

  try {
    await api(`/admin/attendance/check-in/${checkInMemberId}`, {
      method: 'POST',
      body: JSON.stringify({
        paymentTier: tier,
        paymentAmount: amount
      })
    });
    closeModal('checkin-modal');
    await loadData();
    toastSuccess(`Présence validée - ${formatCurrency(amount)}`);
  } catch (error) {
    console.error('Error checking in:', error);
    toastError('Erreur lors de la validation');
  }
}

/**
 * Handle check-out
 * @param {number} memberId - Member ID
 * @param {Function} api - API function
 * @param {Function} loadData - Reload callback
 */
export async function handleCheckOut(memberId, api, loadData) {
  try {
    await api(`/admin/attendance/check-out/${memberId}`, { method: 'POST' });
    await loadData();
    toastSuccess('Présence annulée');
  } catch (error) {
    console.error('Error checking out:', error);
    toastError('Erreur lors de l\'annulation');
  }
}

/**
 * Initialize attendance module
 * @param {Function} api - API function
 */
export function initAttendance(api) {
  const searchInput = $('attendance-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      setAttendanceSearchTerm(e.target.value);
      renderAttendance();
    });
  }

  // Filter pills
  const filterRadios = document.querySelectorAll('input[name="attendance-filter"]');
  for (const radio of filterRadios) {
    radio.addEventListener('change', (e) => {
      setAttendanceFilter(e.target.value);
      updateFilterPills();
      renderAttendance();
    });
  }

  // Sortable headers
  const sortableHeaders = document.querySelectorAll('#attendance-table .sortable-header');
  for (const header of sortableHeaders) {
    header.addEventListener('click', () => {
      const sortKey = header.dataset.sort;
      if (attendanceSortKey === sortKey) {
        attendanceSortDir = attendanceSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        attendanceSortKey = sortKey;
        attendanceSortDir = 'asc';
      }
      updateSortIndicators();
      renderAttendance();
    });
  }

  const refreshBtn = $('refresh-attendance-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadAttendanceData(api));
  }

  updateFilterPills();
}

/**
 * Update filter pills active state
 */
function updateFilterPills() {
  const pills = document.querySelectorAll('.filter-pill');
  for (const pill of pills) {
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
function updateSortIndicators() {
  const headers = document.querySelectorAll('#attendance-table .sortable-header');
  for (const header of headers) {
    const sortKey = header.dataset.sort;
    if (sortKey === attendanceSortKey) {
      header.setAttribute('data-sort-dir', attendanceSortDir);
      header.querySelector('.sort-indicator').textContent = attendanceSortDir === 'asc' ? '@sfs:chevron.up@' : '@sfs:chevron.down@';
    } else {
      header.removeAttribute('data-sort-dir');
      header.querySelector('.sort-indicator').textContent = '@sfs:arrow.up.arrow.down@';
    }
  }
}
