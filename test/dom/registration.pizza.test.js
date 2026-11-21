/* global Element, Event, document */
/**
 * Public team view: a team changes the pizza of its members with its code
 * secret (happy-dom). Server rules are covered by api.team-pizza.test.js.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { XSS_PAYLOAD, findInlineHandlers, flush } from './helpers.js';

let api;
let state;
let modals;

const byId = (id) => document.getElementById(id);

const PAGE = `
  <div id="team-view-modal" class="hidden">
    <div id="team-view-auth"><input id="team-view-password"><p id="team-view-error" class="hidden"></p>
      <button id="team-view-submit">Voir les membres</button><button id="team-view-cancel">x</button></div>
    <div id="team-view-content" class="hidden"><h3 id="team-detail-name"></h3><p id="team-detail-desc"></p><div id="team-members-list"></div></div>
    <h2 id="team-view-title"></h2><button id="team-view-close">x</button>
  </div>
`;

const PIZZAS = [
  { id: '0-rien', name: 'Aucune', description: '' },
  { id: 'reine', name: 'Reine', description: '' },
  { id: '4_fromages', name: '4 Fromages (Vég, Halal)', description: '' }
];

const member = (overrides = {}) => ({
  id: 11, firstName: 'Ada', lastName: 'L', email: 'ada@b.co', bacLevel: 3, isLeader: false, foodDiet: 'reine', pizzaReceived: false, ...overrides
});

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = PAGE;
  Element.prototype.scrollIntoView = vi.fn();
  api = await import('../../src/client/registration/api.js');
  state = await import('../../src/client/registration/state.js');
  modals = await import('../../src/client/registration/modals.js');
  (await import('../../src/client/registration/member-pizza.js')).bindMemberPizza(byId('team-members-list'));
  api.initApi('/nuit-de-linfo');
  state.setConfig({ pizzas: PIZZAS });
  state.setTeams([{ id: 6, name: 'Alpha' }]);
});

afterEach(() => {
  document.body.innerHTML = '';
});

/** Route-by-route fake of the API; `put` is called for the pizza change. */
function mockApi({ members = [member()], pizzaChangesOpen = true, put } = {}) {
  const calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    calls.push({ url: String(url), method: init.method, body: init.body ? JSON.parse(init.body) : undefined });
    const respond = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (String(url).endsWith('/view')) {
      return respond(200, { team: { id: 6, name: 'Alpha', description: '', pizzaChangesOpen, members } });
    }
    return put ? put(calls.at(-1), respond) : respond(200, { success: true, member: { id: 11, foodDiet: calls.at(-1).body.foodDiet } });
  }));
  return calls;
}

async function openTeam(password = ' secret ') {
  modals.openTeamViewModal(6);
  byId('team-view-password').value = password;
  await modals.handleTeamViewSubmit();
}

const row = (id = 11) => byId('team-members-list').querySelector(`.member-item[data-member-id="${id}"]`);
const selectOf = (id = 11) => row(id).querySelector('.member-pizza-select');
const saveOf = (id = 11) => row(id).querySelector('.member-pizza-save');
const statusOf = (id = 11) => row(id).querySelector('.member-pizza-status');

function choose(select, value) {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('the pizza of each member in the team view', () => {
  it('offers the catalogue with the current pizza selected, names rather than ids', async () => {
    mockApi({ members: [member({ foodDiet: '4_fromages' })] });
    await openTeam();

    const select = selectOf();
    expect([...select.options].map(o => [o.value, o.textContent])).toEqual([
      ['0-rien', 'Aucune'], ['reine', 'Reine'], ['4_fromages', '4 Fromages (Vég, Halal)']
    ]);
    expect(select.value).toBe('4_fromages');
    expect(saveOf().disabled).toBe(true);
    expect(select.getAttribute('aria-label') ?? row().querySelector('label')?.textContent).toContain('Ada');
  });

  it('shows "Aucune" for the members who never chose (empty or "none")', async () => {
    mockApi({ members: [member({ id: 1, foodDiet: '' }), member({ id: 2, firstName: 'B', foodDiet: 'none' })] });
    await openTeam();

    expect(selectOf(1).value).toBe('0-rien');
    expect(selectOf(2).value).toBe('0-rien');
  });

  it('keeps a pizza that left the catalogue visible, flagged, and does not lose it', async () => {
    mockApi({ members: [member({ foodDiet: 'diva' })] });
    await openTeam();

    const select = selectOf();
    expect(select.value).toBe('diva');
    expect(select.selectedOptions[0].textContent).toBe('diva (n\'est plus proposée)');
    expect(saveOf().disabled).toBe(true);
  });

  it('enables the save button only when the choice differs, and sends it with the code secret', async () => {
    const calls = mockApi();
    await openTeam();

    choose(selectOf(), '4_fromages');
    expect(saveOf().disabled).toBe(false);
    choose(selectOf(), 'reine');
    expect(saveOf().disabled).toBe(true);
    choose(selectOf(), '4_fromages');

    saveOf().click();
    await flush();

    const put = calls.find(c => c.method === 'PUT');
    expect(put.url).toBe('/nuit-de-linfo/api/teams/6/members/11/pizza');
    expect(put.body).toEqual({ password: 'secret', foodDiet: '4_fromages' });
    expect(statusOf().textContent).toBe('Pizza enregistrée');
    expect(saveOf().disabled).toBe(true);
    expect(selectOf().value).toBe('4_fromages');
  });

  it('takes the new pizza as the reference: changing back is a change again', async () => {
    mockApi();
    await openTeam();
    choose(selectOf(), '4_fromages');
    saveOf().click();
    await flush();

    choose(selectOf(), 'reine');

    expect(saveOf().disabled).toBe(false);
  });

  it('shows the server message and keeps the choice when the change is refused', async () => {
    mockApi({ put: (call, respond) => respond(409, { error: 'Cette pizza a déjà été remise : elle ne peut plus être changée', code: 'pizza_already_given' }) });
    await openTeam();
    choose(selectOf(), '4_fromages');

    saveOf().click();
    await flush();

    expect(statusOf().textContent).toBe('Cette pizza a déjà été remise : elle ne peut plus être changée');
    expect(statusOf().classList.contains('error')).toBe(true);
    expect(selectOf().value).toBe('4_fromages');
    expect(saveOf().disabled).toBe(false);
  });

  it('locks the row while saving so the change cannot be sent twice', async () => {
    let release;
    const calls = mockApi({ put: (call, respond) => new Promise(resolve => { release = () => resolve(respond(200, { success: true })); }) });
    await openTeam();
    choose(selectOf(), '4_fromages');

    saveOf().click();
    saveOf().click();
    await flush();
    expect(calls.filter(c => c.method === 'PUT')).toHaveLength(1);
    expect(saveOf().disabled).toBe(true);
    expect(selectOf().disabled).toBe(true);

    release();
    await flush();
    expect(selectOf().disabled).toBe(false);
  });

  it('is read-only once the organisers closed the changes', async () => {
    mockApi({ pizzaChangesOpen: false, members: [member({ foodDiet: '4_fromages' })] });
    await openTeam();

    expect(selectOf()).toBeNull();
    expect(row().querySelector('.member-food').textContent).toBe('4 Fromages (Vég, Halal)');
    expect(byId('team-members-list').textContent).toContain('Modifications closes');
  });

  it('is read-only for a pizza that was already handed out', async () => {
    mockApi({ members: [member({ pizzaReceived: true }), member({ id: 12, firstName: 'Bob' })] });
    await openTeam();

    expect(selectOf(11)).toBeNull();
    expect(row(11).textContent).toContain('Pizza remise');
    expect(selectOf(12)).not.toBeNull();
  });

  it('escapes catalogue names and never builds inline handlers', async () => {
    state.setConfig({ pizzas: [...PIZZAS, { id: 'x', name: XSS_PAYLOAD, description: '' }] });
    mockApi({ members: [member({ firstName: XSS_PAYLOAD, foodDiet: 'x' })] });
    await openTeam();

    const list = byId('team-members-list');
    expect(list.querySelector('img')).toBeNull();
    expect(findInlineHandlers(list)).toEqual([]);
    expect(selectOf().selectedOptions[0].textContent).toBe(XSS_PAYLOAD);
  });

  it('forgets the code secret and the members when the modal closes', async () => {
    mockApi();
    await openTeam();
    modals.closeTeamViewModal();

    expect(state.state.teamSecret).toBe('');
    expect(byId('team-members-list').innerHTML).toBe('');
  });
});
