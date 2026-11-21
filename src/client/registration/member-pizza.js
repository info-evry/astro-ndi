/**
 * Pizza of each member in the team view: shown by name, and editable with the
 * team's code secret while the organisers keep the changes open and the pizza
 * has not been handed out.
 */
/* eslint-env browser */

import { escapeHtml } from '@info-evry/astro-design/scripts/dom';
import { NO_PIZZA_ID, isNoPizza } from '../../shared/constants.js';
import { state } from './state.js';
import { changeMemberPizza } from './api.js';

const MSG_SAVED = 'Pizza enregistrée';
const MSG_CLOSED = 'Modifications closes';
const MSG_GIVEN = 'Pizza remise';

const GENERIC_ERROR = 'Impossible de changer la pizza';

/** Rows being saved: the same change is never sent twice. */
const saving = new Set();

/**
 * Id as the catalogue knows it: "no pizza" has several spellings in stored data.
 * @param {unknown} foodDiet
 * @returns {string}
 */
function normalizeChoice(foodDiet) {
  return isNoPizza(foodDiet) ? NO_PIZZA_ID : String(foodDiet);
}

/**
 * Name of a pizza for display: the catalogue's, else the stored id as is.
 * @param {Array<{id: string, name: string}>} pizzas
 * @param {unknown} foodDiet
 * @returns {string} empty when the member has no pizza
 */
export function pizzaName(pizzas, foodDiet) {
  if (isNoPizza(foodDiet)) return '';
  return pizzas.find(p => p.id === foodDiet)?.name ?? String(foodDiet);
}

function optionsHtml(pizzas, current) {
  const options = pizzas.map(p =>
    `<option value="${escapeHtml(p.id)}"${p.id === current ? ' selected' : ''}>${escapeHtml(p.name)}</option>`);
  // A pizza that left the catalogue stays selectable as what it is: not lost, not silently replaced
  if (!pizzas.some(p => p.id === current)) {
    options.unshift(`<option value="${escapeHtml(current)}" selected>${escapeHtml(current)} (n'est plus proposée)</option>`);
  }
  return options.join('');
}

/**
 * Pizza part of a member row.
 * @param {object} member - `{ id, firstName, lastName, foodDiet, pizzaReceived }`
 * @param {{ pizzas: Array<{id: string, name: string}>, open: boolean }} context
 * @returns {string} HTML
 */
export function renderMemberPizza(member, { pizzas, open }) {
  const label = pizzaName(pizzas, member.foodDiet);
  const display = label ? `<span class="member-food">${escapeHtml(label)}</span>` : '';

  if (member.pizzaReceived) return `${display}<span class="member-pizza-note">${MSG_GIVEN}</span>`;
  if (!open) return `${display}<span class="member-pizza-note">${MSG_CLOSED}</span>`;

  const current = normalizeChoice(member.foodDiet);
  const who = `${member.firstName} ${member.lastName}`.trim();
  return `
    <span class="member-pizza">
      <select class="member-pizza-select" data-member-id="${member.id}" data-current="${escapeHtml(current)}"
        aria-label="Pizza de ${escapeHtml(who)}">${optionsHtml(pizzas, current)}</select>
      <button type="button" class="btn btn-secondary btn-sm member-pizza-save" data-member-id="${member.id}" disabled>Enregistrer</button>
      <span class="member-pizza-status" role="status"></span>
    </span>`;
}

function rowParts(row) {
  return {
    select: row.querySelector('.member-pizza-select'),
    save: row.querySelector('.member-pizza-save'),
    status: row.querySelector('.member-pizza-status')
  };
}

function onChoice(select) {
  const { save, status } = rowParts(select.closest('.member-item'));
  save.disabled = select.value === select.dataset.current;
  status.textContent = '';
  status.classList.remove('error');
}

async function onSave(button) {
  const row = button.closest('.member-item');
  const memberId = Number.parseInt(button.dataset.memberId, 10);
  const { select, save, status } = rowParts(row);
  if (saving.has(memberId) || !state.teamSecret || !state.selectedTeamId) return;

  saving.add(memberId);
  save.disabled = true;
  select.disabled = true;
  status.classList.remove('error');
  status.textContent = '';
  try {
    const { member } = await changeMemberPizza(state.selectedTeamId, memberId, state.teamSecret, select.value);
    select.dataset.current = normalizeChoice(member?.foodDiet ?? select.value);
    status.textContent = MSG_SAVED;
  } catch (error) {
    status.classList.add('error');
    status.textContent = error.message || GENERIC_ERROR;
  } finally {
    saving.delete(memberId);
    select.disabled = false;
    save.disabled = select.value === select.dataset.current;
  }
}

/**
 * Put every select on the pizza the member has (after the rows are inserted:
 * the property is the one source of truth, not the markup).
 * @param {HTMLElement} list
 */
export function syncMemberPizza(list) {
  for (const select of list.querySelectorAll('.member-pizza-select')) select.value = select.dataset.current;
}

/**
 * Wire the pizza controls of a members list (one delegated listener each).
 * @param {HTMLElement} list
 */
export function bindMemberPizza(list) {
  list.addEventListener('change', (event) => {
    if (event.target.matches('.member-pizza-select')) onChoice(event.target);
  });
  list.addEventListener('click', (event) => {
    const button = event.target.closest('.member-pizza-save');
    if (button) onSave(button);
  });
}
