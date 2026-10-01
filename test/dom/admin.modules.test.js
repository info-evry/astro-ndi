/* global Element, HTMLAnchorElement, document */
/**
 * Attendance, pizza, rooms, archives and settings modules: rendering,
 * escaping of attacker-controlled text (food choices come from the public
 * registration form) and the handlers behind their buttons.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { XSS_PAYLOAD, QUOTE_PAYLOAD, findInlineHandlers } from './helpers.js';

let state;
let attendance;
let pizza;
let rooms;
let archives;
let settings;
let format;

const byId = (id) => document.getElementById(id);
// happy-dom does not implement HTMLTableSectionElement.rows / HTMLTableRowElement.cells
const rowsOf = (idOrEl) => [...(typeof idOrEl === 'string' ? byId(idOrEl) : idOrEl).querySelectorAll('tr')];
const cellsOf = (row) => [...row.querySelectorAll('td')];

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = `
    <div id="attendance-stats-grid"></div>
    <table id="attendance-table"><thead><tr>
      <th class="sortable" data-sort-key="name">Nom</th>
      <th class="sortable" data-sort-key="team">Équipe</th>
      <th class="sortable" data-sort-key="status">Statut</th>
    </tr></thead><tbody id="attendance-tbody"></tbody></table>
    <input id="attendance-search">
    <span id="attendance-badge"></span>

    <div id="pizza-stats-grid"></div><div id="pizza-by-type-grid"></div>
    <div id="pizza-present-stats-grid"></div><div id="pizza-present-by-type-grid"></div>
    <table><tbody id="pizza-tbody"></tbody></table>

    <div id="room-stats-grid"></div><div id="room-by-room-grid"></div><div id="room-pizza-container"></div>
    <table><tbody id="rooms-tbody"></tbody></table>

    <div id="archives-container"></div><span id="archives-badge"></span>
    <section id="archive-detail" class="hidden">
      <h3 id="archive-detail-title"></h3><div id="archive-stats-grid"></div>
      <table><tbody id="archive-teams-tbody"></tbody></table>
      <table><tbody id="archive-members-tbody"></tbody></table>
      <p id="archive-gdpr-notice" class="hidden"></p>
    </section>

    <div id="pizzas-list"></div>

    <div id="checkin-modal" class="modal hidden">
      <input type="hidden" id="checkin-member-id">
      <span id="checkin-member-name"></span>
      <label id="option-late" class="hidden"><input type="radio" name="payment-tier" value="late"><span id="price-late"></span></label>
      <label id="option-non-member"><input type="radio" name="payment-tier" value="non_member"><span id="price-non-member"></span></label>
      <label><input type="radio" name="payment-tier" value="asso_member" checked><span id="price-asso"></span></label>
      <label><input type="radio" name="payment-tier" value="organisation"></label>
    </div>`;
  state = await import('../../src/client/admin/state.js');
  format = await import('../../src/client/admin/format.js');
  attendance = await import('../../src/client/admin/attendance.js');
  pizza = await import('../../src/client/admin/pizza.js');
  rooms = await import('../../src/client/admin/rooms.js');
  archives = await import('../../src/client/admin/archives.js');
  settings = await import('../../src/client/admin/settings.js');
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

const member = (overrides = {}) => ({
  id: 1,
  first_name: 'Ann',
  last_name: 'Alpha',
  email: 'ann@example.com',
  team_name: 'Team A',
  team_room: null,
  checked_in: 0,
  checked_in_at: null,
  pizza_received: 0,
  pizza_received_at: null,
  food_diet: 'reine',
  payment_status: 'unpaid',
  ...overrides
});

describe('format helpers', () => {
  it('formatTeamWithRoom appends the room and truncates long names', () => {
    expect(format.formatTeamWithRoom('Alpha', 'Salle 1')).toEqual({ truncated: 'Alpha (Salle 1)', full: 'Alpha (Salle 1)' });
    expect(format.formatTeamWithRoom('Alpha', null)).toEqual({ truncated: 'Alpha', full: 'Alpha' });
    expect(format.formatTeamWithRoom('', 'x')).toEqual({ truncated: '-', full: '-' });

    const long = format.formatTeamWithRoom('N'.repeat(80), 'Salle', 20);
    expect(long.truncated).toHaveLength(20);
    expect(long.truncated.endsWith('…')).toBe(true);
    expect(long.full).toBe(`${'N'.repeat(80)} (Salle)`);
  });

  it('pizzaLabel prefers the configured name, escapes everything and ignores inherited keys', () => {
    const types = { reine: 'La <Reine>' };
    expect(format.pizzaLabel(types, 'reine')).toBe('La &lt;Reine&gt;');
    expect(format.pizzaLabel(types, XSS_PAYLOAD)).toBe('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
    expect(format.pizzaLabel(types, 'constructor')).toBe('constructor');
    expect(format.pizzaLabel(types, '__proto__')).toBe('__proto__');
    expect(format.pizzaLabel(types, '')).toBe('');
    expect(format.pizzaLabel(types)).toBe('');
  });
});

describe('pizza module', () => {
  it('escapes a hostile food choice in the table, with or without a configured pizza list', () => {
    state.setPizzasConfig([{ id: 'reine', name: 'Reine' }]);
    pizza.initPizza(vi.fn());
    state.setPizzaData([member({ id: 1, food_diet: XSS_PAYLOAD }), member({ id: 2, first_name: 'Bob', food_diet: 'reine' })]);

    pizza.renderPizza();

    const tbody = byId('pizza-tbody');
    expect(tbody.querySelector('img')).toBeNull();
    expect(findInlineHandlers(tbody)).toEqual([]);
    const foodCells = rowsOf(tbody).map(tr => cellsOf(tr)[2].textContent);
    expect(foodCells.sort()).toEqual([XSS_PAYLOAD, 'Reine'].sort());
  });

  it('escapes hostile food choices in the statistics cards', () => {
    pizza.renderPizzaStats({
      received: 1, pending: 1, total: 2,
      by_type: [{ food_diet: XSS_PAYLOAD, total: 2, received: 1 }],
      present: { received: 1, pending: 0, total: 1, by_type: [{ food_diet: XSS_PAYLOAD, total: 1, received: 1 }] }
    });

    for (const id of ['pizza-by-type-grid', 'pizza-present-by-type-grid']) {
      expect(byId(id).querySelector('img')).toBeNull();
      expect(byId(id).querySelector('.stat-label').textContent).toBe(XSS_PAYLOAD);
    }
  });

  it('does not render markup from a configured pizza name', () => {
    state.setPizzasConfig([{ id: 'evil', name: '<img src=x onerror=alert(1)>' }]);
    pizza.initPizza(vi.fn());
    state.setPizzaData([member({ food_diet: 'evil' })]);
    pizza.renderPizza();

    expect(byId('pizza-tbody').querySelector('img')).toBeNull();
    expect(cellsOf(rowsOf('pizza-tbody')[0])[2].textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('does not resolve inherited object keys as pizza names', () => {
    state.setPizzaData([member({ food_diet: 'constructor' }), member({ id: 2, first_name: 'Bob', food_diet: '__proto__' })]);
    pizza.renderPizza();

    const texts = rowsOf('pizza-tbody').map(r => cellsOf(r)[2].textContent).sort();
    expect(texts).toEqual(['__proto__', 'constructor']);
  });

  it('shows "-" for a member without a food choice', () => {
    state.setPizzaData([member({ food_diet: '' })]);
    pizza.renderPizza();
    expect(cellsOf(rowsOf('pizza-tbody')[0])[2].textContent).toBe('-');
  });

  it('offers give / revoke buttons according to the state, as delegated actions', () => {
    state.setPizzaData([member({ id: 1 }), member({ id: 2, first_name: 'Bob', pizza_received: 1 })]);
    pizza.renderPizza();

    expect(byId('pizza-tbody').querySelector('tr[data-member-id="1"] [data-action="give-pizza"]')).not.toBeNull();
    expect(byId('pizza-tbody').querySelector('tr[data-member-id="2"] [data-action="revoke-pizza"]')).not.toBeNull();
  });

  it('give and revoke call the pizza endpoints, reload, and report errors', async () => {
    const api = vi.fn().mockResolvedValue({});
    const loadData = vi.fn();

    await pizza.handleGivePizza(5, api, loadData);
    await pizza.handleRevokePizza(5, api, loadData);
    expect(api).toHaveBeenNthCalledWith(1, '/admin/pizza/give/5', { method: 'POST' });
    expect(api).toHaveBeenNthCalledWith(2, '/admin/pizza/revoke/5', { method: 'POST' });
    expect(loadData).toHaveBeenCalledTimes(2);

    vi.spyOn(console, 'error').mockImplementation(() => {});
    await pizza.handleGivePizza(5, vi.fn().mockRejectedValue(new Error('x')), loadData);
    expect(document.querySelector('.toast.error').textContent).toBe('Erreur lors de la distribution');
    expect(loadData).toHaveBeenCalledTimes(2);
  });

  it('shows the pending count in the badge when data loads', async () => {
    document.body.insertAdjacentHTML('beforeend', '<span id="pizza-badge"></span>');
    const api = vi.fn().mockResolvedValue({
      members: [member()],
      stats: { received: 0, pending: 4, total: 4 }
    });

    await pizza.loadPizzaData(api);
    expect(byId('pizza-badge').textContent).toBe('4');
    expect(rowsOf('pizza-tbody')).toHaveLength(1);
  });
});

describe('rooms module', () => {
  it('escapes hostile food choices and room names in the per-room breakdown', () => {
    rooms.renderPizzaByRoom([{
      room: XSS_PAYLOAD,
      totals: { total: 2, present: 1 },
      pizzas: [{ food_diet: XSS_PAYLOAD, total: 2, present: 1 }, { food_diet: 'constructor', total: 1, present: 0 }]
    }]);

    const container = byId('room-pizza-container');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('h4 span').textContent).toBe(XSS_PAYLOAD);
    expect([...container.querySelectorAll('.stat-label')].map(l => l.textContent)).toEqual([XSS_PAYLOAD, 'constructor', 'Total']);
  });

  it('escapes room names in the statistics and the team table', () => {
    rooms.renderRoomsStats({ assigned_teams: 1, unassigned_teams: 1, total_teams: 2, by_room: [{ room: XSS_PAYLOAD, team_count: 1, member_count: 3 }] });
    expect(byId('room-by-room-grid').querySelector('img')).toBeNull();
    expect(byId('room-stats-grid').textContent).toContain('50%');

    state.setRoomsData([{ id: 1, name: QUOTE_PAYLOAD, room: XSS_PAYLOAD, member_count: 2 }]);
    rooms.renderRooms();
    const row = rowsOf('rooms-tbody')[0];
    expect(byId('rooms-tbody').querySelector('img')).toBeNull();
    expect(row.querySelector('input').value).toBe(XSS_PAYLOAD);
    expect(cellsOf(row)[0].getAttribute('title')).toBe(QUOTE_PAYLOAD);
    expect(findInlineHandlers(byId('rooms-tbody')).filter(h => !h.includes('style'))).toEqual([]);
  });

  it('shows a clear button only for assigned teams and filters unassigned ones', () => {
    state.setRoomsData([{ id: 1, name: 'A', room: 'S1', member_count: 1 }, { id: 2, name: 'B', room: '', member_count: 1 }]);
    rooms.renderRooms();
    expect(byId('rooms-tbody').querySelectorAll('[data-action="clear-room"]')).toHaveLength(1);

    state.setRoomFilter('unassigned');
    rooms.renderRooms();
    expect(rowsOf('rooms-tbody').map(r => r.dataset.teamId)).toEqual(['2']);
  });

  it('handleRoomChange sends the room (or null) and reports success / failure', async () => {
    const api = vi.fn().mockResolvedValue({});
    const loadData = vi.fn();

    await rooms.handleRoomChange(4, 'Salle 3', api, loadData);
    expect(api).toHaveBeenCalledWith('/admin/rooms/4', { method: 'PUT', body: JSON.stringify({ room: 'Salle 3' }) });
    expect(document.querySelector('.toast.success').textContent).toBe('Équipe assignée à Salle 3');

    await rooms.handleRoomChange(4, '', api, loadData);
    expect(api).toHaveBeenLastCalledWith('/admin/rooms/4', { method: 'PUT', body: JSON.stringify({ room: null }) });

    vi.spyOn(console, 'error').mockImplementation(() => {});
    await rooms.handleRoomChange(4, 'x', vi.fn().mockRejectedValue(new Error('x')), loadData);
    expect(document.querySelector('.toast.error').textContent).toBe("Erreur lors de l'assignation");
  });
});

describe('attendance module', () => {
  it('escapes hostile text, including an unknown payment tier', () => {
    state.setAttendanceData([member({
      first_name: XSS_PAYLOAD,
      last_name: QUOTE_PAYLOAD,
      email: 'a@b.co',
      team_name: XSS_PAYLOAD,
      payment_tier: XSS_PAYLOAD,
      payment_amount: 500
    })]);
    attendance.renderAttendance();

    const tbody = byId('attendance-tbody');
    expect(tbody.querySelector('img')).toBeNull();
    expect(findInlineHandlers(tbody)).toEqual([]);
    expect(cellsOf(rowsOf(tbody)[0])[0].textContent).toBe(`${XSS_PAYLOAD} ${QUOTE_PAYLOAD}`);
    expect(cellsOf(rowsOf(tbody)[0])[5].textContent).toContain(XSS_PAYLOAD);
  });

  it('labels known payment tiers and statuses', () => {
    state.setAttendanceData([
      member({ id: 1, payment_status: 'paid', registration_tier: 'tier1', payment_amount: 500 }),
      member({ id: 2, first_name: 'B', payment_status: 'delayed' }),
      member({ id: 3, first_name: 'C', payment_status: 'pending' }),
      member({ id: 4, first_name: 'D', payment_tier: 'constructor' }),
      member({ id: 5, first_name: 'E' }),
      // historical rows written by the former online payment are still displayed safely
      member({ id: 6, first_name: 'F', payment_tier: 'online_tier1<b>', payment_amount: 500 }),
      member({ id: 7, first_name: 'G', payment_status: 'paid', registration_tier: 'constructor' })
    ]);
    attendance.renderAttendance();

    const cell = (id) => cellsOf(byId('attendance-tbody').querySelector(`tr[data-member-id="${id}"]`))[5].textContent;
    expect(cell(1)).toContain('Anticipé');
    expect(cell(2)).toContain('À payer');
    expect(cell(3)).toContain('En cours');
    expect(cell(4)).toContain('constructor');
    expect(cell(5).trim()).toBe('-');
    expect(cell(6)).toContain('online_tier1<b>');
    expect(byId('attendance-tbody').querySelector('b')).toBeNull();
    expect(cell(7)).toContain('En ligne');
  });

  it('filters by presence and by search term', () => {
    state.setAttendanceData([
      member({ id: 1, first_name: 'Ann', checked_in: 1 }),
      member({ id: 2, first_name: 'Bob', last_name: 'Beta', email: 'bob@x.co' })
    ]);

    state.setAttendanceFilter('present');
    attendance.renderAttendance();
    expect(rowsOf('attendance-tbody').map(r => r.dataset.memberId)).toEqual(['1']);

    state.setAttendanceFilter('absent');
    attendance.renderAttendance();
    expect(rowsOf('attendance-tbody').map(r => r.dataset.memberId)).toEqual(['2']);

    state.setAttendanceFilter('all');
    state.setAttendanceSearchTerm('beta');
    attendance.renderAttendance();
    expect(rowsOf('attendance-tbody').map(r => r.dataset.memberId)).toEqual(['2']);

    state.setAttendanceSearchTerm('nobody');
    attendance.renderAttendance();
    expect(byId('attendance-tbody').textContent).toContain('Aucun participant trouvé');
  });

  it('sortable headers set data-sort on the active column only', () => {
    attendance.initAttendance(vi.fn());
    state.setAttendanceData([member({ id: 1, first_name: 'Zed' }), member({ id: 2, first_name: 'Abe' })]);
    attendance.renderAttendance();
    const [name, team] = document.querySelectorAll('#attendance-table th.sortable');

    team.click();
    expect(team.dataset.sort).toBe('asc');
    expect(name.hasAttribute('data-sort')).toBe(false);

    name.click();
    expect(name.dataset.sort).toBe('asc');
    expect(rowsOf('attendance-tbody').map(r => r.dataset.memberId)).toEqual(['2', '1']);
    name.click();
    expect(name.dataset.sort).toBe('desc');
    expect(rowsOf('attendance-tbody').map(r => r.dataset.memberId)).toEqual(['1', '2']);
  });

  it('check-in opens the payment modal with the offers valid before the cutoff', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2030, 11, 5, 10, 0, 0));
    state.setAttendanceData([member({ id: 9 })]);

    await attendance.handleCheckIn(9, vi.fn(), vi.fn());

    expect(byId('checkin-modal').classList.contains('hidden')).toBe(false);
    expect(byId('checkin-member-id').value).toBe('9');
    expect(byId('checkin-member-name').textContent).toBe('Ann Alpha');
    expect(byId('option-late').classList.contains('hidden')).toBe(true);
    expect(byId('option-non-member').classList.contains('hidden')).toBe(false);
    expect(document.querySelector('input[name="payment-tier"]:checked').value).toBe('asso_member');
  });

  it('after the cutoff time the late option replaces the non-member one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2030, 11, 5, 21, 30, 0));
    state.setAttendanceData([member({ id: 9, payment_status: 'delayed' })]);

    await attendance.handleCheckIn(9, vi.fn(), vi.fn());

    expect(byId('option-late').classList.contains('hidden')).toBe(false);
    expect(byId('option-non-member').classList.contains('hidden')).toBe(true);
    expect(byId('checkin-member-name').textContent).toBe('Ann Alpha (paiement sur place)');
  });

  it('a historical member already marked paid is checked in without the modal and without touching the stored payment', async () => {
    state.setAttendanceData([member({ id: 9, payment_status: 'paid', registration_tier: 'tier2', payment_amount: 700 })]);
    const api = vi.fn().mockResolvedValue({});
    const loadData = vi.fn();

    await attendance.handleCheckIn(9, api, loadData);

    expect(byId('checkin-modal').classList.contains('hidden')).toBe(true);
    expect(api).toHaveBeenCalledWith('/admin/attendance/check-in/9', {
      method: 'POST',
      body: JSON.stringify({})
    });
    expect(loadData).toHaveBeenCalled();
  });

  it('confirmCheckIn posts the chosen tier and amount, then closes the modal', async () => {
    attendance.setPricingSettings({ priceNonMember: 800 });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2030, 11, 5, 10, 0, 0));
    state.setAttendanceData([member({ id: 9 })]);
    await attendance.handleCheckIn(9, vi.fn(), vi.fn());
    document.querySelector('input[name="payment-tier"][value="non_member"]').checked = true;

    const api = vi.fn().mockResolvedValue({});
    const loadData = vi.fn();
    await attendance.confirmCheckIn(api, loadData);

    expect(api).toHaveBeenCalledWith('/admin/attendance/check-in/9', {
      method: 'POST',
      body: JSON.stringify({ paymentTier: 'non_member', paymentAmount: 800 })
    });
    expect(byId('checkin-modal').classList.contains('hidden')).toBe(true);
    expect(loadData).toHaveBeenCalled();
  });

  it('check-out calls the endpoint and announces the cancellation', async () => {
    const api = vi.fn().mockResolvedValue({});
    await attendance.handleCheckOut(3, api, vi.fn());
    expect(api).toHaveBeenCalledWith('/admin/attendance/check-out/3', { method: 'POST' });
    expect(document.querySelector('.toast.success').textContent).toBe('Présence annulée');
  });

  it('check-in ignores a member that is not in the loaded list', async () => {
    const api = vi.fn();
    await attendance.handleCheckIn(404, api, vi.fn());
    expect(api).not.toHaveBeenCalled();
    expect(byId('checkin-modal').classList.contains('hidden')).toBe(true);
  });
});

describe('archives module', () => {
  const archive = (overrides = {}) => ({
    event_year: 2024,
    archived_at: '2024-12-06T10:00:00Z',
    total_teams: 3,
    total_participants: 12,
    total_revenue: 5000,
    is_expired: 0,
    ...overrides
  });

  it('renders one card per archive with view / delete actions', () => {
    state.setArchivesData([archive(), archive({ event_year: 2023, is_expired: 1, total_revenue: 0 })]);
    archives.renderArchivesList();

    const cards = byId('archives-container').querySelectorAll('.archive-card');
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector('.archive-card-year').textContent).toBe('Édition 2024');
    expect(cards[0].textContent).toContain('50.00€');
    expect(cards[1].classList.contains('expired')).toBe(true);
    expect(cards[1].textContent).not.toContain('€');
    expect(byId('archives-container').querySelector('[data-action="view-archive"][data-year="2024"]')).not.toBeNull();
    expect(byId('archives-container').querySelector('[data-action="delete-archive"][data-year="2023"]')).not.toBeNull();
    expect(findInlineHandlers(byId('archives-container'))).toEqual([]);
  });

  it('explains how to create the first archive when there is none', () => {
    state.setArchivesData([]);
    archives.renderArchivesList();
    expect(byId('archives-container').textContent).toContain('Aucune archive');
  });

  it('renders an archive detail with escaped names and flags anonymized people', () => {
    state.setSelectedArchive({
      ...archive({ is_expired: 1 }),
      teams_json: JSON.stringify([{ id: 1, name: XSS_PAYLOAD, member_count: 2, room_name: XSS_PAYLOAD }]),
      members_json: JSON.stringify([
        { team_id: 1, first_name: XSS_PAYLOAD, last_name: 'X', email: 'a@b.co', bac_level: 2 },
        { team_id: 1, first_name: 'Participant', last_name: '', email: null, bac_level: 3 }
      ])
    });
    archives.renderArchiveDetail();

    expect(byId('archive-detail').querySelector('img')).toBeNull();
    expect(byId('archive-detail-title').textContent).toBe('Édition 2024');
    expect(cellsOf(rowsOf('archive-teams-tbody')[0])[0].textContent).toBe(XSS_PAYLOAD);
    expect(cellsOf(rowsOf('archive-members-tbody')[1])[1].querySelector('em').textContent).toBe('anonymisé');
    expect(byId('archive-gdpr-notice').classList.contains('hidden')).toBe(false);
  });

  it('viewArchive fetches the year and reveals the detail section', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const api = vi.fn().mockResolvedValue({ archive: { ...archive(), teams_json: '[]', members_json: '[]' } });

    await archives.viewArchive(2024, api);
    expect(api).toHaveBeenCalledWith('/admin/archives/2024', { method: 'GET' });
    expect(byId('archive-detail').classList.contains('hidden')).toBe(false);
  });

  it('deleteArchive asks for confirmation first and explains the dev-only restriction (403)', async () => {
    const api = vi.fn().mockRejectedValue(Object.assign(new Error('Accès interdit'), { status: 403 }));
    const reload = vi.fn();

    vi.stubGlobal('confirm', vi.fn(() => false));
    await archives.deleteArchive(2024, api, reload);
    expect(api).not.toHaveBeenCalled();

    vi.stubGlobal('confirm', vi.fn(() => true));
    await archives.deleteArchive(2024, api, reload);
    expect(api).toHaveBeenCalledWith('/admin/archives/2024', { method: 'DELETE' });
    expect(document.querySelector('.toast.error').textContent).toContain('environnement de développement');
  });

  it('createArchive and deleteArchive tell apart the HTTP statuses of the server', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.stubGlobal('prompt', vi.fn(() => '2025'));
    const fail = (status) => vi.fn().mockRejectedValue(Object.assign(new Error('x'), { status }));
    const lastToast = () => [...document.querySelectorAll('.toast.error')].at(-1).textContent;

    await archives.createArchive(fail(409), vi.fn());
    expect(lastToast()).toContain('existe déjà');
    await archives.createArchive(fail(400), vi.fn());
    expect(lastToast()).toContain('Aucune donnée');
    await archives.createArchive(fail(500), vi.fn());
    expect(lastToast()).toContain('Erreur lors de la création');

    await archives.deleteArchive(2024, fail(404), vi.fn());
    expect(lastToast()).toContain('Archive introuvable');
  });

  it('exportArchiveJson downloads through the api client, so it always uses the live token', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const api = vi.fn().mockResolvedValue({ filename: 'ndi-2024-archive.json', export: { teams: [] } });

    await archives.exportArchiveJson(api); // nothing selected yet
    expect(api).not.toHaveBeenCalled();

    state.setSelectedArchive({ ...archive(), teams_json: '[]', members_json: '[]' });
    await archives.exportArchiveJson(api);

    expect(api).toHaveBeenCalledWith('/admin/archives/2024/export');
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.toast.success').textContent).toContain('Export JSON');
  });

  it('shows an error placeholder when loading the list fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await archives.loadArchives(vi.fn().mockRejectedValue(new Error('x')));
    expect(byId('archives-container').textContent).toContain('Erreur lors du chargement');
  });
});

describe('settings module', () => {
  it('renders the configured pizzas with escaped values and no inline handlers', () => {
    state.settingsState.pizzas = [{ id: XSS_PAYLOAD, name: QUOTE_PAYLOAD, description: '<script>x</script>' }];
    settings.renderPizzasList();

    const list = byId('pizzas-list');
    expect(list.querySelector('img')).toBeNull();
    expect(list.querySelector('script')).toBeNull();
    expect(list.querySelector('.pizza-item-id').textContent).toBe(XSS_PAYLOAD);
    expect(list.querySelector('.pizza-item-name').textContent).toBe(QUOTE_PAYLOAD);
    expect(findInlineHandlers(list)).toEqual([]);
  });

  it('shows a placeholder when no pizza is configured and wires delete buttons', () => {
    state.settingsState.pizzas = [];
    settings.renderPizzasList();
    expect(byId('pizzas-list').textContent).toContain('Aucune pizza configurée');
  });

  it('loadSettings maps the API strings to numbers, booleans and defaults', async () => {
    const api = vi.fn().mockResolvedValue({
      settings: {
        max_team_size: '8', max_total_participants: '120', min_team_size: '2', school_name: 'Test School',
        pizzas: [{ id: 'a', name: 'A' }], price_late: '1200', gdpr_retention_years: '5'
      }
    });

    await settings.loadSettings(api);
    expect(state.settingsState).toMatchObject({
      maxTeamSize: 8, maxTotalParticipants: 120, minTeamSize: 2, schoolName: 'Test School', gdprRetentionYears: 5, isDirty: false
    });
    expect(state.settingsState.pizzas).toEqual([{ id: 'a', name: 'A' }]);
    expect(state.pricingSettings).toEqual({ priceAssoMember: 500, priceNonMember: 800, priceLate: 1200, lateCutoffTime: '19:00' });
    expect(state.pizzasConfig).toEqual([{ id: 'a', name: 'A' }]);
  });

  it('loadSettings falls back to defaults for empty or invalid values', async () => {
    await settings.loadSettings(vi.fn().mockResolvedValue({ settings: { max_team_size: 'abc' } }));
    expect(state.settingsState).toMatchObject({ maxTeamSize: 15, maxTotalParticipants: 200, minTeamSize: 1, gdprRetentionYears: 3 });
    expect(state.pricingSettings.priceLate).toBe(1000);
  });
});

describe('state', () => {
  it('clearState resets the lists and the selection but keeps settings', () => {
    state.setTeamsData([{ id: 1 }]);
    state.selectedMembers.add(5);
    state.setCsvData('x');
    state.setArchivesData([1]);
    state.setPizzaData([1]);
    state.setRoomsData([1]);
    state.setAttendanceData([1]);
    state.setPizzasConfig([{ id: 'a' }]);

    state.clearState();

    expect(state.teamsData).toEqual([]);
    expect(state.selectedMembers.size).toBe(0);
    expect(state.csvData).toBeNull();
    expect(state.archivesData).toEqual([]);
    expect(state.pizzaData).toEqual([]);
    expect(state.roomsData).toEqual([]);
    expect(state.attendanceData).toEqual([]);
    expect(state.pizzasConfig).toEqual([]);
    expect(state.settingsState.maxTeamSize).toBe(15);
  });

  it('setters update the exported bindings', () => {
    state.setAllParticipantsSearchTerm('abc');
    state.setAllParticipantsSortKey('email');
    state.setAllParticipantsSortDir('desc');
    state.setPizzaFilter('pending');
    state.setRoomFilter('assigned');

    expect([state.allParticipantsSearchTerm, state.allParticipantsSortKey, state.allParticipantsSortDir, state.pizzaFilter, state.roomFilter])
      .toEqual(['abc', 'email', 'desc', 'pending', 'assigned']);
  });
});
