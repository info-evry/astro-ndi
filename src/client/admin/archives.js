/**
 * Archives module - Archive management and GDPR compliance
 */
/* eslint-env browser */

import { $, escapeHtml } from './utils.js';
import { toastSuccess, toastError } from './toast.js';
import {
  archivesData,
  setArchivesData,
  selectedArchive,
  setSelectedArchive,
  teamsData
} from './state.js';

/**
 * Load archives list
 * @param {Function} api - API function
 */
export async function loadArchives(api) {
  try {
    const response = await api('/admin/archives', { method: 'GET' });
    setArchivesData(response.archives || []);
    renderArchivesList();
    updateArchivesBadge();
  } catch (error) {
    console.error('Failed to load archives:', error);
    const container = $('archives-container');
    if (container) {
      container.innerHTML = '<div class="no-archives"><p>Erreur lors du chargement des archives</p></div>';
    }
  }
}

/**
 * Update archives badge
 */
export function updateArchivesBadge() {
  const badge = $('archives-badge');
  if (badge) {
    badge.textContent = archivesData.length;
    badge.classList.toggle('hidden', archivesData.length === 0);
  }
}

/**
 * Render archives list
 */
export function renderArchivesList() {
  const container = $('archives-container');
  if (!container) return;

  if (archivesData.length === 0) {
    container.innerHTML = `
      <div class="no-archives">
        <p><span class="sf-symbol">@sfs:archivebox@</span> Aucune archive</p>
        <p>Créez une archive depuis l'onglet Paramètres pour sauvegarder les données d'une édition.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = archivesData.map(archive => `
    <div class="archive-card ${archive.is_expired ? 'expired' : ''}" data-year="${archive.event_year}">
      <div class="archive-card-info">
        <h3 class="archive-card-year">Édition ${archive.event_year}</h3>
        <div class="archive-card-stats">
          <span><span class="sf-symbol">@sfs:person.2@</span> ${archive.total_teams} équipes</span>
          <span><span class="sf-symbol">@sfs:graduationcap@</span> ${archive.total_participants} participants</span>
          ${archive.total_revenue ? `<span><span class="sf-symbol">@sfs:eurosign.circle@</span> ${(archive.total_revenue / 100).toFixed(2)}€</span>` : ''}
        </div>
        <p class="archive-card-date">Archivé le ${new Date(archive.archived_at).toLocaleDateString('fr-FR')}</p>
      </div>
      <div class="archive-card-actions">
        <button type="button" class="btn btn-secondary btn-sm" onclick="viewArchive(${archive.event_year})">
          <span class="sf-symbol">@sfs:eye@</span> Consulter
        </button>
        <button type="button" class="btn btn-danger btn-sm" onclick="deleteArchive(${archive.event_year})" title="Supprimer cette archive (dev uniquement)">
          <span class="sf-symbol">@sfs:trash@</span> Supprimer
        </button>
      </div>
    </div>
  `).join('');
}

/**
 * View archive details
 * @param {number} year - Event year
 * @param {Function} api - API function
 */
export async function viewArchive(year, api) {
  try {
    const response = await api(`/admin/archives/${year}`, { method: 'GET' });
    setSelectedArchive(response.archive);
    renderArchiveDetail();

    const detailSection = $('archive-detail');
    if (detailSection) {
      detailSection.classList.remove('hidden');
      detailSection.scrollIntoView({ behavior: 'smooth' });
    }
  } catch {
    toastError('Erreur lors du chargement de l\'archive');
  }
}

/**
 * Render archive detail view
 */
export function renderArchiveDetail() {
  if (!selectedArchive) return;

  const title = $('archive-detail-title');
  if (title) {
    title.textContent = `Édition ${selectedArchive.event_year}`;
  }

  const teams = JSON.parse(selectedArchive.teams_json || '[]');
  const members = JSON.parse(selectedArchive.members_json || '[]');

  const statsGrid = $('archive-stats-grid');
  if (statsGrid) {
    statsGrid.innerHTML = `
      <div class="archive-stat-card">
        <div class="archive-stat-value">${selectedArchive.total_teams}</div>
        <div class="archive-stat-label">Équipes</div>
      </div>
      <div class="archive-stat-card">
        <div class="archive-stat-value">${selectedArchive.total_participants}</div>
        <div class="archive-stat-label">Participants</div>
      </div>
      <div class="archive-stat-card">
        <div class="archive-stat-value">${(selectedArchive.total_revenue / 100).toFixed(2)}€</div>
        <div class="archive-stat-label">Revenus</div>
      </div>
      <div class="archive-stat-card">
        <div class="archive-stat-value">${new Date(selectedArchive.archived_at).toLocaleDateString('fr-FR')}</div>
        <div class="archive-stat-label">Date d'archivage</div>
      </div>
    `;
  }

  const teamsBody = $('archive-teams-tbody');
  if (teamsBody) {
    teamsBody.innerHTML = teams.map(team => `
      <tr>
        <td>${escapeHtml(team.name)}</td>
        <td>${team.member_count || '-'}</td>
        <td>${escapeHtml(team.room_name) || '-'}</td>
      </tr>
    `).join('');
  }

  const membersBody = $('archive-members-tbody');
  if (membersBody) {
    membersBody.innerHTML = members.map(member => {
      const team = teams.find(t => t.id === member.team_id);
      return `
        <tr>
          <td>${escapeHtml(member.first_name)} ${escapeHtml(member.last_name)}</td>
          <td>${escapeHtml(member.email) || '<em>anonymisé</em>'}</td>
          <td>${escapeHtml(team?.name) || '-'}</td>
          <td>BAC+${member.bac_level || 0}</td>
        </tr>
      `;
    }).join('');
  }

  const gdprNotice = $('archive-gdpr-notice');
  if (gdprNotice) {
    gdprNotice.classList.toggle('hidden', !selectedArchive.is_expired);
  }
}

/**
 * Close archive detail view
 */
export function closeArchiveDetail() {
  const detailSection = $('archive-detail');
  if (detailSection) {
    detailSection.classList.add('hidden');
  }
  setSelectedArchive(null);
}

/**
 * Export archive as JSON
 * @param {string} apiBase - API base URL
 * @param {string} adminToken - Admin token
 */
export async function exportArchiveJson(apiBase, adminToken) {
  if (!selectedArchive) return;
  try {
    const response = await fetch(`${apiBase}/api/admin/archives/${selectedArchive.event_year}/export?format=json`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await response.json();

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ndi-${selectedArchive.event_year}-archive.json`;
    a.click();
    URL.revokeObjectURL(url);
    toastSuccess('Export JSON téléchargé');
  } catch {
    toastError('Erreur lors de l\'export');
  }
}

/**
 * Create new archive
 * @param {Function} api - API function
 * @param {Function} loadResetSafetyCheck - Callback to reload safety check
 */
export async function createArchive(api, loadResetSafetyCheck) {
  const yearEl = $('current-event-year');
  const year = yearEl ? yearEl.textContent : new Date().getFullYear();

  if (!confirm(`Créer une archive pour l'édition ${year} ?\n\nCette action sauvegardera toutes les données actuelles (équipes, participants, statistiques).`)) {
    return;
  }

  try {
    await api('/admin/archives', {
      method: 'POST',
      body: JSON.stringify({ year: Number.parseInt(year) })
    });

    toastSuccess(`Archive ${year} créée avec succès`);
    await loadArchives(api);
    await loadResetSafetyCheck();
  } catch (error) {
    if (error.message.includes('already exists')) {
      toastError(`Une archive pour ${year} existe déjà`);
    } else if (error.message.includes('No data')) {
      toastError('Aucune donnée à archiver');
    } else {
      toastError('Erreur lors de la création de l\'archive');
    }
  }
}

/**
 * Delete archive
 * @param {number} year - Event year
 * @param {Function} api - API function
 * @param {Function} loadResetSafetyCheck - Callback to reload safety check
 */
export async function deleteArchive(year, api, loadResetSafetyCheck) {
  if (!confirm(`Supprimer définitivement l'archive ${year} ?\n\nCette action est irréversible.`)) {
    return;
  }

  try {
    await api(`/admin/archives/${year}`, { method: 'DELETE' });
    toastSuccess(`Archive ${year} supprimée`);
    await loadArchives(api);
    await loadResetSafetyCheck();
  } catch (error) {
    if (error.message.includes('development')) {
      toastError('La suppression n\'est autorisée qu\'en environnement de développement');
    } else if (error.message.includes('not found')) {
      toastError('Archive introuvable');
    } else {
      toastError('Erreur lors de la suppression de l\'archive');
    }
  }
}

/**
 * Check archive expiration
 * @param {Function} api - API function
 */
export async function checkExpiration(api) {
  const resultEl = $('expiration-result');
  try {
    const response = await api('/admin/expiration-check', { method: 'POST' });

    if (resultEl) {
      resultEl.classList.remove('hidden');
      if (response.updated > 0) {
        resultEl.className = 'result-text warning';
        resultEl.textContent = `${response.updated} archive(s) ont été anonymisées.`;
        await loadArchives(api);
      } else {
        resultEl.className = 'result-text success';
        resultEl.textContent = `${response.checked} archive(s) vérifiées. Aucune expiration.`;
      }
    }
  } catch {
    if (resultEl) {
      resultEl.classList.remove('hidden');
      resultEl.className = 'result-text warning';
      resultEl.textContent = 'Erreur lors de la vérification';
    }
  }
}

/**
 * Load reset safety check
 * @param {Function} api - API function
 */
export async function loadResetSafetyCheck(api) {
  const container = $('reset-safety-check');
  const resetBtn = $('reset-data-btn');

  if (!container) return;

  try {
    const response = await api('/admin/reset/check', { method: 'GET' });

    // Response contains: year, archiveExists, counts, has_data, safe, message
    const hasData = response.has_data;
    const needsArchive = hasData && !response.archiveExists;
    const teamsCount = response.counts?.teams || 0;
    const membersCount = response.counts?.members || 0;

    if (needsArchive) {
      container.className = 'reset-safety-check warning';
      container.innerHTML = `
        <p><strong><span class="sf-symbol">@sfs:exclamationmark.triangle@</span> Données non archivées</strong></p>
        <p>Il y a actuellement ${teamsCount} équipes et ${membersCount} participants.</p>
        <p>Créez une archive avant de réinitialiser pour ne pas perdre ces données.</p>
      `;
      if (resetBtn) resetBtn.disabled = true;
    } else if (hasData) {
      container.className = 'reset-safety-check safe';
      container.innerHTML = `
        <p><strong><span class="sf-symbol">@sfs:checkmark.circle@</span> Prêt à réinitialiser</strong></p>
        <p>Les données ont été archivées. Vous pouvez réinitialiser en toute sécurité.</p>
        <p>Archive : ${response.year}</p>
      `;
      if (resetBtn) resetBtn.disabled = false;
    } else {
      container.className = 'reset-safety-check safe';
      container.innerHTML = `
        <p><strong><span class="sf-symbol">@sfs:info.circle@</span> Aucune donnée</strong></p>
        <p>La base de données est vide. Rien à réinitialiser.</p>
      `;
      if (resetBtn) resetBtn.disabled = true;
    }
  } catch {
    container.innerHTML = '<p>Erreur lors de la vérification</p>';
  }
}

/**
 * Load event info
 * @param {Function} api - API function
 */
export async function loadEventInfo(api) {
  try {
    const response = await api('/admin/event-year', { method: 'GET' });
    const yearEl = $('current-event-year');
    if (yearEl) {
      yearEl.textContent = response.year;
    }

    const teamsEl = $('current-teams-count');
    const participantsCountEl = $('current-participants-count');
    if (teamsEl && teamsData) {
      teamsEl.textContent = teamsData.length;
    }
    if (participantsCountEl && teamsData) {
      const participantCount = teamsData.reduce((sum, team) => sum + (team.members?.length || 0), 0);
      participantsCountEl.textContent = participantCount;
    }
  } catch (error) {
    console.error('Failed to load event info:', error);
  }
}

/**
 * Reset all data
 * @param {Function} api - API function
 * @param {Function} loadData - Reload callback
 * @param {Function} loadSafetyCheck - Reload safety check callback
 */
export async function resetData(api, loadData, loadSafetyCheck) {
  if (!confirm('⚠️ ATTENTION ⚠️\n\nVous êtes sur le point de SUPPRIMER DÉFINITIVEMENT toutes les données :\n- Toutes les équipes\n- Tous les participants\n- Tous les paiements\n\nCette action est IRRÉVERSIBLE.\n\nÊtes-vous absolument sûr ?')) {
    return;
  }

  const confirmText = prompt('Pour confirmer, tapez "SUPPRIMER" :');
  if (confirmText !== 'SUPPRIMER') {
    toastError('Réinitialisation annulée');
    return;
  }

  try {
    await api('/admin/reset', { method: 'POST' });
    toastSuccess('Données réinitialisées avec succès');
    await loadData();
    await loadSafetyCheck();
  } catch (error) {
    if (error.message.includes('archive')) {
      toastError('Créez d\'abord une archive avant de réinitialiser');
    } else {
      toastError('Erreur lors de la réinitialisation');
    }
  }
}

/**
 * Initialize archives module
 * @param {Function} api - API function
 * @param {string} apiBase - API base URL
 * @param {string} adminToken - Admin token
 * @param {Function} loadData - Reload callback
 */
export function initArchives(api, apiBase, adminToken, loadData) {
  // Refresh button
  const refreshBtn = $('refresh-archives-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadArchives(api));
  }

  // Close detail button
  const closeBtn = $('close-archive-detail-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeArchiveDetail);
  }

  // Export buttons
  const exportJsonBtn = $('export-archive-json-btn');
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener('click', () => exportArchiveJson(apiBase, adminToken));
  }

  // Create archive button
  const createBtn = $('create-archive-btn');
  if (createBtn) {
    createBtn.addEventListener('click', () => createArchive(api, () => loadResetSafetyCheck(api)));
  }

  // Check expiration button
  const expirationBtn = $('check-expiration-btn');
  if (expirationBtn) {
    expirationBtn.addEventListener('click', () => checkExpiration(api));
  }

  // Reset button
  const resetBtn = $('reset-data-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => resetData(api, loadData, () => loadResetSafetyCheck(api)));
  }

  // Load initial data
  loadArchives(api);
  loadResetSafetyCheck(api);
  loadEventInfo(api);
}
