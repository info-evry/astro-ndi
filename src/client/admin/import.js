/**
 * Import module - CSV import functionality
 */
/* eslint-env browser */

import { $, escapeHtml } from '@info-evry/astro-design/scripts/dom';
import { toastSuccess, toastError } from '@info-evry/astro-design/scripts/toast';
import { csvData, setCsvData, setParsedRows } from './state.js';

// Element ID constants
const EL_IMPORT_BTN = 'import-btn';
const EL_IMPORT_STATUS = 'import-status';

/**
 * Handle file selection
 * @param {Event} event - File input change event
 */
export function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) {
    resetImport();
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    setCsvData(e.target.result);
    parseAndPreview(csvData);
  };
  reader.onerror = () => {
    toastError('Erreur lors de la lecture du fichier');
    resetImport();
  };
  reader.readAsText(file);
}

/**
 * Parse CSV and show preview
 * @param {string} csv - CSV content
 */
export function parseAndPreview(csv) {
  try {
    const lines = csv.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('Le fichier doit contenir au moins une ligne de données');
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length === headers.length) {
        const row = {};
        for (const [idx, header] of headers.entries()) {
          row[header] = values[idx].trim();
        }
        rows.push(row);
      }
    }

    setParsedRows(rows);

    const teams = new Set(rows.map(r => r.teamname || 'Sans équipe'));

    const preview = $('import-preview');
    const previewContent = $('import-preview-content');
    const importBtn = $(EL_IMPORT_BTN);
    const status = $(EL_IMPORT_STATUS);

    if (preview && previewContent) {
      previewContent.innerHTML = `
        <p><strong>${rows.length}</strong> membres dans <strong>${teams.size}</strong> équipes</p>
        <table class="import-preview-table">
          <thead>
            <tr>
              <th>Équipe</th>
              <th>Prénom</th>
              <th>Nom</th>
              <th>Email</th>
            </tr>
          </thead>
          <tbody>
            ${rows.slice(0, 5).map(row => `
              <tr>
                <td>${escapeHtml(row.teamname || '-')}</td>
                <td>${escapeHtml(row.firstname || '-')}</td>
                <td>${escapeHtml(row.lastname || '-')}</td>
                <td>${escapeHtml(row.email || '-')}</td>
              </tr>
            `).join('')}
            ${rows.length > 5 ? `<tr><td colspan="4" style="text-align:center;color:var(--color-text-muted)">... et ${rows.length - 5} autres</td></tr>` : ''}
          </tbody>
        </table>
      `;
      preview.classList.remove('hidden');
    }

    if (importBtn) {
      importBtn.disabled = false;
    }

    if (status) {
      status.textContent = '';
      status.className = EL_IMPORT_STATUS;
    }

  } catch (error) {
    toastError(error.message);
    resetImport();
  }
}

/**
 * Parse a single CSV line (handles quoted values)
 * @param {string} line - CSV line
 * @returns {string[]} Parsed values
 */
export function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (const char of line) {

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);

  return values;
}

/**
 * Render the success status (with optional generated passwords table) into
 * the status element after a successful import.
 * @param {HTMLElement} status - Status element
 * @param {object} stats - Import stats
 * @param {Array<{team: string, password: string}>} [passwords] - Newly generated team passwords
 */
function renderImportSuccess(status, stats, passwords) {
  let html = `<span class="sf-symbol">@sfs:checkmark@</span> ${stats.membersImported} importés, ${stats.membersSkipped} ignorés, ${stats.teamsCreated} équipes créées`;

  if (passwords?.length) {
    html += renderImportPasswords(passwords);
  }

  status.innerHTML = html;
  status.className = 'import-status success';

  if (passwords?.length) {
    attachCopyPasswordsListener(status, passwords);
  }
}

/**
 * Handle import button click
 * @param {Function} api - API function
 * @param {Function} loadData - Reload callback
 */
export async function handleImport(api, loadData) {
  if (!csvData) {
    toastError('Veuillez sélectionner un fichier');
    return;
  }

  const importBtn = $(EL_IMPORT_BTN);
  const status = $(EL_IMPORT_STATUS);

  if (importBtn) {
    importBtn.disabled = true;
    importBtn.textContent = 'Import en cours...';
  }

  if (status) {
    status.textContent = 'Import en cours...';
    status.className = EL_IMPORT_STATUS;
  }

  try {
    const result = await api('/admin/import', {
      method: 'POST',
      body: JSON.stringify({ csv: csvData })
    });

    if (result.success) {
      const { stats } = result;
      toastSuccess(`Import terminé: ${stats.membersImported} membres, ${stats.teamsCreated} équipes créées`);

      if (status) {
        renderImportSuccess(status, stats, result.passwords);
      }

      loadData();
    } else {
      throw new Error(result.error || 'Erreur lors de l\'import');
    }

  } catch (error) {
    console.error('Import error:', error);
    toastError(error.message || 'Erreur lors de l\'import');

    if (status) {
      status.innerHTML = `<span class="sf-symbol">@sfs:xmark@</span> Erreur: ${escapeHtml(error.message || '')}`;
      status.className = 'import-status error';
    }
  } finally {
    if (importBtn) {
      importBtn.disabled = false;
      importBtn.textContent = 'Importer';
    }
  }
}

/**
 * Render a table of newly generated team passwords, plus a "Copier" button
 * and a one-time-display warning.
 * @param {Array<{team: string, password: string}>} passwords
 * @returns {string} HTML fragment
 */
function renderImportPasswords(passwords) {
  const rows = passwords.map(({ team, password }) => `
    <tr>
      <td>${escapeHtml(team)}</td>
      <td><code>${escapeHtml(password)}</code></td>
    </tr>
  `).join('');

  return `
    <div class="import-passwords">
      <p class="import-passwords-warning">
        <span class="sf-symbol">@sfs:exclamationmark.triangle@</span>
        Ces mots de passe ne seront affichés qu'une seule fois. Notez-les ou copiez-les maintenant.
      </p>
      <table class="import-passwords-table">
        <thead>
          <tr>
            <th>Équipe</th>
            <th>Mot de passe</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <button type="button" class="btn" data-action="copy-import-passwords">Copier</button>
    </div>
  `;
}

/**
 * Attach the click listener for the "Copier" button rendered by
 * renderImportPasswords, copying team/password pairs to the clipboard.
 * @param {HTMLElement} container - Element containing the rendered button
 * @param {Array<{team: string, password: string}>} passwords
 */
function attachCopyPasswordsListener(container, passwords) {
  const button = container.querySelector('[data-action="copy-import-passwords"]');
  if (!button) return;

  button.addEventListener('click', async () => {
    const text = passwords.map(({ team, password }) => `${team}\t${password}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toastSuccess('Mots de passe copiés');
    } catch (error) {
      console.error('Failed to copy passwords:', error);
      toastError('Impossible de copier les mots de passe');
    }
  });
}

/**
 * Reset import state
 */
export function resetImport() {
  setCsvData(null);
  setParsedRows([]);

  const preview = $('import-preview');
  const importBtn = $(EL_IMPORT_BTN);
  const status = $(EL_IMPORT_STATUS);

  if (preview) {
    preview.classList.add('hidden');
  }

  if (importBtn) {
    importBtn.disabled = true;
  }

  if (status) {
    status.textContent = '';
    status.className = EL_IMPORT_STATUS;
  }
}

/**
 * Initialize import module
 * @param {Function} api - API function
 * @param {Function} loadData - Reload callback
 */
export function initImport(api, loadData) {
  const fileInput = $('import-file');
  const importBtn = $(EL_IMPORT_BTN);

  if (fileInput) {
    fileInput.addEventListener('change', handleFileSelect);
  }

  if (importBtn) {
    importBtn.addEventListener('click', () => handleImport(api, loadData));
  }
}
