/**
 * Admin Import Module
 * Handles CSV file import for teams and members
 */

import { adminPost } from '../core/api.js';
import { $, escapeHtml } from '../core/utils.js';
import { toastSuccess, toastError } from '../components/toast.js';

let csvData = null;
let parsedRows = [];

/**
 * Initialize the import section
 */
export function initImport() {
  setupEventListeners();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  const fileInput = $('import-file');
  const importBtn = $('import-btn');

  if (fileInput) {
    fileInput.addEventListener('change', handleFileSelect);
  }

  if (importBtn) {
    importBtn.addEventListener('click', handleImport);
  }
}

/**
 * Handle file selection
 */
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) {
    resetImport();
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    csvData = e.target.result;
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
 */
function parseAndPreview(csv) {
  try {
    const lines = csv.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('Le fichier doit contenir au moins une ligne de données');
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    parsedRows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length === headers.length) {
        const row = {};
        headers.forEach((header, idx) => {
          row[header] = values[idx].trim();
        });
        parsedRows.push(row);
      }
    }

    // Count unique teams
    const teams = new Set(parsedRows.map(r => r.teamname || 'Sans équipe'));

    // Show preview
    const preview = $('import-preview');
    const previewContent = $('import-preview-content');
    const importBtn = $('import-btn');
    const status = $('import-status');

    if (preview && previewContent) {
      previewContent.innerHTML = `
        <p><strong>${parsedRows.length}</strong> membres dans <strong>${teams.size}</strong> équipes</p>
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
            ${parsedRows.slice(0, 5).map(row => `
              <tr>
                <td>${escapeHtml(row.teamname || '-')}</td>
                <td>${escapeHtml(row.firstname || '-')}</td>
                <td>${escapeHtml(row.lastname || '-')}</td>
                <td>${escapeHtml(row.email || '-')}</td>
              </tr>
            `).join('')}
            ${parsedRows.length > 5 ? `<tr><td colspan="4" style="text-align:center;color:var(--color-text-muted)">... et ${parsedRows.length - 5} autres</td></tr>` : ''}
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
      status.className = 'import-status';
    }

  } catch (err) {
    toastError(err.message);
    resetImport();
  }
}

/**
 * Parse a single CSV line handling quoted values
 */
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

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
 */
async function handleImport() {
  if (!csvData) {
    toastError('Veuillez sélectionner un fichier');
    return;
  }

  const importBtn = $('import-btn');
  const status = $('import-status');

  if (importBtn) {
    importBtn.disabled = true;
    importBtn.textContent = 'Import en cours...';
  }

  if (status) {
    status.textContent = 'Import en cours...';
    status.className = 'import-status';
  }

  try {
    const result = await adminPost('/admin/import', { csv: csvData });

    if (result.success) {
      const { stats } = result;
      toastSuccess(`Import terminé: ${stats.membersImported} membres, ${stats.teamsCreated} équipes créées`);

      if (status) {
        status.textContent = `✓ ${stats.membersImported} importés, ${stats.membersSkipped} ignorés, ${stats.teamsCreated} équipes créées`;
        status.className = 'import-status success';
      }

      // Trigger data reload
      if (window.loadData) {
        window.loadData();
      }
    } else {
      throw new Error(result.error || 'Erreur lors de l\'import');
    }

  } catch (err) {
    console.error('Import error:', err);
    toastError(err.message || 'Erreur lors de l\'import');

    if (status) {
      status.textContent = `✗ Erreur: ${err.message}`;
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
function resetImport() {
  csvData = null;
  parsedRows = [];

  const preview = $('import-preview');
  const importBtn = $('import-btn');
  const status = $('import-status');

  if (preview) {
    preview.classList.add('hidden');
  }

  if (importBtn) {
    importBtn.disabled = true;
  }

  if (status) {
    status.textContent = '';
    status.className = 'import-status';
  }
}
