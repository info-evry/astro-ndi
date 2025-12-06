/**
 * Registration form handling
 * Form validation, submission, and UI helpers
 */
/* eslint-env browser */

import { isValidEmail } from '../lib/validation.js';
import { escapeHtml } from '../admin/utils.js';
import { state } from './state.js';
import { elements } from './elements.js';
import { submitRegistration } from './api.js';

/**
 * Collect form data
 * @returns {object} Form data object
 */
export function collectFormData() {
  const formData = new FormData(elements.form);
  const data = {
    createNewTeam: state.isNewTeam,
    paymentMethod: formData.get('paymentMethod') || 'delayed',
    members: []
  };

  if (state.isNewTeam) {
    data.teamName = formData.get('teamName');
    data.teamDescription = formData.get('teamDescription');
    data.teamPassword = formData.get('teamPassword');
  } else {
    data.teamId = Number.parseInt(formData.get('teamId'), 10);
    data.teamPassword = formData.get('joinPassword');
  }

  // Collect single member data
  data.members.push({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    email: formData.get('email'),
    bacLevel: Number.parseInt(formData.get('bacLevel'), 10),
    isLeader: state.isNewTeam ? true : formData.get('isLeader') === 'on',
    foodDiet: formData.get('foodDiet') || 'none'
  });

  return data;
}

/**
 * Validate form
 * @returns {string[]} Array of error messages
 */
export function validateForm() {
  const errors = [];
  const data = collectFormData();

  if (state.isNewTeam) {
    if (!data.teamName?.trim()) {
      errors.push("Le nom de l'équipe est requis");
    }
    if (!data.teamPassword?.trim()) {
      errors.push("Le mot de passe de l'équipe est requis");
    } else if (data.teamPassword.length < 4) {
      errors.push("Le mot de passe doit faire au moins 4 caractères");
    }
  } else {
    if (!data.teamId) {
      errors.push("Veuillez sélectionner une équipe");
    }
    if (!data.teamPassword?.trim()) {
      errors.push("Le mot de passe de l'équipe est requis");
    }
  }

  // Validate member
  const member = data.members[0];
  if (!member.firstName?.trim()) errors.push("Prénom requis");
  if (!member.lastName?.trim()) errors.push("Nom requis");
  if (!member.email?.trim()) errors.push("Email requis");
  else if (!isValidEmail(member.email)) errors.push("Email invalide");

  return errors;
}

/**
 * Handle form submission
 * @param {Event} e - Submit event
 */
export async function handleSubmit(e) {
  e.preventDefault();

  if (state.isAtCapacity) {
    showErrors(['Les inscriptions sont closes']);
    return;
  }

  const errors = validateForm();
  if (errors.length > 0) {
    showErrors(errors);
    return;
  }

  hideErrors();
  setLoading(true);

  try {
    const data = collectFormData();
    const result = await submitRegistration(data);

    elements.successMessage.textContent = result.message;
    elements.successModal.classList.remove('hidden');

  } catch (error) {
    showErrors([error.message]);
  } finally {
    setLoading(false);
  }
}

/**
 * Show error messages
 * @param {string[]} errors - Array of error messages
 */
export function showErrors(errors) {
  const listItems = errors.map(e => `<li>${escapeHtml(e)}</li>`).join('');
  elements.errorsDiv.innerHTML = `<ul>${listItems}</ul>`;
  elements.errorsDiv.classList.remove('hidden');
  elements.errorsDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * Hide error messages
 */
export function hideErrors() {
  elements.errorsDiv.classList.add('hidden');
}

/**
 * Set loading state
 * @param {boolean} loading - Loading state
 */
export function setLoading(loading) {
  elements.submitBtn.disabled = loading;
  elements.form.classList.toggle('loading', loading);
  elements.submitBtn.textContent = loading ? 'Inscription en cours...' : "S'inscrire";
}
