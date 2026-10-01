/* global document, window, KeyboardEvent */
/**
 * Settings tab: the pizza catalogue is persisted item by item (one
 * `PUT /admin/settings` carrying only `pizzas` per change), edited inline
 * (no browser dialogs), and the no-pizza entry cannot be deleted. The rest of
 * the form keeps its own save button.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flush, MODALS_HTML, sampleTeams } from './helpers.js';

let state;
let settings;
let dialogs;

const byId = (id) => document.getElementById(id);
const items = () => [...document.querySelectorAll('#pizzas-list .pizza-item')];
const ids = () => items().map(item => item.dataset.pizzaId);
const click = (selector) => document.querySelector(selector).click();
const lastToast = () => [...document.querySelectorAll('.toast')].at(-1);

const clone = (value) => JSON.parse(JSON.stringify(value));

const CATALOGUE = [
  { id: '0-rien', name: 'Aucune', description: '' },
  { id: 'reine', name: 'Reine', description: 'Tomate, jambon' },
  { id: 'chevre', name: 'Chèvre', description: 'Miel' }
];

/** An API double that stores the pizzas it receives, like the server does. */
function fakeApi({ failPut = false } = {}) {
  let stored = clone(CATALOGUE);
  const api = vi.fn(async (path, options = {}) => {
    if (options.method === 'PUT') {
      if (failPut) throw new Error('Le serveur est indisponible');
      stored = JSON.parse(options.body).pizzas ?? stored;
      return { success: true };
    }
    return { settings: { pizzas: clone(stored) } };
  });
  api.stored = () => stored;
  api.puts = () => api.mock.calls.filter(([, options]) => options?.method === 'PUT');
  return api;
}

async function loadCatalogue(api) {
  await settings.loadSettings(api);
  settings.initSettings(api);
  api.mockClear();
}

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = `
    <button type="button" id="save-settings-btn" disabled>Enregistrer</button>
    <span id="settings-dirty-hint" class="hidden">Modifications non enregistrées</span>
    <input id="setting-max-team" value="15"><input id="setting-max-participants" value="200"><input id="setting-min-team" value="1">
    <input id="setting-school-name" value="École"><input id="setting-price-asso-member" value="5.00">
    <input id="setting-price-non-member" value="8.00"><input id="setting-price-late" value="10.00">
    <input id="setting-late-cutoff" value="19:00"><input id="setting-gdpr-retention" value="3">
    <div id="pizzas-list"></div>
    <form id="add-pizza-form-element">
      <input id="new-pizza-id"><input id="new-pizza-name"><input id="new-pizza-desc">
      <button type="submit">Ajouter</button>
    </form>
    ${MODALS_HTML}`;
  dialogs = { prompt: vi.fn(() => null), confirm: vi.fn(() => true), alert: vi.fn() };
  for (const [name, fn] of Object.entries(dialogs)) vi.stubGlobal(name, fn);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  state = await import('../../src/client/admin/state.js');
  settings = await import('../../src/client/admin/settings.js');
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('deleting a pizza', () => {
  it('persists at once with one PUT carrying only the pizzas, then shows what the server stores', async () => {
    const api = fakeApi();
    await loadCatalogue(api);
    expect(ids()).toEqual(['0-rien', 'reine', 'chevre']);

    click('[data-pizza-id="reine"] .delete-pizza-btn');
    expect(byId('confirm-modal').classList.contains('hidden')).toBe(false);
    expect(byId('confirm-message').textContent).toBe('Supprimer la pizza "Reine" ?');
    expect(api).not.toHaveBeenCalled();

    byId('confirm-delete-btn').click();
    await flush();

    expect(api.puts()).toHaveLength(1);
    const [path, options] = api.puts()[0];
    expect(path).toBe('/admin/settings');
    expect(JSON.parse(options.body)).toEqual({ pizzas: [CATALOGUE[0], CATALOGUE[2]] });
    expect(api.mock.calls.at(-1)).toEqual(['/admin/settings', { method: 'GET' }]);
    expect(ids()).toEqual(['0-rien', 'chevre']);
    expect(lastToast().textContent).toBe('Pizza supprimée');
    expect(byId('confirm-modal').classList.contains('hidden')).toBe(true);

    // the other tabs read the same, up-to-date catalogue
    expect(state.pizzasConfig.map(p => p.id)).toEqual(['0-rien', 'chevre']);
    // the form's save button is not involved
    expect(state.settingsState.isDirty).toBe(false);
    expect(byId('save-settings-btn').disabled).toBe(true);
  });

  it('rolls the list back and shows an error when the request fails', async () => {
    const api = fakeApi({ failPut: true });
    await loadCatalogue(api);

    click('[data-pizza-id="chevre"] .delete-pizza-btn');
    byId('confirm-delete-btn').click();
    await flush();

    expect(api.puts()).toHaveLength(1);
    expect(ids()).toEqual(['0-rien', 'reine', 'chevre']);
    expect(state.settingsState.pizzas).toHaveLength(3);
    expect(lastToast().className).toContain('error');
    expect(lastToast().textContent).toBe('Pizzas non enregistrées : Le serveur est indisponible');
    expect(document.querySelectorAll('#pizzas-list button:disabled')).toHaveLength(0);
  });

  it('does not offer to delete the no-pizza entry, and refuses if asked anyway', async () => {
    const api = fakeApi();
    await loadCatalogue(api);

    const sentinel = document.querySelector('[data-pizza-id="0-rien"]');
    expect(sentinel.querySelector('.delete-pizza-btn')).toBeNull();
    expect(sentinel.querySelector('.pizza-item-lock').textContent).toBe('Verrouillée');
    expect(sentinel.querySelector('.edit-pizza-btn')).not.toBeNull();

    settings.deletePizza(api, '0-rien');
    settings.deletePizza(api, 'none');
    expect(byId('confirm-modal').classList.contains('hidden')).toBe(true);
    expect(api).not.toHaveBeenCalled();
    expect(ids()).toContain('0-rien');
  });

  it.each([
    [2, 'Supprimer la pizza "Reine" ? 2 participants ont choisi cette pizza; leur choix sera conservé.'],
    [1, 'Supprimer la pizza "Reine" ? 1 participant a choisi cette pizza; son choix sera conservé.']
  ])('warns when %i registered member(s) chose the pizza, and still deletes on confirm', async (count, message) => {
    const api = fakeApi();
    await loadCatalogue(api);
    const teams = sampleTeams();
    teams[0].members[0].food_diet = 'reine';
    teams[0].members[1].food_diet = count === 2 ? 'reine' : 'chevre';
    state.setTeamsData(teams);

    click('[data-pizza-id="reine"] .delete-pizza-btn');
    expect(byId('confirm-message').textContent).toBe(message);

    byId('confirm-delete-btn').click();
    await flush();
    expect(ids()).toEqual(['0-rien', 'chevre']);
    expect(api.puts()).toHaveLength(1);
  });

  it('disables every pizza control while the change is being saved', async () => {
    const api = fakeApi();
    await loadCatalogue(api);
    let release;
    api.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));

    click('[data-pizza-id="reine"] .delete-pizza-btn');
    byId('confirm-delete-btn').click();
    await flush();

    expect(ids()).toEqual(['0-rien', 'chevre']);
    expect(document.querySelectorAll('#pizzas-list button:not(:disabled)')).toHaveLength(0);
    expect(document.querySelector('#add-pizza-form-element button[type="submit"]').disabled).toBe(true);

    release({ success: true });
    await flush();
    expect(document.querySelectorAll('#pizzas-list button:disabled')).toHaveLength(0);
    expect(document.querySelector('#add-pizza-form-element button[type="submit"]').disabled).toBe(false);
  });
});

describe('editing a pizza inline', () => {
  it('saves the new name and description with one PUT carrying only the pizzas', async () => {
    const api = fakeApi();
    await loadCatalogue(api);

    click('[data-pizza-id="reine"] .edit-pizza-btn');
    const card = document.querySelector('[data-pizza-id="reine"]');
    expect(card.querySelector('.pizza-item-id').textContent).toBe('reine');
    expect(card.querySelector('.pizza-edit-name').value).toBe('Reine');
    card.querySelector('.pizza-edit-name').value = '  Reine royale ';
    card.querySelector('.pizza-edit-desc').value = 'Tomate, jambon, olives';
    card.querySelector('[data-pizza-action="save-edit"]').click();
    await flush();

    expect(api.puts()).toHaveLength(1);
    expect(JSON.parse(api.puts()[0][1].body)).toEqual({
      pizzas: [CATALOGUE[0], { id: 'reine', name: 'Reine royale', description: 'Tomate, jambon, olives' }, CATALOGUE[2]]
    });
    expect(document.querySelector('.pizza-edit-name')).toBeNull();
    expect(document.querySelector('[data-pizza-id="reine"] .pizza-item-name').textContent).toBe('Reine royale');
    expect(lastToast().textContent).toBe('Pizza modifiée');
  });

  it('saves with Enter and cancels with Escape or Annuler, without any request', async () => {
    const api = fakeApi();
    await loadCatalogue(api);

    click('[data-pizza-id="reine"] .edit-pizza-btn');
    document.querySelector('.pizza-edit-name').value = 'Autre';
    document.querySelector('.pizza-edit-name').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.pizza-edit-name')).toBeNull();
    expect(document.querySelector('[data-pizza-id="reine"] .pizza-item-name').textContent).toBe('Reine');

    click('[data-pizza-id="reine"] .edit-pizza-btn');
    click('[data-pizza-action="cancel-edit"]');
    expect(document.querySelector('.pizza-edit-name')).toBeNull();

    click('[data-pizza-id="chevre"] .edit-pizza-btn');
    document.querySelector('.pizza-edit-desc').value = 'Miel, noix';
    document.querySelector('.pizza-edit-desc').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flush();
    expect(api.puts()).toHaveLength(1);
    expect(JSON.parse(api.puts()[0][1].body).pizzas[2]).toEqual({ id: 'chevre', name: 'Chèvre', description: 'Miel, noix' });
  });

  it('refuses an empty name and does not send an unchanged pizza', async () => {
    const api = fakeApi();
    await loadCatalogue(api);

    click('[data-pizza-id="reine"] .edit-pizza-btn');
    document.querySelector('.pizza-edit-name').value = '   ';
    click('[data-pizza-action="save-edit"]');
    await flush();
    expect(lastToast().textContent).toBe('Le nom de la pizza est requis');
    expect(document.querySelector('.pizza-edit-name')).not.toBeNull();

    document.querySelector('.pizza-edit-name').value = 'Reine';
    click('[data-pizza-action="save-edit"]');
    await flush();
    expect(api).not.toHaveBeenCalled();
    expect(document.querySelector('.pizza-edit-name')).toBeNull();
  });

  it('keeps the edit form and what was typed when the request fails', async () => {
    const api = fakeApi({ failPut: true });
    await loadCatalogue(api);

    click('[data-pizza-id="reine"] .edit-pizza-btn');
    document.querySelector('.pizza-edit-name').value = 'Reine royale';
    click('[data-pizza-action="save-edit"]');
    await flush();

    expect(lastToast().className).toContain('error');
    expect(state.settingsState.pizzas[1].name).toBe('Reine');
    expect(document.querySelector('.pizza-edit-name').value).toBe('Reine royale');
  });

  it('lets the no-pizza entry keep an editable display text', async () => {
    const api = fakeApi();
    await loadCatalogue(api);

    click('[data-pizza-id="0-rien"] .edit-pizza-btn');
    document.querySelector('.pizza-edit-name').value = 'Pas de pizza';
    click('[data-pizza-action="save-edit"]');
    await flush();

    expect(JSON.parse(api.puts()[0][1].body).pizzas[0]).toEqual({ id: '0-rien', name: 'Pas de pizza', description: '' });
  });
});

describe('adding a pizza', () => {
  const fill = (id, name, description = '') => {
    byId('new-pizza-id').value = id;
    byId('new-pizza-name').value = name;
    byId('new-pizza-desc').value = description;
  };
  const submit = async () => {
    click('#add-pizza-form-element button[type="submit"]');
    byId('add-pizza-form-element').dispatchEvent(new window.Event('submit', { cancelable: true }));
    await flush();
  };

  it('persists at once with one PUT carrying only the pizzas, then clears the form', async () => {
    const api = fakeApi();
    await loadCatalogue(api);

    fill('  Quatre Saisons ', ' 4 Saisons ', 'Tout');
    byId('add-pizza-form-element').dispatchEvent(new window.Event('submit', { cancelable: true }));
    await flush();

    expect(api.puts()).toHaveLength(1);
    expect(JSON.parse(api.puts()[0][1].body)).toEqual({
      pizzas: [...CATALOGUE, { id: 'quatre_saisons', name: '4 Saisons', description: 'Tout' }]
    });
    expect(ids().at(-1)).toBe('quatre_saisons');
    expect(lastToast().textContent).toBe('Pizza ajoutée');
    expect([byId('new-pizza-id').value, byId('new-pizza-name').value, byId('new-pizza-desc').value]).toEqual(['', '', '']);
  });

  it('rejects a duplicate id without any request', async () => {
    const api = fakeApi();
    await loadCatalogue(api);

    fill('Reine', 'Une autre reine');
    byId('add-pizza-form-element').dispatchEvent(new window.Event('submit', { cancelable: true }));
    await flush();

    expect(api).not.toHaveBeenCalled();
    expect(lastToast().className).toContain('error');
    expect(lastToast().textContent).toBe('Une pizza avec cet identifiant existe déjà');
    expect(ids()).toEqual(['0-rien', 'reine', 'chevre']);
    expect(byId('new-pizza-name').value).toBe('Une autre reine');
  });

  it.each([['', 'Nom', "L'identifiant et le nom sont requis"], ['x', '  ', "L'identifiant et le nom sont requis"],
    ['x'.repeat(65), 'Nom', "L'identifiant ne doit pas dépasser 64 caractères"]])(
    'rejects id %j / name %j', async (id, name, message) => {
      const api = fakeApi();
      await loadCatalogue(api);

      fill(id, name);
      byId('add-pizza-form-element').dispatchEvent(new window.Event('submit', { cancelable: true }));
      await flush();

      expect(api).not.toHaveBeenCalled();
      expect(lastToast().textContent).toBe(message);
    }
  );

  it('keeps the typed values and the list when the request fails', async () => {
    const api = fakeApi({ failPut: true });
    await loadCatalogue(api);

    fill('nouvelle', 'Nouvelle');
    byId('add-pizza-form-element').dispatchEvent(new window.Event('submit', { cancelable: true }));
    await flush();

    expect(ids()).toEqual(['0-rien', 'reine', 'chevre']);
    expect(byId('new-pizza-id').value).toBe('nouvelle');
    expect(lastToast().className).toContain('error');
    await submit();
    expect(api.puts()).toHaveLength(2);
  });
});

describe('no browser dialogs', () => {
  it('never calls prompt, confirm or alert through the whole pizza flow', async () => {
    const api = fakeApi();
    await loadCatalogue(api);

    click('[data-pizza-id="reine"] .edit-pizza-btn');
    document.querySelector('.pizza-edit-name').value = 'Reine +';
    click('[data-pizza-action="save-edit"]');
    await flush();
    click('[data-pizza-id="chevre"] .delete-pizza-btn');
    byId('confirm-delete-btn').click();
    await flush();
    byId('new-pizza-id').value = 'x';
    byId('new-pizza-name').value = 'X';
    byId('add-pizza-form-element').dispatchEvent(new window.Event('submit', { cancelable: true }));
    await flush();

    expect(api.puts()).toHaveLength(3);
    expect(dialogs.prompt).not.toHaveBeenCalled();
    expect(dialogs.confirm).not.toHaveBeenCalled();
    expect(dialogs.alert).not.toHaveBeenCalled();
  });
});

describe('the settings form', () => {
  it('saves only the form fields: no pizzas and no retired online-payment keys', async () => {
    const api = fakeApi();
    await loadCatalogue(api);

    byId('setting-price-late').value = '12.50';
    byId('setting-price-late').dispatchEvent(new window.Event('input'));
    expect(byId('save-settings-btn').textContent).toBe('Enregistrer *');
    expect(byId('settings-dirty-hint').classList.contains('hidden')).toBe(false);

    byId('save-settings-btn').click();
    await flush();

    expect(api.puts()).toHaveLength(1);
    expect(JSON.parse(api.puts()[0][1].body)).toEqual({
      max_team_size: 15,
      max_total_participants: 200,
      min_team_size: 1,
      school_name: "Université d'Evry",
      price_asso_member: 500,
      price_non_member: 800,
      price_late: 1250,
      late_cutoff_time: '19:00',
      gdpr_retention_years: 3
    });
    expect(byId('save-settings-btn').textContent).toBe('Enregistrer');
    expect(byId('settings-dirty-hint').classList.contains('hidden')).toBe(true);
  });

  it('a pizza change keeps the unsaved edits of the form fields', async () => {
    const api = fakeApi();
    await loadCatalogue(api);

    byId('setting-max-team').value = '9';
    byId('setting-max-team').dispatchEvent(new window.Event('input'));
    click('[data-pizza-id="reine"] .delete-pizza-btn');
    byId('confirm-delete-btn').click();
    await flush();

    expect(byId('setting-max-team').value).toBe('9');
    expect(state.settingsState.isDirty).toBe(true);
    expect(byId('save-settings-btn').disabled).toBe(false);
  });
});
