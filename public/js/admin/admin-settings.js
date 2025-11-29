/**
 * Admin Settings Module
 * Manages configuration: capacity limits and pizza options
 */

import { adminGet, adminPut } from '../core/api.js';
import { $, escapeHtml } from '../core/utils.js';
import { toastSuccess, toastError } from '../components/toast.js';

// Local state for settings
let settingsState = {
  maxTeamSize: 15,
  maxTotalParticipants: 200,
  minTeamSize: 1,
  schoolName: "Université d'Evry",
  pizzas: [],
  bacLevels: [],
  isDirty: false
};

/**
 * Initialize the settings section
 */
export async function initSettings() {
  await loadSettings();
  setupEventListeners();
}

/**
 * Load settings from server
 */
export async function loadSettings() {
  try {
    const data = await adminGet('/admin/settings');
    settingsState.maxTeamSize = parseInt(data.settings.max_team_size, 10) || 15;
    settingsState.maxTotalParticipants = parseInt(data.settings.max_total_participants, 10) || 200;
    settingsState.minTeamSize = parseInt(data.settings.min_team_size, 10) || 1;
    settingsState.schoolName = data.settings.school_name || "Université d'Evry";
    settingsState.pizzas = data.settings.pizzas || [];
    settingsState.bacLevels = data.settings.bac_levels || [];
    settingsState.isDirty = false;

    renderSettings();
  } catch (err) {
    console.error('Error loading settings:', err);
    toastError('Erreur lors du chargement des paramètres');
  }
}

/**
 * Render settings UI
 */
function renderSettings() {
  // School name input
  const schoolNameInput = $('setting-school-name');
  if (schoolNameInput) schoolNameInput.value = settingsState.schoolName;

  // Capacity inputs
  const maxTeamInput = $('setting-max-team');
  const maxParticipantsInput = $('setting-max-participants');
  const minTeamInput = $('setting-min-team');

  if (maxTeamInput) maxTeamInput.value = settingsState.maxTeamSize;
  if (maxParticipantsInput) maxParticipantsInput.value = settingsState.maxTotalParticipants;
  if (minTeamInput) minTeamInput.value = settingsState.minTeamSize;

  // Pizza list
  renderPizzasList();

  // Update save button state
  updateSaveButton();
}

/**
 * Render the pizzas list
 */
function renderPizzasList() {
  const container = $('pizzas-list');
  if (!container) return;

  if (settingsState.pizzas.length === 0) {
    container.innerHTML = '<p class="text-muted">Aucune pizza configurée</p>';
    return;
  }

  container.innerHTML = settingsState.pizzas.map((pizza, index) => `
    <div class="pizza-item" data-index="${index}">
      <div class="pizza-item-info">
        <span class="pizza-item-id">${escapeHtml(pizza.id)}</span>
        <span class="pizza-item-name">${escapeHtml(pizza.name)}</span>
        <span class="pizza-item-desc">${escapeHtml(pizza.description || '')}</span>
      </div>
      <div class="pizza-item-actions">
        <button type="button" class="btn-icon edit-pizza-btn" data-index="${index}" title="Modifier">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button type="button" class="btn-icon delete-pizza-btn" data-index="${index}" title="Supprimer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </div>
  `).join('');

  // Add event listeners for edit/delete buttons
  container.querySelectorAll('.edit-pizza-btn').forEach(btn => {
    btn.addEventListener('click', () => editPizza(parseInt(btn.dataset.index, 10)));
  });

  container.querySelectorAll('.delete-pizza-btn').forEach(btn => {
    btn.addEventListener('click', () => deletePizza(parseInt(btn.dataset.index, 10)));
  });
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Settings inputs - mark dirty on change
  ['setting-max-team', 'setting-max-participants', 'setting-min-team', 'setting-school-name'].forEach(id => {
    const input = $(id);
    if (input) {
      input.addEventListener('change', markDirty);
      input.addEventListener('input', markDirty);
    }
  });

  // Save button
  const saveBtn = $('save-settings-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveSettings);
  }

  // Add pizza form
  const addPizzaForm = $('add-pizza-form-element');
  if (addPizzaForm) {
    addPizzaForm.addEventListener('submit', (e) => {
      e.preventDefault();
      addPizzaFromForm();
    });
  }
}

/**
 * Mark settings as dirty (modified)
 */
function markDirty() {
  settingsState.isDirty = true;
  updateSaveButton();
}

/**
 * Update save button state
 */
function updateSaveButton() {
  const saveBtn = $('save-settings-btn');
  if (saveBtn) {
    saveBtn.disabled = !settingsState.isDirty;
    saveBtn.textContent = settingsState.isDirty ? 'Enregistrer les modifications *' : 'Enregistrer les modifications';
  }
}

/**
 * Add a new pizza from the form
 */
function addPizzaFromForm() {
  const idInput = $('new-pizza-id');
  const nameInput = $('new-pizza-name');
  const descInput = $('new-pizza-desc');

  if (!idInput || !nameInput) return;

  const id = idInput.value.trim().toLowerCase().replace(/\s+/g, '_');
  const name = nameInput.value.trim();
  const description = descInput?.value.trim() || '';

  if (!id || !name) {
    toastError('ID et nom requis');
    return;
  }

  // Check for duplicate ID
  if (settingsState.pizzas.some(p => p.id === id)) {
    toastError('Une pizza avec cet ID existe déjà');
    return;
  }

  settingsState.pizzas.push({ id, name, description });
  markDirty();
  renderPizzasList();

  // Clear form
  idInput.value = '';
  nameInput.value = '';
  if (descInput) descInput.value = '';

  toastSuccess('Pizza ajoutée (non sauvegardée)');
}

/**
 * Edit a pizza
 */
function editPizza(index) {
  const pizza = settingsState.pizzas[index];
  if (!pizza) return;

  const newName = prompt('Nom de la pizza:', pizza.name);
  if (newName === null) return; // Cancelled

  const newDesc = prompt('Description:', pizza.description || '');
  if (newDesc === null) return; // Cancelled

  settingsState.pizzas[index] = {
    ...pizza,
    name: newName.trim() || pizza.name,
    description: newDesc.trim()
  };

  markDirty();
  renderPizzasList();
}

/**
 * Delete a pizza
 */
function deletePizza(index) {
  const pizza = settingsState.pizzas[index];
  if (!pizza) return;

  if (!confirm(`Supprimer la pizza "${pizza.name}" ?`)) return;

  settingsState.pizzas.splice(index, 1);
  markDirty();
  renderPizzasList();
}

/**
 * Save all settings to server
 */
async function saveSettings() {
  try {
    // Collect values from inputs
    const maxTeamSize = parseInt($('setting-max-team')?.value, 10);
    const maxTotalParticipants = parseInt($('setting-max-participants')?.value, 10);
    const minTeamSize = parseInt($('setting-min-team')?.value, 10);
    const schoolName = $('setting-school-name')?.value?.trim() || "Université d'Evry";

    // Validate
    if (isNaN(maxTeamSize) || maxTeamSize < 1 || maxTeamSize > 100) {
      toastError('Taille max d\'équipe invalide (1-100)');
      return;
    }
    if (isNaN(maxTotalParticipants) || maxTotalParticipants < 1 || maxTotalParticipants > 10000) {
      toastError('Participants max invalide (1-10000)');
      return;
    }
    if (isNaN(minTeamSize) || minTeamSize < 1 || minTeamSize > 50) {
      toastError('Taille min d\'équipe invalide (1-50)');
      return;
    }

    const saveBtn = $('save-settings-btn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Enregistrement...';
    }

    await adminPut('/admin/settings', {
      max_team_size: maxTeamSize,
      max_total_participants: maxTotalParticipants,
      min_team_size: minTeamSize,
      school_name: schoolName,
      pizzas: settingsState.pizzas
    });

    settingsState.isDirty = false;
    settingsState.maxTeamSize = maxTeamSize;
    settingsState.maxTotalParticipants = maxTotalParticipants;
    settingsState.minTeamSize = minTeamSize;
    settingsState.schoolName = schoolName;

    updateSaveButton();
    toastSuccess('Paramètres enregistrés');
  } catch (err) {
    console.error('Error saving settings:', err);
    toastError(err.message || 'Erreur lors de la sauvegarde');
    updateSaveButton();
  }
}

// Export for external use
export { settingsState };
