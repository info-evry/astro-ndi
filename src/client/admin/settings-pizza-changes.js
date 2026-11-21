/**
 * Switch "participants may change their own pizza" (setting `pizza_changes_open`).
 *
 * Saved at once and on its own, like the pizza catalogue: closing it is an
 * action the organisers take when the pizza order goes out, not a field to
 * remember to save.
 */

import { $ } from '@info-evry/astro-design/scripts/dom';
import { toastSuccess, toastError } from '@info-evry/astro-design/scripts/toast';
import { settingsState } from './state.js';

const SETTINGS_PATH = '/admin/settings';

const HINT_OPEN = 'Modifications ouvertes : une équipe peut changer la pizza de ses membres avec son code secret, tant que la pizza n\'est pas remise.';
const HINT_CLOSED = 'Modifications closes : les équipes ne peuvent plus changer leurs pizzas (vous pouvez toujours le faire ici, dans les équipes).';

/**
 * Stored value to a boolean: open unless explicitly "false".
 * @param {unknown} raw
 * @returns {boolean}
 */
export function parsePizzaChangesOpen(raw) {
  return raw !== 'false' && raw !== false;
}

/** Show the stored state in the switch and its explanation. */
export function renderPizzaChanges() {
  const toggle = $('setting-pizza-changes-open');
  if (toggle) toggle.checked = settingsState.pizzaChangesOpen;
  const hint = $('pizza-changes-hint');
  if (hint) hint.textContent = settingsState.pizzaChangesOpen ? HINT_OPEN : HINT_CLOSED;
}

async function save(api, toggle) {
  const next = toggle.checked;
  toggle.disabled = true;
  try {
    await api(SETTINGS_PATH, { method: 'PUT', body: JSON.stringify({ pizza_changes_open: next }) });
    settingsState.pizzaChangesOpen = next;
    toastSuccess(next ? 'Les équipes peuvent changer leurs pizzas' : 'Les modifications de pizza sont closes');
  } catch (error) {
    console.error('Error saving pizza_changes_open:', error);
    toastError(error?.message ? `Non enregistré : ${error.message}` : 'Erreur lors de l\'enregistrement');
  } finally {
    toggle.disabled = false;
    renderPizzaChanges();
  }
}

/**
 * @param {Function} api - API function
 */
export function bindPizzaChanges(api) {
  const toggle = $('setting-pizza-changes-open');
  toggle?.addEventListener('change', () => save(api, toggle));
}
