/* global document, Event */
/**
 * Settings tab: the switch that lets participants change their own pizza.
 * It is saved at once (like the catalogue), alone, and rolled back on failure.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flush } from './helpers.js';

let settings;

const toggle = () => document.getElementById('setting-pizza-changes-open');
const hint = () => document.getElementById('pizza-changes-hint');

/** An API double that stores `pizza_changes_open` as text, like the server does. */
function fakeApi({ stored, failPut = false } = {}) {
  const state = { value: stored };
  const api = vi.fn(async (path, options = {}) => {
    if (options.method === 'PUT') {
      if (failPut) throw new Error('Le serveur est indisponible');
      state.value = String(JSON.parse(options.body).pizza_changes_open);
      return { success: true };
    }
    return { settings: state.value === undefined ? {} : { pizza_changes_open: state.value } };
  });
  api.stored = () => state.value;
  api.puts = () => api.mock.calls.filter(([, options]) => options?.method === 'PUT');
  return api;
}

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = `
    <button type="button" id="save-settings-btn" disabled>Enregistrer</button>
    <span id="settings-dirty-hint" class="hidden"></span>
    <div id="pizzas-list"></div>
    <label><input type="checkbox" id="setting-pizza-changes-open"> Les participants peuvent changer leur pizza</label>
    <p id="pizza-changes-hint"></p>`;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  settings = await import('../../src/client/admin/settings.js');
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('pizza changes switch', () => {
  it('is on by default, and follows the stored value', async () => {
    await settings.loadSettings(fakeApi());
    expect(toggle().checked).toBe(true);

    await settings.loadSettings(fakeApi({ stored: 'false' }));
    expect(toggle().checked).toBe(false);
    expect(hint().textContent).toContain('closes');

    await settings.loadSettings(fakeApi({ stored: 'true' }));
    expect(toggle().checked).toBe(true);
    expect(hint().textContent).toContain('ouvertes');
  });

  it('saves at once, on its own, without touching the rest of the form', async () => {
    const api = fakeApi();
    await settings.loadSettings(api);
    settings.initSettings(api);
    api.mockClear();

    toggle().checked = false;
    toggle().dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    expect(api.puts()).toHaveLength(1);
    expect(JSON.parse(api.puts()[0][1].body)).toEqual({ pizza_changes_open: false });
    expect(api.stored()).toBe('false');
    expect(document.getElementById('save-settings-btn').disabled).toBe(true);
    expect(hint().textContent).toContain('closes');
  });

  it('goes back to the stored value when the save fails, and says so', async () => {
    const api = fakeApi({ failPut: true });
    await settings.loadSettings(api);
    settings.initSettings(api);

    toggle().checked = false;
    toggle().dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    expect(toggle().checked).toBe(true);
    expect(toggle().disabled).toBe(false);
    expect([...document.querySelectorAll('.toast')].at(-1)?.textContent).toContain('Le serveur est indisponible');
  });

  it('is locked while the change is being saved', async () => {
    let release;
    const api = fakeApi();
    api.mockImplementation(async (path, options = {}) => {
      if (options.method === 'PUT') await new Promise(resolve => { release = resolve; });
      return { settings: {} };
    });
    await settings.loadSettings(api);
    settings.initSettings(api);

    toggle().checked = false;
    toggle().dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(toggle().disabled).toBe(true);

    release();
    await flush();
    expect(toggle().disabled).toBe(false);
  });
});
