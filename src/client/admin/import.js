/**
 * Import module - CSV import functionality
 *
 * The preview parses the file with the same code and the same header aliases
 * as the server (astro-core/csv + lib/members-csv.js), so what is previewed is
 * what the import will read: English or French (export) headers, `,` or `;`.
 */
/* eslint-env browser */

import { $, escapeHtml } from '@info-evry/astro-design/scripts/dom';
import { toastSuccess, toastError } from '@info-evry/astro-design/scripts/toast';
import { mapCsvHeaders, parseCsv, unescapeCsvCell } from 'astro-core/csv';
import { MAX_IMPORT_ROWS } from '../../shared/constants.js';
import { IMPORT_FIELD_LABELS, IMPORT_HEADER_ALIASES, REQUIRED_IMPORT_FIELDS } from '../../lib/members-csv.js';
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
 * Parse an import file into preview rows `{ team, firstName, lastName, email }`.
 * Rows whose number of cells differs from the header are left out (the server
 * reports them). Throws an Error with a displayable message for a file the
 * server would refuse.
 * @param {string} csv - CSV content
 * @returns {Array<{team: string, firstName: string, lastName: string, email: string}>}
 */
export function parseImportRows(csv) {
  const { headers, rows: cells } = parseCsv(csv);
  if (cells.length === 0) {
    throw new Error('Le fichier doit contenir au moins une ligne de données');
  }
  if (cells.length > MAX_IMPORT_ROWS) {
    throw new Error(`Trop de lignes (${cells.length}) : maximum ${MAX_IMPORT_ROWS} par import`);
  }

  const columns = mapCsvHeaders(headers, IMPORT_HEADER_ALIASES);
  const missing = REQUIRED_IMPORT_FIELDS.filter(field => columns[field] === undefined);
  if (missing.length > 0) {
    throw new Error(`Colonnes obligatoires manquantes : ${missing.map(field => IMPORT_FIELD_LABELS[field]).join(', ')}`);
  }

  const cell = (row, field) => unescapeCsvCell(row[columns[field]] ?? '');
  return cells
    .filter(row => row.length === headers.length)
    .map(row => ({
      team: cell(row, 'team'),
      firstName: cell(row, 'firstName'),
      lastName: cell(row, 'lastName'),
      email: cell(row, 'email')
    }));
}

/**
 * Parse CSV and show preview
 * @param {string} csv - CSV content
 */
export function parseAndPreview(csv) {
  try {
    const rows = parseImportRows(csv);

    setParsedRows(rows);

    const teams = new Set(rows.map(r => r.team || 'Sans équipe'));

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
                <td>${escapeHtml(row.team || '-')}</td>
                <td>${escapeHtml(row.firstName || '-')}</td>
                <td>${escapeHtml(row.lastName || '-')}</td>
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
        Ces codes secrets ne seront affichés qu'une seule fois. Notez-les ou copiez-les maintenant.
      </p>
      <table class="import-passwords-table">
        <thead>
          <tr>
            <th>Équipe</th>
            <th>Code secret</th>
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
      toastError('Impossible de copier les codes secrets');
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
