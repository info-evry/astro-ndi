/**
 * Import module - CSV import functionality
 */
/* eslint-env browser */

import { $, escapeHtml } from './utils.js';
import { toastSuccess, toastError } from './toast.js';
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
        status.innerHTML = `<span class="sf-symbol">@sfs:checkmark@</span> ${stats.membersImported} importés, ${stats.membersSkipped} ignorés, ${stats.teamsCreated} équipes créées`;
        status.className = 'import-status success';
      }

      loadData();
    } else {
      throw new Error(result.error || 'Erreur lors de l\'import');
    }

  } catch (error) {
    console.error('Import error:', error);
    toastError(error.message || 'Erreur lors de l\'import');

    if (status) {
      status.innerHTML = `<span class="sf-symbol">@sfs:xmark@</span> Erreur: ${error.message}`;
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
