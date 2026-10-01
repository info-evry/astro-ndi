/* global Blob, Element, Event, HTMLAnchorElement, MouseEvent, document, window */
/**
 * Delegated click / change dispatch: the design system's bindDelegation fed
 * with the maps built by actions.js, the data-action contract between rendered
 * markup and the handler map, and end-to-end flows through the real handlers.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MODALS_HTML, XSS_PAYLOAD, QUOTE_PAYLOAD, sampleTeams, trackDocumentListeners, flush } from './helpers.js';

let untrack;
let mods;

beforeEach(async () => {
  vi.resetModules();
  untrack = trackDocumentListeners();
  document.body.innerHTML = '';
  mods = {
    actions: await import('../../src/client/admin/actions.js'),
    delegation: await import('@info-evry/astro-design/scripts/delegation'),
    reg: await import('../../src/client/admin/registrations.js'),
    state: await import('../../src/client/admin/state.js'),
    modal: await import('@info-evry/astro-design/scripts/modal'),
    attendance: await import('../../src/client/admin/attendance.js'),
    pizza: await import('../../src/client/admin/pizza.js'),
    rooms: await import('../../src/client/admin/rooms.js'),
    archives: await import('../../src/client/admin/archives.js')
  };
});

afterEach(() => {
  untrack();
  document.body.innerHTML = '';
});

const click = (el, init = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
const change = (el) => el.dispatchEvent(new Event('change', { bubbles: true }));

describe('bindDelegation', () => {
  it('dispatches a click on the closest [data-action] ancestor, with the element and the event', () => {
    const handler = vi.fn();
    document.body.innerHTML = '<button data-action="go" data-id="5"><span><i id="inner">icon</i></span></button>';
    mods.delegation.bindDelegation({ go: handler }, {});

    click(document.getElementById('inner'));

    expect(handler).toHaveBeenCalledTimes(1);
    const [el, event] = handler.mock.calls[0];
    expect(el.dataset.id).toBe('5');
    expect(event.type).toBe('click');
  });

  it('prevents the default action of handled clicks only', () => {
    document.body.innerHTML = '<a href="#x" data-action="known">k</a><a href="#y" data-action="unknown">u</a><a href="#z">plain</a>';
    mods.delegation.bindDelegation({ known: vi.fn() }, {});
    const [known, unknown, plain] = document.querySelectorAll('a');

    expect(click(known)).toBe(false);
    expect(click(unknown)).toBe(true);
    expect(click(plain)).toBe(true);
  });

  it('ignores clicks outside any data-action and unknown actions without throwing', () => {
    document.body.innerHTML = '<div id="plain">x</div><button data-action="nope">n</button>';
    mods.delegation.bindDelegation({}, {});

    expect(() => click(document.getElementById('plain'))).not.toThrow();
    expect(() => click(document.querySelector('button'))).not.toThrow();
  });

  it('uses the innermost action when actions are nested', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    document.body.innerHTML = '<div data-action="outer"><button data-action="inner" id="b">b</button></div>';
    mods.delegation.bindDelegation({ outer, inner }, {});

    click(document.getElementById('b'));
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it('data-stop keeps the click from bubbling past the document', () => {
    const windowListener = vi.fn();
    window.addEventListener('click', windowListener);
    document.body.innerHTML = '<button data-action="go" data-stop id="stop">s</button><button data-action="go" id="free">f</button>';
    mods.delegation.bindDelegation({ go: vi.fn() }, {});

    click(document.getElementById('free'));
    expect(windowListener).toHaveBeenCalledTimes(1);

    click(document.getElementById('stop'));
    expect(windowListener).toHaveBeenCalledTimes(1);
    window.removeEventListener('click', windowListener);
  });

  it('toggle-disclosure opens its group, and stop-propagation wrappers inside the header do not toggle it', () => {
    const { actions } = mods.actions.buildActions({ api: vi.fn(), loadData: vi.fn(), updateDeleteButton: vi.fn() });
    document.body.innerHTML = `
      <div data-disclosure="group-1" id="group">
        <div data-action="toggle-disclosure" id="header">
          <span id="title">Title</span>
          <div data-action="stop-propagation"><button type="button" id="header-button">Refresh</button></div>
        </div>
      </div>`;
    mods.delegation.bindDelegation(actions, {});
    const group = document.getElementById('group');

    click(document.getElementById('header-button'));
    expect(group.classList.contains('open')).toBe(false);

    click(document.getElementById('title'));
    expect(group.classList.contains('open')).toBe(true);
    click(document.getElementById('header'));
    expect(group.classList.contains('open')).toBe(false);
  });

  it('dispatches change events to the closest [data-change] element', () => {
    const handler = vi.fn();
    document.body.innerHTML = '<label data-change="pick"><input id="field" type="checkbox"></label><input id="other">';
    mods.delegation.bindDelegation({}, { pick: handler });

    change(document.getElementById('field'));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].dataset.change).toBe('pick');
    expect(handler.mock.calls[0][1].type).toBe('change');

    change(document.getElementById('other'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('never dispatches inherited names (constructor, __proto__) and reports handler failures to onError', async () => {
    const onError = vi.fn();
    document.body.innerHTML = '<button data-action="constructor" id="c">c</button><button data-action="boom" id="b">b</button>';
    mods.delegation.bindDelegation({ boom: () => { throw new Error('handler failed'); } }, {}, { onError });

    expect(() => click(document.getElementById('c'))).not.toThrow();
    expect(onError).not.toHaveBeenCalled();

    click(document.getElementById('b'));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe('handler failed');
  });

  it('survives a change with an unknown handler name', () => {
    document.body.innerHTML = '<input id="x" data-change="missing">';
    mods.delegation.bindDelegation({}, {});
    expect(() => change(document.getElementById('x'))).not.toThrow();
  });
});

describe('data-action contract between markup and handlers', () => {
  it('every action and change name rendered by the admin modules has a handler', () => {
    document.body.innerHTML = `
      <div id="teams-container"></div>
      <table><tbody id="all-participants-tbody"></tbody></table>
      <table><tbody id="attendance-tbody"></tbody></table>
      <table><tbody id="pizza-tbody"></tbody></table>
      <table><tbody id="rooms-tbody"></tbody></table>
      <div id="archives-container"></div>
      ${MODALS_HTML}`;
    const { reg, state, attendance, pizza, rooms, archives } = mods;

    reg.renderTeams(sampleTeams(), document.getElementById('teams-container'));
    reg.renderAllParticipants();
    const member = { id: 1, first_name: 'A', last_name: 'B', email: 'a@b.co', team_name: 'T', checked_in: 0, pizza_received: 0, food_diet: 'x' };
    state.setAttendanceData([member, { ...member, id: 2, checked_in: 1 }]);
    attendance.renderAttendance();
    state.setPizzaData([member, { ...member, id: 2, pizza_received: 1 }]);
    pizza.renderPizza();
    state.setRoomsData([{ id: 1, name: 'T', room: 'A', member_count: 1 }, { id: 2, name: 'U', room: null, member_count: 1 }]);
    rooms.renderRooms();
    state.setArchivesData([{ event_year: 2024, archived_at: '2024-12-01T00:00:00Z', total_teams: 1, total_participants: 2, total_revenue: 0 }]);
    archives.renderArchivesList();

    const { actions, changes } = mods.actions.buildActions({ api: vi.fn(), loadData: vi.fn(), updateDeleteButton: vi.fn() });

    const usedActions = new Set([...document.querySelectorAll('[data-action]')].map(el => el.dataset.action));
    const usedChanges = new Set([...document.querySelectorAll('[data-change]')].map(el => el.dataset.change));
    expect(usedActions.size).toBeGreaterThan(8);
    expect(usedChanges.size).toBe(3);

    for (const name of usedActions) {
      // sort-team / sort-all-participants live in the table headers, which the fixtures above do not all render
      expect(actions, `missing click handler "${name}"`).toHaveProperty(name);
    }
    for (const name of usedChanges) {
      expect(changes, `missing change handler "${name}"`).toHaveProperty(name);
    }
  });

  it('exposes handlers for the static page markup (load-data, toggle-disclosure, confirm-checkin, stop-propagation)', () => {
    const { actions } = mods.actions.buildActions({ api: vi.fn(), loadData: vi.fn(), updateDeleteButton: vi.fn() });
    for (const name of ['load-data', 'toggle-disclosure', 'confirm-checkin', 'stop-propagation', 'sort-team', 'sort-all-participants']) {
      expect(typeof actions[name]).toBe('function');
    }
  });
});

describe('end-to-end through the real handlers', () => {
  let api;
  let loadData;
  let updateDeleteButton;
  const container = () => document.getElementById('teams-container');

  beforeEach(() => {
    document.body.innerHTML = `<div id="teams-container"></div><button id="delete-selected-btn" disabled>x</button>${MODALS_HTML}`;
    api = vi.fn().mockResolvedValue({});
    loadData = vi.fn();
    updateDeleteButton = vi.fn();
    mods.modal.initModals();
    const { actions, changes } = mods.actions.buildActions({ api, loadData, updateDeleteButton });
    mods.delegation.bindDelegation(actions, changes);
    mods.reg.renderTeams(sampleTeams(), container());
  });

  it('clicking a team header toggles it, clicking a header button does not', () => {
    const block = container().querySelector('.team-block[data-team-id="1"]');

    click(block.querySelector('.team-header h3'));
    expect(block.classList.contains('open')).toBe(true);
    click(block.querySelector('.team-header'));
    expect(block.classList.contains('open')).toBe(false);

    click(block.querySelector('[data-action="edit-team"]'));
    expect(block.classList.contains('open')).toBe(false);
    expect(document.getElementById('team-modal').classList.contains('hidden')).toBe(false);
  });

  it('the delete-member flow: click, confirm message, confirm click, API call, reload', async () => {
    const button = container().querySelector('[data-action="confirm-delete-member"][data-member-id="11"]');

    click(button.querySelector('*') || button);
    expect(document.getElementById('confirm-modal').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('confirm-message').textContent).toContain('Zoe Zed');

    click(document.getElementById('confirm-delete-btn'));
    await flush(2);
    expect(api).toHaveBeenCalledWith('/admin/members/11', { method: 'DELETE' });
    expect(loadData).toHaveBeenCalled();
  });

  it('the delete-team flow passes the exact team name through the data attribute', () => {
    mods.reg.renderTeams([{ id: 9, name: `${XSS_PAYLOAD} ${QUOTE_PAYLOAD}`, members: [] }], container());

    click(container().querySelector('[data-action="confirm-delete-team"]'));
    expect(document.getElementById('confirm-message').textContent).toContain(`"${XSS_PAYLOAD} ${QUOTE_PAYLOAD}"`);
    expect(document.getElementById('confirm-message').children).toHaveLength(0);
  });

  it('export buttons call the API with the numeric team id', async () => {
    api.mockResolvedValue({ blob: async () => new Blob(['x']) });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    click(container().querySelector('[data-action="export-team"][data-team-id="1"]'));
    click(container().querySelector('[data-action="export-team-official"][data-team-id="1"]'));
    await flush(2);

    expect(api).toHaveBeenCalledWith('/admin/export/1');
    expect(api).toHaveBeenCalledWith('/admin/export-official/1');
  });

  it('change on a member checkbox updates the selection and the delete button', () => {
    const checkbox = container().querySelector('[data-change="toggle-member-select"][data-member-id="11"]');

    checkbox.checked = true;
    change(checkbox);
    expect(mods.state.selectedMembers.has(11)).toBe(true);
    expect(updateDeleteButton).toHaveBeenCalledTimes(1);

    checkbox.checked = false;
    change(checkbox);
    expect(mods.state.selectedMembers.has(11)).toBe(false);
  });

  it('change on the select-all checkbox selects the whole team', () => {
    const all = container().querySelector('[data-change="toggle-select-all"][data-team-id="1"]');
    all.checked = true;
    change(all);

    expect([...mods.state.selectedMembers].sort()).toEqual([11, 12]);
    expect(container().querySelectorAll('.team-block[data-team-id="1"] .member-row input:checked')).toHaveLength(2);
  });

  it('clicking a sortable header sorts that team and flags the header', () => {
    const th = container().querySelector('.team-block[data-team-id="1"] th[data-sort-key="email"]');

    click(th);
    expect(th.dataset.sort).toBe('asc');
    click(th);
    expect(th.dataset.sort).toBe('desc');
  });

  it('attendance, pizza and room buttons call their endpoints with the member / team id', async () => {
    document.body.insertAdjacentHTML('beforeend', `
      <table><tbody id="attendance-tbody"></tbody></table>
      <table><tbody id="pizza-tbody"></tbody></table>
      <table><tbody id="rooms-tbody"></tbody></table>`);
    const member = { id: 31, first_name: 'A', last_name: 'B', email: 'a@b.co', team_name: 'T', checked_in: 1, pizza_received: 0, food_diet: 'x' };
    mods.state.setAttendanceData([member]);
    mods.attendance.renderAttendance();
    mods.state.setPizzaData([member]);
    mods.pizza.renderPizza();
    mods.state.setRoomsData([{ id: 41, name: 'T', room: 'A', member_count: 1 }]);
    mods.rooms.renderRooms();

    click(document.querySelector('#attendance-tbody [data-action="check-out"]'));
    click(document.querySelector('#pizza-tbody [data-action="give-pizza"]'));
    click(document.querySelector('#rooms-tbody [data-action="clear-room"]'));
    await flush(2);

    expect(api).toHaveBeenCalledWith('/admin/attendance/check-out/31', { method: 'POST' });
    expect(api).toHaveBeenCalledWith('/admin/pizza/give/31', { method: 'POST' });
    expect(api).toHaveBeenCalledWith('/admin/rooms/41', { method: 'PUT', body: JSON.stringify({ room: null }) });
  });

  it('typing a room name sends a PUT for that team', async () => {
    document.body.insertAdjacentHTML('beforeend', '<table><tbody id="rooms-tbody"></tbody></table>');
    mods.state.setRoomsData([{ id: 41, name: 'T', room: '', member_count: 1 }]);
    mods.rooms.renderRooms();

    const input = document.querySelector('#rooms-tbody input[data-change="room-change"]');
    input.value = 'Salle 9';
    change(input);
    await flush(2);

    expect(api).toHaveBeenCalledWith('/admin/rooms/41', { method: 'PUT', body: JSON.stringify({ room: 'Salle 9' }) });
  });

  it('archive cards dispatch view-archive with the numeric year', async () => {
    document.body.insertAdjacentHTML('beforeend', '<div id="archives-container"></div>');
    mods.state.setArchivesData([{ event_year: 2023, archived_at: '2023-12-01T00:00:00Z', total_teams: 1, total_participants: 2, total_revenue: 0 }]);
    mods.archives.renderArchivesList();
    api.mockResolvedValue({ archive: { event_year: 2023, teams_json: '[]', members_json: '[]', total_teams: 0, total_participants: 0, total_revenue: 0, archived_at: '2023-12-01T00:00:00Z' } });
    Element.prototype.scrollIntoView = vi.fn();

    click(document.querySelector('[data-action="view-archive"]'));
    await flush(2);
    expect(api).toHaveBeenCalledWith('/admin/archives/2023', { method: 'GET' });
  });
});
