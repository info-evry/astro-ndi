/**
 * Settings module - Application configuration
 *
 * Two kinds of settings, saved differently on purpose:
 * - the form fields (capacity, on-site prices, school name, retention) are
 *   edited freely and saved together by the sticky "Enregistrer" button;
 * - the pizza catalogue is a list edited item by item: every add / edit /
 *   delete is persisted immediately with its own `PUT /admin/settings`
 *   carrying only `{ pizzas }`, so a reload can never bring back a deleted
 *   pizza or lose an edit.
 */
/* eslint-env browser */

import { $, escapeHtml, numberOrNull } from '@info-evry/astro-design/scripts/dom';
import { confirmAction } from '@info-evry/astro-design/scripts/confirm';
import { toastSuccess, toastError } from '@info-evry/astro-design/scripts/toast';
import {
  DEFAULT_GDPR_RETENTION_YEARS,
  DEFAULT_LATE_CUTOFF_TIME,
  DEFAULT_MAX_TEAM_SIZE,
  DEFAULT_MAX_TOTAL_PARTICIPANTS,
  DEFAULT_MIN_TEAM_SIZE,
  DEFAULT_PRICES,
  DEFAULT_SCHOOL_NAME,
  MAX_FOOD_DIET_LENGTH,
  isNoPizza
} from '../../shared/constants.js';
import { settingsState, pricingSettings, teamsData, setPizzasConfig } from './state.js';

const SETTINGS_PATH = '/admin/settings';

/**
 * Integer setting stored as text; a missing or invalid value gives the default.
 * @param {unknown} raw
 * @param {number} fallback
 * @returns {number}
 */
function intOr(raw, fallback) {
  return Number.parseInt(raw, 10) || fallback;
}

/**
 * Make the pizza list the current catalogue, here and for the other tabs
 * (member modal, pizza filters) that read it from the shared state.
 * @param {unknown} pizzas - Stored value (anything but an array means "none")
 */
function applyPizzas(pizzas) {
  settingsState.pizzas = Array.isArray(pizzas) ? pizzas : [];
  setPizzasConfig(settingsState.pizzas);
}

/**
 * Load settings from API
 * @param {Function} api - API function
 */
export async function loadSettings(api) {
  try {
    const { settings } = await api(SETTINGS_PATH, { method: 'GET' });

    settingsState.maxTeamSize = intOr(settings.max_team_size, DEFAULT_MAX_TEAM_SIZE);
    settingsState.maxTotalParticipants = intOr(settings.max_total_participants, DEFAULT_MAX_TOTAL_PARTICIPANTS);
    settingsState.minTeamSize = intOr(settings.min_team_size, DEFAULT_MIN_TEAM_SIZE);
    settingsState.schoolName = settings.school_name || DEFAULT_SCHOOL_NAME;
    settingsState.bacLevels = settings.bac_levels || [];
    settingsState.isDirty = false;
    applyPizzas(settings.pizzas);

    // On-site pricing settings
    pricingSettings.priceAssoMember = intOr(settings.price_asso_member, DEFAULT_PRICES.assoMember);
    pricingSettings.priceNonMember = intOr(settings.price_non_member, DEFAULT_PRICES.nonMember);
    pricingSettings.priceLate = intOr(settings.price_late, DEFAULT_PRICES.late);
    pricingSettings.lateCutoffTime = settings.late_cutoff_time || DEFAULT_LATE_CUTOFF_TIME;

    // GDPR settings
    settingsState.gdprRetentionYears = intOr(settings.gdpr_retention_years, DEFAULT_GDPR_RETENTION_YEARS);

    renderSettings();
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

/**
 * Render settings form
 */
export function renderSettings() {
  const schoolNameInput = $('setting-school-name');
  if (schoolNameInput) schoolNameInput.value = settingsState.schoolName;

  const maxTeamInput = $('setting-max-team');
  const maxParticipantsInput = $('setting-max-participants');
  const minTeamInput = $('setting-min-team');

  if (maxTeamInput) maxTeamInput.value = settingsState.maxTeamSize;
  if (maxParticipantsInput) maxParticipantsInput.value = settingsState.maxTotalParticipants;
  if (minTeamInput) minTeamInput.value = settingsState.minTeamSize;

  // On-site pricing (convert cents to euros)
  const priceAssoInput = $('setting-price-asso-member');
  const priceNonMemberInput = $('setting-price-non-member');
  const priceLateInput = $('setting-price-late');
  const lateCutoffInput = $('setting-late-cutoff');

  if (priceAssoInput) priceAssoInput.value = (pricingSettings.priceAssoMember / 100).toFixed(2);
  if (priceNonMemberInput) priceNonMemberInput.value = (pricingSettings.priceNonMember / 100).toFixed(2);
  if (priceLateInput) priceLateInput.value = (pricingSettings.priceLate / 100).toFixed(2);
  if (lateCutoffInput) lateCutoffInput.value = pricingSettings.lateCutoffTime;

  // GDPR settings
  const gdprRetentionInput = $('setting-gdpr-retention');
  if (gdprRetentionInput) gdprRetentionInput.value = settingsState.gdprRetentionYears || DEFAULT_GDPR_RETENTION_YEARS;

  renderPizzasList();
  updateSaveButton();
}

// ============================================================
// PIZZA CATALOGUE (each change is persisted immediately)
// ============================================================

/** Id of the pizza being edited inline, or null. */
let editingPizzaId = null;
/** True while a pizza change is being saved: every pizza control is disabled. */
let pizzaSaving = false;

/**
 * The "no pizza" entry (`none` / `0-rien`): members who want no pizza are
 * stored with it, so it stays in the catalogue.
 * @param {{ id?: unknown }} pizza
 * @returns {boolean}
 */
function isProtectedPizza(pizza) {
  return isNoPizza(pizza?.id);
}

/**
 * Number of registered members who chose a pizza.
 * @param {string} pizzaId
 * @returns {number}
 */
function countMembersWithPizza(pizzaId) {
  let count = 0;
  for (const team of teamsData) {
    for (const member of team.members || []) {
      if (member.food_diet === pizzaId) count++;
    }
  }
  return count;
}

/** @param {string} id */
function findPizza(id) {
  return settingsState.pizzas.find(pizza => pizza.id === id);
}

/**
 * @param {object} pizza
 * @param {string} disabled - ` disabled` or ''
 */
function pizzaViewHtml(pizza, disabled) {
  const id = escapeHtml(pizza.id);
  const deleteControl = isProtectedPizza(pizza)
    ? '<span class="pizza-item-lock" title="Choix « pas de pizza » : ne peut pas être supprimé">Verrouillée</span>'
    : `<button type="button" class="icon-btn sm danger delete-pizza-btn" data-pizza-action="delete" data-pizza-id="${id}" title="Supprimer" aria-label="Supprimer la pizza"${disabled}>􀈑</button>`;
  return `
    <div class="pizza-item" data-pizza-id="${id}">
      <div class="pizza-item-info">
        <span class="pizza-item-id">${id}</span>
        <span class="pizza-item-name">${escapeHtml(pizza.name)}</span>
        <span class="pizza-item-desc">${escapeHtml(pizza.description || '')}</span>
      </div>
      <div class="pizza-item-actions action-buttons">
        <button type="button" class="icon-btn sm edit-pizza-btn" data-pizza-action="edit" data-pizza-id="${id}" title="Modifier" aria-label="Modifier la pizza"${disabled}>􀈊</button>
        ${deleteControl}
      </div>
    </div>`;
}

/**
 * @param {object} pizza
 * @param {string} disabled - ` disabled` or ''
 */
function pizzaEditHtml(pizza, disabled) {
  const id = escapeHtml(pizza.id);
  return `
    <div class="pizza-item pizza-item-editing" data-pizza-id="${id}">
      <div class="pizza-item-info">
        <span class="pizza-item-id">${id}</span>
        <input type="text" class="pizza-edit-name" value="${escapeHtml(pizza.name)}" maxlength="100" placeholder="Nom" aria-label="Nom de la pizza"${disabled}>
        <input type="text" class="pizza-edit-desc" value="${escapeHtml(pizza.description || '')}" maxlength="256" placeholder="Description" aria-label="Description de la pizza"${disabled}>
      </div>
      <div class="pizza-item-actions action-buttons">
        <button type="button" class="btn btn-primary btn-sm" data-pizza-action="save-edit" data-pizza-id="${id}"${disabled}>Enregistrer</button>
        <button type="button" class="btn btn-secondary btn-sm" data-pizza-action="cancel-edit" data-pizza-id="${id}"${disabled}>Annuler</button>
      </div>
    </div>`;
}

/**
 * Render pizzas configuration list
 */
export function renderPizzasList() {
  const container = $('pizzas-list');
  if (!container) return;

  if (settingsState.pizzas.length === 0) {
    container.innerHTML = '<p class="text-muted">Aucune pizza configurée</p>';
    return;
  }

  const disabled = pizzaSaving ? ' disabled' : '';
  container.innerHTML = settingsState.pizzas
    .map(pizza => (pizza.id === editingPizzaId ? pizzaEditHtml(pizza, disabled) : pizzaViewHtml(pizza, disabled)))
    .join('');

  container.querySelector('.pizza-edit-name')?.focus();
}

/**
 * Lock or unlock every pizza control (list buttons and the add form).
 * @param {boolean} saving
 */
function setPizzaSaving(saving) {
  pizzaSaving = saving;
  const addButton = $('add-pizza-form-element')?.querySelector('button[type="submit"]');
  if (addButton) addButton.disabled = saving;
  renderPizzasList();
}

/**
 * Persist a new pizza list on its own (`PUT { pizzas }`, nothing else), then
 * show what the server stores (a fresh GET). The list is replaced optimistically
 * and rolled back when the request fails.
 *
 * @param {Function} api - API function
 * @param {object[]} nextPizzas - The whole new catalogue
 * @param {string} successMessage - Toast shown once stored
 * @returns {Promise<boolean>} true when the change is stored
 */
async function persistPizzas(api, nextPizzas, successMessage) {
  const previous = settingsState.pizzas;
  settingsState.pizzas = nextPizzas;
  setPizzaSaving(true);

  try {
    await api(SETTINGS_PATH, { method: 'PUT', body: JSON.stringify({ pizzas: nextPizzas }) });
  } catch (error) {
    console.error('Error saving pizzas:', error);
    settingsState.pizzas = previous;
    setPizzaSaving(false);
    toastError(error?.message ? `Pizzas non enregistrées : ${error.message}` : 'Erreur lors de l\'enregistrement des pizzas');
    return false;
  }

  try {
    const { settings } = await api(SETTINGS_PATH, { method: 'GET' });
    if (Array.isArray(settings?.pizzas)) settingsState.pizzas = settings.pizzas;
  } catch (error) {
    // The change is stored: keep showing it even though it could not be read back
    console.error('Error reloading pizzas:', error);
  }

  setPizzaSaving(false);
  setPizzasConfig(settingsState.pizzas);
  toastSuccess(successMessage);
  return true;
}

/**
 * Add the pizza typed in the "Ajouter une pizza" form
 * @param {Function} api - API function
 * @returns {Promise<boolean>} true when the pizza is stored
 */
export async function addPizzaFromForm(api) {
  const idInput = $('new-pizza-id');
  const nameInput = $('new-pizza-name');
  const descInput = $('new-pizza-desc');

  if (!idInput || !nameInput || pizzaSaving) return false;

  const id = idInput.value.trim().toLowerCase().replaceAll(/\s+/g, '_');
  const name = nameInput.value.trim();
  const description = descInput?.value.trim() || '';

  if (!id || !name) {
    toastError('L\'identifiant et le nom sont requis');
    return false;
  }

  if (id.length > MAX_FOOD_DIET_LENGTH) {
    toastError(`L'identifiant ne doit pas dépasser ${MAX_FOOD_DIET_LENGTH} caractères`);
    return false;
  }

  if (findPizza(id)) {
    toastError('Une pizza avec cet identifiant existe déjà');
    return false;
  }

  const stored = await persistPizzas(api, [...settingsState.pizzas, { id, name, description }], 'Pizza ajoutée');
  if (stored) {
    idInput.value = '';
    nameInput.value = '';
    if (descInput) descInput.value = '';
  }
  return stored;
}

/**
 * Switch a pizza card to its inline edit mode
 * @param {string} id - Pizza id
 */
export function startPizzaEdit(id) {
  if (pizzaSaving || !findPizza(id)) return;
  editingPizzaId = id;
  renderPizzasList();
}

/** Leave the inline edit mode without saving. */
export function cancelPizzaEdit() {
  editingPizzaId = null;
  renderPizzasList();
}

/**
 * Save the inline edit of a pizza (the id never changes)
 * @param {Function} api - API function
 * @param {string} id - Pizza id
 * @returns {Promise<boolean>} true when the change is stored (or there was none)
 */
export async function savePizzaEdit(api, id) {
  const pizza = findPizza(id);
  const nameInput = document.querySelector('#pizzas-list .pizza-edit-name');
  const descInput = document.querySelector('#pizzas-list .pizza-edit-desc');
  if (!pizza || !nameInput || pizzaSaving) return false;

  const name = nameInput.value.trim();
  const description = descInput?.value.trim() || '';

  if (!name) {
    toastError('Le nom de la pizza est requis');
    return false;
  }

  if (name === pizza.name && description === (pizza.description || '')) {
    cancelPizzaEdit();
    return true;
  }

  editingPizzaId = null;
  const nextPizzas = settingsState.pizzas.map(item => (item.id === id ? { ...item, name, description } : item));
  const stored = await persistPizzas(api, nextPizzas, 'Pizza modifiée');
  if (!stored) {
    // Back to the edit form with what was typed, to retry or cancel
    editingPizzaId = id;
    renderPizzasList();
    document.querySelector('#pizzas-list .pizza-edit-name').value = name;
    document.querySelector('#pizzas-list .pizza-edit-desc').value = description;
  }
  return stored;
}

/**
 * Delete a pizza after a confirmation (which says how many members chose it)
 * @param {Function} api - API function
 * @param {string} id - Pizza id
 */
export function deletePizza(api, id) {
  const pizza = findPizza(id);
  if (!pizza || pizzaSaving) return;

  if (isProtectedPizza(pizza)) {
    toastError('Le choix « pas de pizza » ne peut pas être supprimé');
    return;
  }

  const chosen = countMembersWithPizza(id);
  let warning = '';
  if (chosen === 1) warning = ' 1 participant a choisi cette pizza; son choix sera conservé.';
  else if (chosen > 1) warning = ` ${chosen} participants ont choisi cette pizza; leur choix sera conservé.`;

  confirmAction({
    message: `Supprimer la pizza "${pizza.name}" ?${warning}`,
    confirmLabel: 'Supprimer',
    onConfirm: () => {
      if (editingPizzaId === id) editingPizzaId = null;
      return persistPizzas(api, settingsState.pizzas.filter(item => item.id !== id), 'Pizza supprimée');
    }
  });
}

/**
 * Handle clicks and keys inside the pizza list (one listener, set once)
 * @param {Function} api - API function
 */
function bindPizzasList(api) {
  const container = $('pizzas-list');
  if (!container) return;

  container.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-pizza-action]');
    if (!button || !container.contains(button)) return;
    const { pizzaAction, pizzaId } = button.dataset;

    if (pizzaAction === 'edit') startPizzaEdit(pizzaId);
    else if (pizzaAction === 'cancel-edit') cancelPizzaEdit();
    else if (pizzaAction === 'save-edit') savePizzaEdit(api, pizzaId);
    else if (pizzaAction === 'delete') deletePizza(api, pizzaId);
  });

  container.addEventListener('keydown', (event) => {
    if (editingPizzaId === null || !event.target.matches?.('.pizza-edit-name, .pizza-edit-desc')) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      savePizzaEdit(api, editingPizzaId);
    } else if (event.key === 'Escape') {
      cancelPizzaEdit();
    }
  });
}

// ============================================================
// SETTINGS FORM (saved together by the "Enregistrer" button)
// ============================================================

/**
 * Mark settings as dirty
 */
export function markDirty() {
  settingsState.isDirty = true;
  updateSaveButton();
}

/**
 * Update save button state
 */
export function updateSaveButton() {
  const saveBtn = $('save-settings-btn');
  if (saveBtn) {
    saveBtn.disabled = !settingsState.isDirty;
    saveBtn.textContent = settingsState.isDirty ? 'Enregistrer *' : 'Enregistrer';
  }
  $('settings-dirty-hint')?.classList.toggle('hidden', !settingsState.isDirty);
}

/**
 * Convert a price typed in euros to cents; an empty input means the default.
 * Returns NaN for text that is not a number (reported by the caller).
 * @param {string|undefined} value - Input value, in euros
 * @param {number} defaultCents - Price used when the input is empty
 * @returns {number}
 */
function euroInputToCents(value, defaultCents) {
  if (value === undefined || value.trim() === '') return defaultCents;
  const euros = numberOrNull(value);
  return euros === null ? Number.NaN : Math.round(euros * 100);
}

/**
 * Read the settings form. Returns the first problem as `{ error }`.
 * @returns {{ error: string } | { values: object }}
 */
function readSettingsForm() {
  const values = {
    maxTeamSize: numberOrNull($('setting-max-team')?.value),
    maxTotalParticipants: numberOrNull($('setting-max-participants')?.value),
    minTeamSize: numberOrNull($('setting-min-team')?.value),
    schoolName: $('setting-school-name')?.value?.trim() || DEFAULT_SCHOOL_NAME,
    // On-site pricing (convert euros to cents)
    priceAssoMember: euroInputToCents($('setting-price-asso-member')?.value, DEFAULT_PRICES.assoMember),
    priceNonMember: euroInputToCents($('setting-price-non-member')?.value, DEFAULT_PRICES.nonMember),
    priceLate: euroInputToCents($('setting-price-late')?.value, DEFAULT_PRICES.late),
    lateCutoffTime: $('setting-late-cutoff')?.value || DEFAULT_LATE_CUTOFF_TIME,
    gdprRetentionYears: numberOrNull($('setting-gdpr-retention')?.value) || DEFAULT_GDPR_RETENTION_YEARS
  };

  const { maxTeamSize, maxTotalParticipants, minTeamSize } = values;
  if (!Number.isInteger(maxTeamSize) || maxTeamSize < 1 || maxTeamSize > 100) {
    return { error: 'Taille max d\'équipe invalide (1-100)' };
  }
  if (!Number.isInteger(maxTotalParticipants) || maxTotalParticipants < 1 || maxTotalParticipants > 10_000) {
    return { error: 'Participants max invalide (1-10000)' };
  }
  if (!Number.isInteger(minTeamSize) || minTeamSize < 1 || minTeamSize > 50) {
    return { error: 'Taille min d\'équipe invalide (1-50)' };
  }
  if (Number.isNaN(values.priceAssoMember) || values.priceAssoMember < 0) return { error: 'Prix membre asso invalide' };
  if (Number.isNaN(values.priceNonMember) || values.priceNonMember < 0) return { error: 'Prix non-membre invalide' };
  if (Number.isNaN(values.priceLate) || values.priceLate < 0) return { error: 'Prix retardataire invalide' };

  return { values };
}

/**
 * Save the settings form to API (the pizza catalogue is saved separately)
 * @param {Function} api - API function
 */
export async function saveSettings(api) {
  const { error, values } = readSettingsForm();
  if (error) {
    toastError(error);
    return;
  }

  try {
    const saveBtn = $('save-settings-btn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Enregistrement...';
    }

    await api(SETTINGS_PATH, {
      method: 'PUT',
      body: JSON.stringify({
        max_team_size: values.maxTeamSize,
        max_total_participants: values.maxTotalParticipants,
        min_team_size: values.minTeamSize,
        school_name: values.schoolName,
        price_asso_member: values.priceAssoMember,
        price_non_member: values.priceNonMember,
        price_late: values.priceLate,
        late_cutoff_time: values.lateCutoffTime,
        gdpr_retention_years: values.gdprRetentionYears
      })
    });

    // Update local state
    settingsState.isDirty = false;
    settingsState.maxTeamSize = values.maxTeamSize;
    settingsState.maxTotalParticipants = values.maxTotalParticipants;
    settingsState.minTeamSize = values.minTeamSize;
    settingsState.schoolName = values.schoolName;
    settingsState.gdprRetentionYears = values.gdprRetentionYears;

    pricingSettings.priceAssoMember = values.priceAssoMember;
    pricingSettings.priceNonMember = values.priceNonMember;
    pricingSettings.priceLate = values.priceLate;
    pricingSettings.lateCutoffTime = values.lateCutoffTime;

    updateSaveButton();
    toastSuccess('Paramètres enregistrés');
  } catch (error_) {
    console.error('Error saving settings:', error_);
    toastError(error_.message || 'Erreur lors de la sauvegarde');
    updateSaveButton();
  }
}

/**
 * Initialize settings module
 * @param {Function} api - API function
 */
export function initSettings(api) {
  const settingsInputs = [
    'setting-max-team', 'setting-max-participants', 'setting-min-team', 'setting-school-name',
    'setting-price-asso-member', 'setting-price-non-member', 'setting-price-late', 'setting-late-cutoff',
    'setting-gdpr-retention'
  ];

  for (const id of settingsInputs) {
    const input = $(id);
    if (input) {
      input.addEventListener('change', markDirty);
      input.addEventListener('input', markDirty);
    }
  }

  const saveBtn = $('save-settings-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => saveSettings(api));
  }

  const addPizzaForm = $('add-pizza-form-element');
  if (addPizzaForm) {
    addPizzaForm.addEventListener('submit', (e) => {
      e.preventDefault();
      addPizzaFromForm(api);
    });
  }

  bindPizzasList(api);
}
