/* global document */
/**
 * Settings tab: every catalogue save says which list it was made from, and a
 * save the server refuses because the list changed meanwhile (another tab,
 * another organiser) reloads the stored list instead of overwriting it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flush, MODALS_HTML } from './helpers.js';

let settings;

const NONE = { id: '0-rien', name: 'Aucune', description: '' };
const REINE = { id: 'reine', name: 'Reine', description: '' };
const CHEVRE = { id: 'chevre', name: 'Chèvre', description: '' };

const ids = () => [...document.querySelectorAll('#pizzas-list .pizza-item')].map(item => item.dataset.pizzaId);
const lastToast = () => [...document.querySelectorAll('.toast')].at(-1);
const clone = (value) => JSON.parse(JSON.stringify(value));

/** A server that enforces `pizzas_expected` like the worker does. */
function strictApi(initial) {
  let stored = clone(initial);
  const api = vi.fn(async (path, options = {}) => {
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body);
      if (JSON.stringify(body.pizzas_expected) !== JSON.stringify(stored)) {
        throw Object.assign(new Error('La liste des pizzas a été modifiée entre-temps'), { status: 409, code: 'stale_pizzas' });
      }
      stored = body.pizzas;
      return { success: true };
    }
    return { settings: { pizzas: clone(stored) } };
  });
  api.setStored = (list) => { stored = clone(list); };
  api.stored = () => stored;
  api.puts = () => api.mock.calls.filter(([, options]) => options?.method === 'PUT');
  return api;
}

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = `
    <button type="button" id="save-settings-btn" disabled>Enregistrer</button>
    <div id="pizzas-list"></div>
    <form id="add-pizza-form-element">
      <input id="new-pizza-id"><input id="new-pizza-name"><input id="new-pizza-desc">
      <button type="submit">Ajouter</button>
    </form>
    ${MODALS_HTML}`;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  settings = await import('../../src/client/admin/settings.js');
});

afterEach(() => {
  document.body.innerHTML = '';
});

async function load(api) {
  await settings.loadSettings(api);
  settings.initSettings(api);
}

describe('catalogue saves are based on the list shown', () => {
  it('each add, edit and delete sends the list it was made from', async () => {
    const api = strictApi([NONE, REINE]);
    await load(api);

    document.getElementById('new-pizza-id').value = 'chevre';
    document.getElementById('new-pizza-name').value = 'Chèvre';
    await settings.addPizzaFromForm(api);
    expect(JSON.parse(api.puts()[0][1].body).pizzas_expected).toEqual([NONE, REINE]);

    document.querySelector('[data-pizza-id="reine"] .delete-pizza-btn').click();
    document.getElementById('confirm-delete-btn').click();
    await flush();
    expect(JSON.parse(api.puts()[1][1].body).pizzas_expected).toEqual([NONE, REINE, CHEVRE]);
    expect(api.stored()).toEqual([NONE, CHEVRE]);
  });

  it('a save refused because the list changed elsewhere reloads the stored list and keeps the other change', async () => {
    const api = strictApi([NONE, REINE]);
    await load(api);
    // another organiser adds Chèvre meanwhile
    api.setStored([NONE, REINE, CHEVRE]);

    document.querySelector('[data-pizza-id="reine"] .delete-pizza-btn').click();
    document.getElementById('confirm-delete-btn').click();
    await flush();

    expect(api.stored()).toEqual([NONE, REINE, CHEVRE]);
    expect(ids()).toEqual(['0-rien', 'reine', 'chevre']);
    expect(lastToast().textContent).toContain('modifiée entre-temps');
    expect(lastToast().classList.contains('toast-error') || lastToast().className.includes('error')).toBe(true);
  });

  it('after the reload, the same change goes through', async () => {
    const api = strictApi([NONE, REINE]);
    await load(api);
    api.setStored([NONE, REINE, CHEVRE]);
    document.querySelector('[data-pizza-id="reine"] .delete-pizza-btn').click();
    document.getElementById('confirm-delete-btn').click();
    await flush();

    document.querySelector('[data-pizza-id="reine"] .delete-pizza-btn').click();
    document.getElementById('confirm-delete-btn').click();
    await flush();

    expect(api.stored()).toEqual([NONE, CHEVRE]);
  });
});
