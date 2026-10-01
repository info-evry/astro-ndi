/* global Element, Event, KeyboardEvent, document */
/**
 * Public registration page client modules: API client, rendering, form
 * collection / validation / submission and the team view modal (happy-dom).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { XSS_PAYLOAD, QUOTE_PAYLOAD, findInlineHandlers, flush } from './helpers.js';

let api;
let state;
let render;
let form;
let modals;

const byId = (id) => document.getElementById(id);

const PAGE = `
  <span id="kpi-teams"></span><span id="kpi-participants"></span><span id="kpi-spots"></span>
  <div id="capacity-warning" class="hidden"><span id="capacity-warning-text"></span></div>
  <section id="inscription"></section><button id="hero-register-btn">Register</button>
  <span id="teams-badge"></span><div id="teams-list"></div>

  <form id="registration-form">
    <div id="new-team-fields">
      <input name="teamName" id="team-name"><input name="teamDescription"><input name="teamPassword">
    </div>
    <div id="join-team-fields" class="hidden">
      <select name="teamId" id="team-select"></select><input name="joinPassword">
    </div>
    <input name="firstName"><input name="lastName"><input name="email">
    <select name="bacLevel" id="member-bac-level"></select>
    <div id="pizza-options"></div>
    <div id="leader-toggle-container"><input type="checkbox" name="isLeader" id="member-is-leader"></div>
    <input type="radio" name="paymentMethod" value="delayed" checked>
    <button type="submit" id="submit-btn">S'inscrire</button>
  </form>
  <div id="form-errors" class="hidden"></div>
  <div id="success-modal" class="hidden"><p id="success-message"></p></div>

  <div id="payment-section"><span id="current-price"></span><span id="current-tier-label"></span>
    <p id="pricing-deadline-note"></p><p id="payment-disabled" class="hidden"></p>
    <div class="payment-method"></div></div>

  <div id="team-view-modal" class="hidden">
    <div id="team-view-auth"><input id="team-view-password"><p id="team-view-error" class="hidden"></p>
      <button id="team-view-submit">Voir les membres</button><button id="team-view-cancel">x</button></div>
    <div id="team-view-content" class="hidden"><h3 id="team-detail-name"></h3><p id="team-detail-desc"></p><div id="team-members-list"></div></div>
    <h2 id="team-view-title"></h2><button id="team-view-close">x</button>
  </div>
`;

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = PAGE;
  Element.prototype.scrollIntoView = vi.fn();
  api = await import('../../src/client/registration/api.js');
  state = await import('../../src/client/registration/state.js');
  render = await import('../../src/client/registration/render.js');
  form = await import('../../src/client/registration/form.js');
  modals = await import('../../src/client/registration/modals.js');
});

afterEach(() => {
  document.body.innerHTML = '';
});

function mockFetch(responder) {
  const fetchMock = vi.fn(async (url, init) => {
    const { status = 200, body = {} } = await responder(String(url), init);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('registration api client', () => {
  it('prefixes the base URL (trailing slash removed) and asks for JSON', async () => {
    const fetchMock = mockFetch(() => ({ body: { config: { pizzas: [] } } }));
    api.initApi('/nuit-de-linfo/');

    expect(await api.loadConfig()).toEqual({ pizzas: [] });
    expect(fetchMock.mock.calls[0][0]).toBe('/nuit-de-linfo/api/config');
    expect(fetchMock.mock.calls[0][1].method).toBe('GET');
    expect(fetchMock.mock.calls[0][1].headers.Accept).toBe('application/json');
  });

  it('unwraps teams, stats and pricing', async () => {
    const bodies = { '/teams': { teams: [{ id: 1 }] }, '/stats': { stats: { total_teams: 1 } }, '/payment/pricing': { enabled: true } };
    mockFetch((url) => ({ body: bodies[url.replace('/api', '')] }));
    api.initApi('');

    expect(await api.loadTeams()).toEqual([{ id: 1 }]);
    expect(await api.loadStats()).toEqual({ total_teams: 1 });
    expect(await api.loadPricing()).toEqual({ enabled: true });
  });

  it('pricing is optional: a failure resolves to null', async () => {
    mockFetch(() => ({ status: 500, body: { error: 'nope' } }));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    api.initApi('');
    expect(await api.loadPricing()).toBeNull();
  });

  it('submitRegistration POSTs the payload and surfaces the server error message', async () => {
    const fetchMock = mockFetch(() => ({ status: 400, body: { error: 'Team name already exists' } }));
    api.initApi('/base');

    await expect(api.submitRegistration({ teamName: 'x' })).rejects.toThrow('Team name already exists');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/base/api/register');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ teamName: 'x' });
  });

  it('errors are ApiErrors carrying the HTTP status and the server code', async () => {
    mockFetch(() => ({ status: 409, body: { error: "Ce nom d'équipe existe déjà", code: 'conflict' } }));
    api.initApi('');

    const error = await api.submitRegistration({}).catch(error_ => error_);
    expect(error.name).toBe('ApiError');
    expect(error.message).toBe("Ce nom d'équipe existe déjà");
    expect(error.status).toBe(409);
    expect(error.code).toBe('conflict');
  });

  it('an HTML error page (502) is a readable French message, not a SyntaxError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 })));
    api.initApi('');

    const error = await api.loadTeams().catch(error_ => error_);
    expect(error.name).toBe('ApiError');
    expect(error.message).toContain('indisponible');
    expect(error.status).toBe(502);
  });

  it('falls back to a generic message when the error body has none', async () => {
    mockFetch(() => ({ status: 500, body: {} }));
    api.initApi('');
    await expect(api.loadTeams()).rejects.toThrow('Une erreur est survenue');
  });

  it('viewTeamMembers posts the password to the team view endpoint', async () => {
    const fetchMock = mockFetch(() => ({ body: { team: { id: 4 } } }));
    api.initApi('');

    await api.viewTeamMembers(4, 'secret');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/teams/4/view');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ password: 'secret' });
  });
});

describe('renderStats', () => {
  const stats = (overrides = {}) => ({ total_teams: 4, total_participants: 20, max_participants: 200, available_spots: 180, ...overrides });

  it('shows participants / capacity and hides the warning when there is plenty of room', () => {
    render.renderStats(stats());
    expect(byId('kpi-participants').textContent).toBe('20/200');
    expect(byId('kpi-teams').textContent).toBe('4');
    expect(byId('capacity-warning').classList.contains('hidden')).toBe(true);
    expect(state.state.isAtCapacity).toBe(false);
  });

  it('warns when 80% of the places are taken, with the right plural', () => {
    render.renderStats(stats({ total_participants: 170, available_spots: 30 }));
    expect(byId('capacity-warning').classList.contains('hidden')).toBe(false);
    expect(byId('capacity-warning-text').textContent).toContain('30');
    expect(byId('capacity-warning-text').textContent).toContain('places disponibles');

    render.renderStats(stats({ total_participants: 199, available_spots: 1 }));
    expect(byId('capacity-warning-text').textContent).toMatch(/1\s+place disponible\./);
  });

  it('closes the registration when full', () => {
    render.renderStats(stats({ total_participants: 200, available_spots: 0 }));

    expect(state.state.isAtCapacity).toBe(true);
    expect(byId('kpi-participants').textContent).toBe('200');
    expect(byId('capacity-warning').classList.contains('capacity-full')).toBe(true);
    expect(byId('inscription').classList.contains('hidden')).toBe(true);
    expect(byId('hero-register-btn').classList.contains('hidden')).toBe(true);
  });
});

describe('renderTeams', () => {
  const team = (overrides = {}) => ({ id: 1, name: 'Alpha', description: 'About', member_count: 2, available_slots: 13, is_full: false, is_organisation: false, ...overrides });

  it('renders cards, counts teams without the Organisation and formats the slots', () => {
    render.renderTeams([team(), team({ id: 2, name: 'Full', member_count: 15, available_slots: 0, is_full: true }), team({ id: 3, name: 'Organisation', is_organisation: true, available_slots: null })], vi.fn());

    expect(byId('teams-badge').textContent).toBe('2');
    const cards = byId('teams-list').querySelectorAll('.team-card');
    expect(cards).toHaveLength(3);
    expect(cards[0].querySelector('.team-spots').textContent).toBe('13 places');
    expect(cards[1].classList.contains('full')).toBe(true);
    expect(cards[1].querySelector('.team-spots').textContent).toBe('Complet');
    expect(cards[2].classList.contains('organisation')).toBe(true);
    expect(cards[2].querySelector('.team-spots').textContent).toBe('Illimité');
  });

  it('uses singular forms for one member / one place', () => {
    render.renderTeams([team({ member_count: 1, available_slots: 1 })], vi.fn());
    const card = byId('teams-list').querySelector('.team-card');
    expect(card.querySelector('.team-members').textContent).toBe('1 membre');
    expect(card.querySelector('.team-spots').textContent).toBe('1 place');
  });

  it('calls back with the numeric team id when a card is clicked', () => {
    const onClick = vi.fn();
    render.renderTeams([team({ id: 8 })], onClick);
    byId('teams-list').querySelector('.team-card').click();
    expect(onClick).toHaveBeenCalledWith(8);
  });

  it('escapes hostile team names and descriptions', () => {
    render.renderTeams([team({ name: XSS_PAYLOAD, description: QUOTE_PAYLOAD })], vi.fn());

    const list = byId('teams-list');
    expect(list.querySelector('img')).toBeNull();
    expect(findInlineHandlers(list)).toEqual([]);
    expect(list.querySelector('.team-name').textContent).toBe(XSS_PAYLOAD);
    expect(list.querySelector('.team-desc').textContent).toBe(QUOTE_PAYLOAD);
  });

  it('shows an empty state when there are no teams', () => {
    render.renderTeams([], vi.fn());
    expect(byId('teams-list').textContent).toContain('Aucune équipe inscrite');
  });

  it('renderTeamSelect offers only joinable teams, with escaped names', () => {
    render.renderTeamSelect([
      team({ id: 1, name: XSS_PAYLOAD }),
      team({ id: 2, name: 'Full', is_full: true }),
      team({ id: 3, name: 'Organisation', is_organisation: true })
    ]);

    const options = [...byId('team-select').querySelectorAll('option')];
    expect(options.map(o => o.value)).toEqual(['', '1']);
    expect(options[1].textContent.trim()).toBe(`${XSS_PAYLOAD} (13 places)`);
    expect(byId('team-select').querySelector('img')).toBeNull();
  });
});

describe('member form initialisation', () => {
  it('builds BAC level and pizza options from the config, first pizza preselected', () => {
    state.setConfig({
      bacLevels: [{ value: 0, label: 'Non bachelier' }, { value: 3, label: XSS_PAYLOAD }],
      pizzas: [{ id: 'none', name: 'Aucune', description: '' }, { id: 'reine', name: QUOTE_PAYLOAD, description: 'Jambon' }]
    });
    render.initMemberForm();

    const levels = [...byId('member-bac-level').querySelectorAll('option')];
    expect(levels.map(o => o.value)).toEqual(['0', '3']);
    expect(levels[1].textContent).toBe(XSS_PAYLOAD);

    const options = byId('pizza-options').querySelectorAll('.pizza-option');
    expect(options).toHaveLength(2);
    expect(options[0].classList.contains('selected')).toBe(true);
    expect(options[0].querySelector('input').checked).toBe(true);
    expect(options[1].querySelector('.pizza-name').textContent).toBe(QUOTE_PAYLOAD);
    expect(byId('pizza-options').querySelector('img')).toBeNull();
  });

  it('moves the "selected" highlight when another pizza is picked', () => {
    state.setConfig({ bacLevels: [], pizzas: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] });
    render.initMemberForm();
    const [first, second] = byId('pizza-options').querySelectorAll('.pizza-option');

    second.querySelector('input').checked = true;
    second.querySelector('input').dispatchEvent(new Event('change', { bubbles: true }));
    expect(first.classList.contains('selected')).toBe(false);
    expect(second.classList.contains('selected')).toBe(true);
  });

  it('the leader toggle is hidden (and checked) for new teams, shown (and unchecked) when joining', () => {
    state.setTeamMode(true);
    render.updateLeaderToggle();
    expect(byId('leader-toggle-container').classList.contains('hidden')).toBe(true);
    expect(byId('member-is-leader').checked).toBe(true);

    state.setTeamMode(false);
    render.updateLeaderToggle();
    expect(byId('leader-toggle-container').classList.contains('hidden')).toBe(false);
    expect(byId('member-is-leader').checked).toBe(false);
  });
});

describe('renderPricing', () => {
  const pricing = (overrides = {}) => ({
    enabled: true,
    currentTier: 'tier1',
    currentPriceFormatted: '5.00 €',
    daysUntilDeadline: 20,
    registrationDeadline: '2031-06-15T00:00:00Z',
    tier2: { priceFormatted: '7.00 €' },
    ...overrides
  });

  it('hides the whole payment section without pricing', () => {
    render.renderPricing(null);
    expect(byId('payment-section').classList.contains('hidden')).toBe(true);
  });

  it('shows the early-bird price with the date it is valid until', () => {
    render.renderPricing(pricing());
    expect(byId('current-price').textContent).toBe('5.00 €');
    expect(byId('current-tier-label').textContent).toBe('Inscription anticipée');
    expect(byId('pricing-deadline-note').textContent).toContain('7.00 €');
    expect(byId('payment-disabled').classList.contains('hidden')).toBe(true);
    expect(document.querySelector('.payment-method').classList.contains('hidden')).toBe(false);
  });

  it('shows the standard label, the deadline-passed note and the disabled notice', () => {
    render.renderPricing(pricing({ enabled: false, currentTier: 'tier2', daysUntilDeadline: -2 }));
    expect(byId('current-tier-label').textContent).toBe('Inscription standard');
    expect(byId('pricing-deadline-note').textContent).toBe('Date limite de pré-inscription dépassée.');
    expect(byId('payment-disabled').classList.contains('hidden')).toBe(false);
    expect(document.querySelector('.payment-method').classList.contains('hidden')).toBe(true);
  });
});

describe('registration form', () => {
  const fill = (values) => {
    for (const [name, value] of Object.entries(values)) {
      document.querySelector(`#registration-form [name="${name}"]`).value = value;
    }
  };

  const validNewTeam = () => fill({
    teamName: 'Alpha', teamPassword: 'secret', firstName: 'Ann', lastName: 'One', email: 'ann@example.com'
  });

  beforeEach(() => {
    state.setConfig({ bacLevels: [{ value: 2, label: 'BAC+2' }], pizzas: [{ id: 'reine', name: 'Reine' }] });
    render.initMemberForm();
  });

  it('collects a new team registration with the member as leader', () => {
    state.setTeamMode(true);
    validNewTeam();
    fill({ teamDescription: 'about' });

    expect(form.collectFormData()).toEqual({
      createNewTeam: true,
      paymentMethod: 'delayed',
      teamName: 'Alpha',
      teamDescription: 'about',
      teamPassword: 'secret',
      members: [{ firstName: 'Ann', lastName: 'One', email: 'ann@example.com', bacLevel: 2, isLeader: true, foodDiet: 'reine' }]
    });
  });

  it('collects a join registration with the team id and join password', () => {
    state.setTeamMode(false);
    byId('team-select').innerHTML = '<option value="5">Five</option>';
    byId('team-select').value = '5';
    fill({ joinPassword: 'join-pw', firstName: 'Bob', lastName: 'Two', email: 'bob@example.com' });
    byId('member-is-leader').checked = true;

    const data = form.collectFormData();
    expect(data).toMatchObject({ createNewTeam: false, teamId: 5, teamPassword: 'join-pw' });
    expect(data.members[0].isLeader).toBe(true);
    expect(data).not.toHaveProperty('teamName');
  });

  it('validates a complete form without errors', () => {
    state.setTeamMode(true);
    validNewTeam();
    expect(form.validateForm()).toEqual([]);
  });

  it('lists every missing field for a new team', () => {
    state.setTeamMode(true);
    expect(form.validateForm()).toEqual([
      "Le nom de l'équipe est requis",
      "Le mot de passe de l'équipe est requis",
      'Prénom requis',
      'Nom requis',
      'Email requis'
    ]);
  });

  it('enforces a 4 character team password and a plausible email', () => {
    state.setTeamMode(true);
    validNewTeam();
    fill({ teamPassword: 'abc', email: 'not-an-email' });

    expect(form.validateForm()).toEqual(['Le mot de passe doit faire au moins 4 caractères', 'Email invalide']);
  });

  it('requires a team and a password when joining', () => {
    state.setTeamMode(false);
    fill({ firstName: 'Bob', lastName: 'Two', email: 'bob@example.com' });
    expect(form.validateForm()).toEqual(['Veuillez sélectionner une équipe', "Le mot de passe de l'équipe est requis"]);
  });

  it('submit shows escaped validation errors and does not call the API', async () => {
    const fetchMock = mockFetch(() => ({ body: {} }));
    api.initApi('');
    state.setTeamMode(true);

    const event = new Event('submit', { cancelable: true });
    await form.handleSubmit(event);

    expect(event.defaultPrevented).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(byId('form-errors').classList.contains('hidden')).toBe(false);
    expect(byId('form-errors').querySelectorAll('li').length).toBe(5);
  });

  it('submit refuses to register when the event is full', async () => {
    const fetchMock = mockFetch(() => ({ body: {} }));
    state.setAtCapacity(true);
    validNewTeam();

    await form.handleSubmit(new Event('submit', { cancelable: true }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(byId('form-errors').textContent).toContain('Les inscriptions sont closes');
  });

  it('a successful submit posts the data, shows the success modal and restores the button', async () => {
    const fetchMock = mockFetch(() => ({ body: { success: true, message: 'Successfully registered 1 member(s)' } }));
    api.initApi('/base');
    state.setTeamMode(true);
    validNewTeam();

    await form.handleSubmit(new Event('submit', { cancelable: true }));

    expect(fetchMock.mock.calls[0][0]).toBe('/base/api/register');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).teamName).toBe('Alpha');
    expect(byId('success-message').textContent).toBe('Successfully registered 1 member(s)');
    expect(byId('success-modal').classList.contains('hidden')).toBe(false);
    expect(byId('submit-btn').disabled).toBe(false);
    expect(byId('submit-btn').textContent).toBe("S'inscrire");
  });

  it('a rejected submit shows the server message as text and re-enables the form', async () => {
    mockFetch(() => ({ status: 400, body: { error: XSS_PAYLOAD } }));
    api.initApi('');
    state.setTeamMode(true);
    validNewTeam();

    await form.handleSubmit(new Event('submit', { cancelable: true }));

    expect(byId('form-errors').querySelector('img')).toBeNull();
    expect(byId('form-errors').querySelector('li').textContent).toBe(XSS_PAYLOAD);
    expect(byId('success-modal').classList.contains('hidden')).toBe(true);
    expect(byId('submit-btn').disabled).toBe(false);
  });

  it('shows the loading state while the request is running', async () => {
    let release;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { release = resolve; })));
    api.initApi('');
    state.setTeamMode(true);
    validNewTeam();

    const pending = form.handleSubmit(new Event('submit', { cancelable: true }));
    expect(byId('submit-btn').disabled).toBe(true);
    expect(byId('submit-btn').textContent).toBe('Inscription en cours...');
    expect(byId('registration-form').classList.contains('loading')).toBe(true);

    release(new Response(JSON.stringify({ message: 'ok' }), { status: 200 }));
    await pending;
    expect(byId('registration-form').classList.contains('loading')).toBe(false);
  });
});

describe('team view modal', () => {
  const team = { id: 6, name: 'Alpha' };

  beforeEach(() => {
    state.setTeams([team]);
    api.initApi('');
  });

  it('opens for a known team with a clean password form', () => {
    byId('team-view-password').value = 'leftover';
    modals.openTeamViewModal(6);

    expect(byId('team-view-modal').classList.contains('hidden')).toBe(false);
    expect(byId('team-view-title').textContent).toBe("Voir l'équipe: Alpha");
    expect(byId('team-view-password').value).toBe('');
    expect(byId('team-view-content').classList.contains('hidden')).toBe(true);
    expect(state.state.selectedTeamId).toBe(6);
  });

  it('ignores unknown teams', () => {
    modals.openTeamViewModal(999);
    expect(byId('team-view-modal').classList.contains('hidden')).toBe(true);
  });

  it('close hides the modal and forgets the team', () => {
    modals.openTeamViewModal(6);
    modals.closeTeamViewModal();
    expect(byId('team-view-modal').classList.contains('hidden')).toBe(true);
    expect(state.state.selectedTeamId).toBeNull();
  });

  it('asks for a password before calling the API', async () => {
    const fetchMock = mockFetch(() => ({ body: {} }));
    modals.openTeamViewModal(6);
    byId('team-view-password').value = '   ';

    await modals.handleTeamViewSubmit();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(byId('team-view-error').textContent).toBe('Veuillez entrer le mot de passe');
    expect(byId('team-view-error').classList.contains('hidden')).toBe(false);
  });

  it('shows the members (escaped) after a correct password', async () => {
    const fetchMock = mockFetch(() => ({
      body: {
        team: {
          id: 6,
          name: XSS_PAYLOAD,
          description: QUOTE_PAYLOAD,
          members: [
            { firstName: XSS_PAYLOAD, lastName: 'L', email: 'a@b.co', bacLevel: 3, isLeader: true, foodDiet: XSS_PAYLOAD },
            { firstName: 'Bob', lastName: 'B', email: 'b@b.co', bacLevel: 99, isLeader: false, foodDiet: '' }
          ]
        }
      }
    }));
    modals.openTeamViewModal(6);
    byId('team-view-password').value = ' secret ';

    await modals.handleTeamViewSubmit();

    expect(fetchMock.mock.calls[0][0]).toBe('/api/teams/6/view');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ password: 'secret' });
    expect(byId('team-view-auth').classList.contains('hidden')).toBe(true);
    expect(byId('team-view-content').classList.contains('hidden')).toBe(false);
    expect(byId('team-detail-name').textContent).toBe(XSS_PAYLOAD);

    const list = byId('team-members-list');
    expect(list.querySelector('img')).toBeNull();
    expect(findInlineHandlers(list)).toEqual([]);
    const items = list.querySelectorAll('.member-item');
    expect(items[0].classList.contains('leader')).toBe(true);
    expect(items[0].querySelector('.member-bac').textContent).toBe('BAC+3 (Licence)');
    expect(items[0].querySelector('.member-food').textContent).toBe(XSS_PAYLOAD);
    expect(items[1].querySelector('.member-bac').textContent).toBe('N/A');
    expect(items[1].querySelector('.member-food')).toBeNull();
    expect(byId('team-view-submit').disabled).toBe(false);
  });

  it('shows the server error for a wrong password and keeps the auth form', async () => {
    mockFetch(() => ({ status: 403, body: { error: 'Mot de passe incorrect' } }));
    modals.openTeamViewModal(6);
    byId('team-view-password').value = 'wrong';

    await modals.handleTeamViewSubmit();
    expect(byId('team-view-error').textContent).toBe('Mot de passe incorrect');
    expect(byId('team-view-error').classList.contains('hidden')).toBe(false);
    expect(byId('team-view-content').classList.contains('hidden')).toBe(true);
    expect(byId('team-view-submit').textContent).toBe('Voir les membres');
  });

  it('listeners: Enter submits, backdrop and close button dismiss', async () => {
    const fetchMock = mockFetch(() => ({ body: { team: { name: 'A', members: [] } } }));
    const added = [];
    const original = document.addEventListener.bind(document);
    vi.spyOn(document, 'addEventListener').mockImplementation((type, fn, opts) => { added.push([type, fn, opts]); original(type, fn, opts); });
    try {
      modals.setupModalListeners();
      modals.openTeamViewModal(6);
      byId('team-view-password').value = 'pw';

      byId('team-view-password').dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', bubbles: true, cancelable: true }));
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      byId('team-view-modal').click();
      expect(byId('team-view-modal').classList.contains('hidden')).toBe(true);

      modals.openTeamViewModal(6);
      byId('team-view-close').click();
      expect(byId('team-view-modal').classList.contains('hidden')).toBe(true);

      modals.openTeamViewModal(6);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(byId('team-view-modal').classList.contains('hidden')).toBe(true);
    } finally {
      for (const [type, fn, opts] of added) document.removeEventListener(type, fn, opts);
    }
  });
});
