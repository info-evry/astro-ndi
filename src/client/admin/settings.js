/**
 * Settings module - Application configuration
 */
/* eslint-env browser */

import { $, escapeHtml } from './utils.js';
import { toastSuccess, toastError } from './toast.js';
import { settingsState, pricingSettings } from './state.js';

/**
 * Load settings from API
 * @param {Function} api - API function
 */
export async function loadSettings(api) {
  try {
    const data = await api('/admin/settings', { method: 'GET' });

    settingsState.maxTeamSize = Number.parseInt(data.settings.max_team_size, 10) || 15;
    settingsState.maxTotalParticipants = Number.parseInt(data.settings.max_total_participants, 10) || 200;
    settingsState.minTeamSize = Number.parseInt(data.settings.min_team_size, 10) || 1;
    settingsState.schoolName = data.settings.school_name || "Université d'Evry";
    settingsState.pizzas = data.settings.pizzas || [];
    settingsState.bacLevels = data.settings.bac_levels || [];
    settingsState.isDirty = false;

    // On-site pricing settings
    pricingSettings.priceAssoMember = Number.parseInt(data.settings.price_asso_member, 10) || 500;
    pricingSettings.priceNonMember = Number.parseInt(data.settings.price_non_member, 10) || 800;
    pricingSettings.priceLate = Number.parseInt(data.settings.price_late, 10) || 1000;
    pricingSettings.lateCutoffTime = data.settings.late_cutoff_time || '19:00';

    // Online payment settings
    pricingSettings.paymentEnabled = data.settings.payment_enabled === 'true' || data.settings.payment_enabled === true;
    pricingSettings.priceTier1 = Number.parseInt(data.settings.price_tier1, 10) || 500;
    pricingSettings.priceTier2 = Number.parseInt(data.settings.price_tier2, 10) || 700;
    pricingSettings.tier1CutoffDays = Number.parseInt(data.settings.tier1_cutoff_days, 10) || 7;
    pricingSettings.registrationDeadline = data.settings.registration_deadline || '';

    // GDPR settings
    settingsState.gdprRetentionYears = Number.parseInt(data.settings.gdpr_retention_years, 10) || 3;

    renderSettings();
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

/**
 * Render settings form
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- Many form fields require individual null checks
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

  // Online payment settings
  const paymentEnabledInput = $('setting-payment-enabled');
  const priceTier1Input = $('setting-price-tier1');
  const priceTier2Input = $('setting-price-tier2');
  const tier1CutoffDaysInput = $('setting-tier1-cutoff-days');
  const registrationDeadlineInput = $('setting-registration-deadline');

  if (paymentEnabledInput) paymentEnabledInput.checked = pricingSettings.paymentEnabled;
  if (priceTier1Input) priceTier1Input.value = (pricingSettings.priceTier1 / 100).toFixed(2);
  if (priceTier2Input) priceTier2Input.value = (pricingSettings.priceTier2 / 100).toFixed(2);
  if (tier1CutoffDaysInput) tier1CutoffDaysInput.value = pricingSettings.tier1CutoffDays;
  if (registrationDeadlineInput && pricingSettings.registrationDeadline) {
    const deadline = new Date(pricingSettings.registrationDeadline);
    if (!Number.isNaN(deadline.getTime())) {
      const localDatetime = deadline.toISOString().slice(0, 16);
      registrationDeadlineInput.value = localDatetime;
    }
  }

  // GDPR settings
  const gdprRetentionInput = $('setting-gdpr-retention');
  if (gdprRetentionInput) gdprRetentionInput.value = settingsState.gdprRetentionYears || 3;

  renderPizzasList();
  updateSaveButton();
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

  container.innerHTML = settingsState.pizzas.map((pizza, index) => `
    <div class="pizza-item" data-index="${index}">
      <div class="pizza-item-info">
        <span class="pizza-item-id">${escapeHtml(pizza.id)}</span>
        <span class="pizza-item-name">${escapeHtml(pizza.name)}</span>
        <span class="pizza-item-desc">${escapeHtml(pizza.description || '')}</span>
      </div>
      <div class="pizza-item-actions action-buttons">
        <button type="button" class="icon-btn sm edit-pizza-btn" data-index="${index}" title="Modifier" aria-label="Modifier la pizza">􀈊</button>
        <button type="button" class="icon-btn sm danger delete-pizza-btn" data-index="${index}" title="Supprimer" aria-label="Supprimer la pizza">􀈑</button>
      </div>
    </div>
  `).join('');

  for (const btn of container.querySelectorAll('.edit-pizza-btn')) {
    btn.addEventListener('click', () => editPizza(Number.parseInt(btn.dataset.index, 10)));
  }

  for (const btn of container.querySelectorAll('.delete-pizza-btn')) {
    btn.addEventListener('click', () => deletePizza(Number.parseInt(btn.dataset.index, 10)));
  }
}

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
}

/**
 * Add pizza from form
 */
export function addPizzaFromForm() {
  const idInput = $('new-pizza-id');
  const nameInput = $('new-pizza-name');
  const descInput = $('new-pizza-desc');

  if (!idInput || !nameInput) return;

  const id = idInput.value.trim().toLowerCase().replaceAll(/\s+/g, '_');
  const name = nameInput.value.trim();
  const description = descInput?.value.trim() || '';

  if (!id || !name) {
    toastError('ID et nom requis');
    return;
  }

  if (settingsState.pizzas.some(p => p.id === id)) {
    toastError('Une pizza avec cet ID existe déjà');
    return;
  }

  settingsState.pizzas.push({ id, name, description });
  markDirty();
  renderPizzasList();

  idInput.value = '';
  nameInput.value = '';
  if (descInput) descInput.value = '';

  toastSuccess('Pizza ajoutée (non sauvegardée)');
}

/**
 * Edit pizza
 * @param {number} index - Pizza index
 */
export function editPizza(index) {
  const pizza = settingsState.pizzas[index];
  if (!pizza) return;

  const newName = prompt('Nom de la pizza:', pizza.name);
  if (newName === null) return;

  const newDesc = prompt('Description:', pizza.description || '');
  if (newDesc === null) return;

  settingsState.pizzas[index] = {
    ...pizza,
    name: newName.trim() || pizza.name,
    description: newDesc.trim()
  };

  markDirty();
  renderPizzasList();
}

/**
 * Delete pizza
 * @param {number} index - Pizza index
 */
export function deletePizza(index) {
  const pizza = settingsState.pizzas[index];
  if (!pizza) return;

  if (!confirm(`Supprimer la pizza "${pizza.name}" ?`)) return;

  settingsState.pizzas.splice(index, 1);
  markDirty();
  renderPizzasList();
}

/**
 * Save settings to API
 * @param {Function} api - API function
 */
export async function saveSettings(api) {
  try {
    const maxTeamSize = Number.parseInt($('setting-max-team')?.value, 10);
    const maxTotalParticipants = Number.parseInt($('setting-max-participants')?.value, 10);
    const minTeamSize = Number.parseInt($('setting-min-team')?.value, 10);
    const schoolName = $('setting-school-name')?.value?.trim() || "Université d'Evry";

    // On-site pricing (convert euros to cents)
    const priceAssoMember = Math.round(Number.parseFloat($('setting-price-asso-member')?.value || '5') * 100);
    const priceNonMember = Math.round(Number.parseFloat($('setting-price-non-member')?.value || '8') * 100);
    const priceLate = Math.round(Number.parseFloat($('setting-price-late')?.value || '10') * 100);
    const lateCutoffTime = $('setting-late-cutoff')?.value || '19:00';

    // Online payment settings
    const paymentEnabled = $('setting-payment-enabled')?.checked || false;
    const priceTier1 = Math.round(Number.parseFloat($('setting-price-tier1')?.value || '5') * 100);
    const priceTier2 = Math.round(Number.parseFloat($('setting-price-tier2')?.value || '7') * 100);
    const tier1CutoffDays = Number.parseInt($('setting-tier1-cutoff-days')?.value, 10) || 7;
    const registrationDeadlineValue = $('setting-registration-deadline')?.value || '';
    const registrationDeadline = registrationDeadlineValue ? new Date(registrationDeadlineValue).toISOString() : '';

    // GDPR settings
    const gdprRetentionYears = Number.parseInt($('setting-gdpr-retention')?.value, 10) || 3;

    // Validation
    if (Number.isNaN(maxTeamSize) || maxTeamSize < 1 || maxTeamSize > 100) {
      toastError('Taille max d\'équipe invalide (1-100)');
      return;
    }
    if (Number.isNaN(maxTotalParticipants) || maxTotalParticipants < 1 || maxTotalParticipants > 10_000) {
      toastError('Participants max invalide (1-10000)');
      return;
    }
    if (Number.isNaN(minTeamSize) || minTeamSize < 1 || minTeamSize > 50) {
      toastError('Taille min d\'équipe invalide (1-50)');
      return;
    }
    if (Number.isNaN(priceAssoMember) || priceAssoMember < 0) {
      toastError('Prix membre asso invalide');
      return;
    }
    if (Number.isNaN(priceNonMember) || priceNonMember < 0) {
      toastError('Prix non-membre invalide');
      return;
    }
    if (Number.isNaN(priceLate) || priceLate < 0) {
      toastError('Prix retardataire invalide');
      return;
    }
    if (Number.isNaN(priceTier1) || priceTier1 < 0) {
      toastError('Prix anticipé invalide');
      return;
    }
    if (Number.isNaN(priceTier2) || priceTier2 < 0) {
      toastError('Prix dernière semaine invalide');
      return;
    }
    if (Number.isNaN(tier1CutoffDays) || tier1CutoffDays < 1 || tier1CutoffDays > 30) {
      toastError('Jours avant deadline invalide (1-30)');
      return;
    }

    const saveBtn = $('save-settings-btn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Enregistrement...';
    }

    await api('/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({
        max_team_size: maxTeamSize,
        max_total_participants: maxTotalParticipants,
        min_team_size: minTeamSize,
        school_name: schoolName,
        pizzas: settingsState.pizzas,
        price_asso_member: priceAssoMember,
        price_non_member: priceNonMember,
        price_late: priceLate,
        late_cutoff_time: lateCutoffTime,
        payment_enabled: paymentEnabled,
        price_tier1: priceTier1,
        price_tier2: priceTier2,
        tier1_cutoff_days: tier1CutoffDays,
        registration_deadline: registrationDeadline,
        gdpr_retention_years: gdprRetentionYears
      })
    });

    // Update local state
    settingsState.isDirty = false;
    settingsState.maxTeamSize = maxTeamSize;
    settingsState.maxTotalParticipants = maxTotalParticipants;
    settingsState.minTeamSize = minTeamSize;
    settingsState.schoolName = schoolName;

    pricingSettings.priceAssoMember = priceAssoMember;
    pricingSettings.priceNonMember = priceNonMember;
    pricingSettings.priceLate = priceLate;
    pricingSettings.lateCutoffTime = lateCutoffTime;
    pricingSettings.paymentEnabled = paymentEnabled;
    pricingSettings.priceTier1 = priceTier1;
    pricingSettings.priceTier2 = priceTier2;
    pricingSettings.tier1CutoffDays = tier1CutoffDays;
    pricingSettings.registrationDeadline = registrationDeadline;

    updateSaveButton();
    toastSuccess('Paramètres enregistrés');
  } catch (error) {
    console.error('Error saving settings:', error);
    toastError(error.message || 'Erreur lors de la sauvegarde');
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
    'setting-payment-enabled', 'setting-price-tier1', 'setting-price-tier2',
    'setting-tier1-cutoff-days', 'setting-registration-deadline'
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
      addPizzaFromForm();
    });
  }
}
