/* global Blob, Event, HTMLAnchorElement, document */
/**
 * Admin registrations tab: rendering, escaping, sorting contract, selection
 * and modal / form flows (happy-dom).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MODALS_HTML, XSS_PAYLOAD, QUOTE_PAYLOAD, findInlineHandlers, sampleTeams, flush } from './helpers.js';

let reg;
let state;

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = `
    <div id="stats-grid"></div>
    <div id="food-stats"></div>
    <input id="teams-search">
    <div id="teams-container"></div>
    <table id="all-participants-table">
      <thead><tr>
        <th class="sortable" data-sort-key="name" data-action="sort-all-participants">Nom</th>
        <th class="sortable" data-sort-key="email" data-action="sort-all-participants">Email</th>
        <th class="sortable" data-sort-key="team" data-action="sort-all-participants">Équipe</th>
      </tr></thead>
      <tbody id="all-participants-tbody"></tbody>
    </table>
    <input id="all-participants-search">
    ${MODALS_HTML}
  `;
  state = await import('../../src/client/admin/state.js');
  reg = await import('../../src/client/admin/registrations.js');
});

afterEach(() => {
  document.body.innerHTML = '';
});

const container = () => document.getElementById('teams-container');

function hostileTeams() {
  return [{
    id: 7,
    name: `${XSS_PAYLOAD} ${QUOTE_PAYLOAD}`,
    description: XSS_PAYLOAD,
    room: XSS_PAYLOAD,
    members: [{
      id: 70,
      first_name: XSS_PAYLOAD,
      last_name: QUOTE_PAYLOAD,
      email: `"onmouseover="alert(1)@x.co`,
      bac_level: 2,
      is_leader: 0,
      food_diet: XSS_PAYLOAD
    }]
  }];
}

describe('renderTeams', () => {
  it('renders one block per team with delegated data-action attributes and no inline handlers', () => {
    reg.renderTeams(sampleTeams(), container());

    expect(container().querySelectorAll('.team-block')).toHaveLength(2);
    const actions = new Set([...container().querySelectorAll('[data-action]')].map(el => el.dataset.action));
    expect(actions).toEqual(new Set([
      'toggle-team', 'edit-team', 'export-team', 'export-team-official', 'confirm-delete-team',
      'sort-team', 'edit-member', 'confirm-delete-member'
    ]));
    expect(findInlineHandlers(container())).toEqual([]);
    expect(container().innerHTML).not.toMatch(/onclick=|onchange=|javascript:/i);
  });

  it('puts the ids on the elements the dispatcher reads', () => {
    reg.renderTeams(sampleTeams(), container());

    const edit = container().querySelector('[data-action="edit-member"][data-member-id="11"]');
    expect(edit.dataset.teamId).toBe('1');
    expect(container().querySelector('.team-block[data-team-id="2"] [data-action="confirm-delete-member"]').dataset.memberId).toBe('21');
    expect(container().querySelector('[data-change="toggle-member-select"][data-member-id="12"]')).not.toBeNull();
    expect(container().querySelector('[data-change="toggle-select-all"][data-team-id="1"]')).not.toBeNull();
  });

  it('does not offer to delete the Organisation team', () => {
    reg.renderTeams(sampleTeams(), container());

    expect(container().querySelector('.team-block[data-team-id="1"] [data-action="confirm-delete-team"]')).not.toBeNull();
    expect(container().querySelector('.team-block[data-team-id="2"] [data-action="confirm-delete-team"]')).toBeNull();
  });

  it('shows the room badge, description and member count', () => {
    reg.renderTeams(sampleTeams(), container());
    const block = container().querySelector('.team-block[data-team-id="1"]');

    expect(block.querySelector('h3').textContent).toContain('Alpha');
    expect(block.querySelector('.badge-muted').textContent).toBe('Salle A');
    expect(block.querySelector('.team-body em').textContent).toBe('First team');
    expect(block.querySelector('.team-info').textContent).toContain('2 membre(s)');
  });

  it('escapes hostile team and member data: the payload stays text, the markup stays intact', () => {
    const baseline = document.createElement('div');
    reg.renderTeams([{ ...hostileTeams()[0], name: 'n', description: 'd', room: 'r', members: [{ ...hostileTeams()[0].members[0], first_name: 'f', last_name: 'l', email: 'e@x.co', food_diet: 'x' }] }], baseline);
    reg.renderTeams(hostileTeams(), container());

    expect(container().querySelector('img')).toBeNull();
    expect(findInlineHandlers(container())).toEqual([]);
    // same element structure as with harmless data
    expect(container().querySelectorAll('*')).toHaveLength(baseline.querySelectorAll('*').length);

    const team = hostileTeams()[0];
    expect(container().querySelector('h3').textContent).toContain(team.name);
    expect(container().querySelector('.badge-muted').textContent).toBe(XSS_PAYLOAD);
    expect(container().querySelector('.team-body em').textContent).toBe(XSS_PAYLOAD);
    const cells = container().querySelectorAll('.member-row td');
    expect(cells[1].textContent).toBe(`${XSS_PAYLOAD} ${QUOTE_PAYLOAD}`);
    expect(cells[4].textContent).toBe(XSS_PAYLOAD);
  });

  it('round-trips quotes and brackets in team names through data attributes', () => {
    reg.renderTeams(hostileTeams(), container());

    const exportBtn = container().querySelector('[data-action="export-team"]');
    expect(exportBtn.dataset.teamName).toBe(hostileTeams()[0].name);
    const deleteMember = container().querySelector('[data-action="confirm-delete-member"]');
    expect(deleteMember.dataset.memberName).toBe(`${XSS_PAYLOAD} ${QUOTE_PAYLOAD}`);
  });

  it('keeps a hostile email inside the mailto link instead of opening new attributes', () => {
    reg.renderTeams(hostileTeams(), container());

    const link = container().querySelector('a[href^="mailto:"]');
    expect(link.getAttribute('href')).toBe('mailto:"onmouseover="alert(1)@x.co');
    expect([...link.attributes].map(a => a.name).sort()).toEqual(['href']);
  });

  it('renders placeholders for no teams and for a team without members', () => {
    reg.renderTeams([], container());
    expect(container().textContent).toContain('Aucune équipe inscrite');

    reg.renderTeams([{ id: 3, name: 'Empty', members: [] }], container());
    expect(container().querySelector('.team-body').textContent).toContain('Aucun membre');
    expect(container().querySelector('table')).toBeNull();
  });

  it('sorts members by name and marks selected members as checked', () => {
    state.selectedMembers.add(12);
    reg.renderTeams(sampleTeams(), container());

    const rows = [...container().querySelectorAll('.team-block[data-team-id="1"] .member-row')];
    expect(rows.map(r => r.dataset.memberId)).toEqual(['12', '11']);
    expect(rows[0].querySelector('input[type="checkbox"]').checked).toBe(true);
    expect(rows[1].querySelector('input[type="checkbox"]').checked).toBe(false);
  });

  it('refreshes the team select used by the member form', () => {
    reg.renderTeams(hostileTeams(), container());

    const options = [...document.getElementById('member-form-team').options];
    expect(options).toHaveLength(1);
    expect(options[0].value).toBe('7');
    expect(options[0].textContent).toBe(hostileTeams()[0].name);
  });
});

describe('sort contract (th.sortable[data-sort])', () => {
  function headers() {
    return [...container().querySelectorAll('th.sortable')];
  }

  it('declares the sortable columns with a data-sort-key and no active direction', () => {
    reg.renderTeams(sampleTeams(), container());
    const sortable = container().querySelectorAll('.team-block[data-team-id="1"] th.sortable');

    expect([...sortable].map(th => th.dataset.sortKey)).toEqual(['name', 'email', 'bac']);
    expect(container().querySelectorAll('th.sortable[data-sort]')).toHaveLength(0);
  });

  it('sets data-sort on the clicked header only and toggles asc / desc', () => {
    reg.renderTeams(sampleTeams(), container());
    const [nameTh, emailTh] = [...container().querySelectorAll('.team-block[data-team-id="1"] th.sortable')];

    reg.sortTeamMembers(1, 'email', emailTh);
    expect(emailTh.dataset.sort).toBe('asc');
    expect(nameTh.hasAttribute('data-sort')).toBe(false);

    reg.sortTeamMembers(1, 'email', emailTh);
    expect(emailTh.dataset.sort).toBe('desc');

    reg.sortTeamMembers(1, 'name', nameTh);
    expect(nameTh.dataset.sort).toBe('asc');
    expect(emailTh.hasAttribute('data-sort')).toBe(false);
    expect(container().querySelectorAll('th.sortable[data-sort]')).toHaveLength(1);
  });

  it('re-renders the rows in the requested order', () => {
    reg.renderTeams(sampleTeams(), container());
    const emailTh = container().querySelector('.team-block[data-team-id="1"] th[data-sort-key="email"]');
    const order = () => [...container().querySelectorAll('.team-block[data-team-id="1"] .member-row')].map(r => r.dataset.memberId);

    reg.sortTeamMembers(1, 'email', emailTh);
    expect(order()).toEqual(['12', '11']);
    reg.sortTeamMembers(1, 'email', emailTh);
    expect(order()).toEqual(['11', '12']);

    const bacTh = container().querySelector('.team-block[data-team-id="1"] th[data-sort-key="bac"]');
    reg.sortTeamMembers(1, 'bac', bacTh);
    expect(order()).toEqual(['12', '11']);
  });

  it('keeps hostile data escaped after a re-sort', () => {
    reg.renderTeams(hostileTeams(), container());
    const th = container().querySelector('th[data-sort-key="name"]');

    reg.sortTeamMembers(7, 'name', th);

    expect(container().querySelector('img')).toBeNull();
    expect(findInlineHandlers(container())).toEqual([]);
    expect(container().querySelector('.member-row td:nth-child(2)').textContent).toBe(`${XSS_PAYLOAD} ${QUOTE_PAYLOAD}`);
  });

  it('ignores unknown teams', () => {
    reg.renderTeams(sampleTeams(), container());
    expect(() => reg.sortTeamMembers(999, 'name', headers()[0])).not.toThrow();
  });
});

describe('selection state', () => {
  it('toggleMemberSelect adds and removes ids and notifies the delete button', () => {
    const update = vi.fn();

    reg.toggleMemberSelect(11, true, update);
    reg.toggleMemberSelect(12, true, update);
    expect([...state.selectedMembers]).toEqual([11, 12]);

    reg.toggleMemberSelect(11, false, update);
    expect([...state.selectedMembers]).toEqual([12]);
    expect(update).toHaveBeenCalledTimes(3);
  });

  it('toggleSelectAll checks every row of one team only', () => {
    reg.renderTeams(sampleTeams(), container());
    const update = vi.fn();

    reg.toggleSelectAll(1, true, update);
    expect([...state.selectedMembers].sort()).toEqual([11, 12]);
    expect(container().querySelectorAll('.team-block[data-team-id="1"] .member-row input:checked')).toHaveLength(2);
    expect(container().querySelectorAll('.team-block[data-team-id="2"] .member-row input:checked')).toHaveLength(0);

    reg.toggleSelectAll(1, false, update);
    expect(state.selectedMembers.size).toBe(0);
    expect(container().querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(0);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('selectAllParticipants selects everything, then clears, and relabels the button', () => {
    reg.renderTeams(sampleTeams(), container());
    const update = vi.fn();
    const button = document.createElement('button');

    reg.selectAllParticipants(update, button);
    expect(state.selectedMembers.size).toBe(3);
    expect(button.textContent).toBe('Tout désélectionner');
    expect(container().querySelectorAll('.member-row input:checked')).toHaveLength(3);
    expect(container().querySelectorAll('.team-block > .team-body input:checked').length).toBeGreaterThan(0);

    reg.selectAllParticipants(update, button);
    expect(state.selectedMembers.size).toBe(0);
    expect(button.textContent).toBe('Tout sélectionner');
    expect(container().querySelectorAll('input:checked')).toHaveLength(0);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('toggleTeam opens and closes only the targeted block', () => {
    reg.renderTeams(sampleTeams(), container());
    const [first, second] = container().querySelectorAll('.team-block');

    reg.toggleTeam(1);
    expect(first.classList.contains('open')).toBe(true);
    expect(second.classList.contains('open')).toBe(false);
    reg.toggleTeam(1);
    expect(first.classList.contains('open')).toBe(false);
  });
});

describe('deleteSelectedMembers', () => {
  it('does nothing without a selection', async () => {
    reg.deleteSelectedMembers(vi.fn(), vi.fn(), vi.fn());
    expect(document.getElementById('confirm-modal').classList.contains('hidden')).toBe(true);
  });

  it('asks for confirmation, then posts the ids and clears the selection', async () => {
    state.selectedMembers.add(11);
    state.selectedMembers.add(12);
    const api = vi.fn().mockResolvedValue({ success: true });
    const loadData = vi.fn();
    const update = vi.fn();

    await reg.deleteSelectedMembers(api, loadData, update);
    expect(document.getElementById('confirm-modal').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('confirm-message').textContent).toContain('2 membre(s)');
    expect(api).not.toHaveBeenCalled();

    await document.getElementById('confirm-delete-btn').onclick();
    expect(api).toHaveBeenCalledWith('/admin/members/delete-batch', {
      method: 'POST',
      body: JSON.stringify({ memberIds: [11, 12] })
    });
    expect(state.selectedMembers.size).toBe(0);
    expect(update).toHaveBeenCalled();
    expect(loadData).toHaveBeenCalled();
    expect(document.getElementById('confirm-modal').classList.contains('hidden')).toBe(true);
  });

  it('keeps the selection and reports the error when the API fails', async () => {
    state.selectedMembers.add(11);
    const api = vi.fn().mockRejectedValue(new Error('boom'));

    await reg.deleteSelectedMembers(api, vi.fn(), vi.fn());
    await document.getElementById('confirm-delete-btn').onclick();

    expect(state.selectedMembers.has(11)).toBe(true);
    expect(document.querySelector('.toast.error').textContent).toBe('Erreur: boom');
  });
});

describe('modal flows', () => {
  beforeEach(() => {
    reg.renderTeams(sampleTeams(), container());
  });

  it('editTeam fills the form and opens the modal', () => {
    reg.editTeam(1);

    expect(document.getElementById('team-modal').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('team-modal-title').textContent).toBe("Modifier l'équipe");
    expect(document.getElementById('team-form-id').value).toBe('1');
    expect(document.getElementById('team-form-name').value).toBe('Alpha');
    expect(document.getElementById('team-form-desc').value).toBe('First team');
    expect(document.getElementById('team-form-password').value).toBe('');
  });

  it('openAddTeamModal clears the form', () => {
    reg.editTeam(1);
    reg.openAddTeamModal();

    expect(document.getElementById('team-form-id').value).toBe('');
    expect(document.getElementById('team-form-name').value).toBe('');
    expect(document.getElementById('team-modal-title').textContent).toBe('Nouvelle équipe');
  });

  it('editMember fills the member form including the leader flag', () => {
    reg.editMember(11, 1);

    expect(document.getElementById('member-form-id').value).toBe('11');
    expect(document.getElementById('member-form-firstname').value).toBe('Zoe');
    expect(document.getElementById('member-form-lastname').value).toBe('Zed');
    expect(document.getElementById('member-form-bac').value).toBe('3');
    expect(document.getElementById('member-form-email').value).toBe('zoe@example.com');
    expect(document.getElementById('member-form-leader').checked).toBe(true);
    expect(document.getElementById('member-modal').classList.contains('hidden')).toBe(false);
  });

  it('editMember / editTeam ignore unknown ids', () => {
    reg.editMember(999, 1);
    reg.editTeam(999);
    expect(document.getElementById('member-modal').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('team-modal').classList.contains('hidden')).toBe(true);
  });

  it('shows hostile names in the confirmation message as text, not markup', () => {
    reg.confirmDeleteTeam(7, XSS_PAYLOAD, vi.fn());
    const message = document.getElementById('confirm-message');
    expect(message.children).toHaveLength(0);
    expect(message.textContent).toContain(XSS_PAYLOAD);

    reg.confirmDeleteMember(7, QUOTE_PAYLOAD, vi.fn());
    expect(message.children).toHaveLength(0);
    expect(message.textContent).toContain(QUOTE_PAYLOAD);
  });

  it('the confirm button runs the callback with the id', () => {
    const onConfirm = vi.fn();
    reg.confirmDeleteMember(21, 'Org Anizer', onConfirm);
    document.getElementById('confirm-delete-btn').click();
    expect(onConfirm).toHaveBeenCalledWith(21);
  });
});

describe('form handlers', () => {
  it('handleTeamSubmit creates a team with POST and closes the modal', async () => {
    const api = vi.fn().mockResolvedValue({});
    const loadData = vi.fn();
    reg.openAddTeamModal();
    document.getElementById('team-form-name').value = 'New Team';
    document.getElementById('team-form-desc').value = 'about';
    document.getElementById('team-form-password').value = 'pw';

    const event = new Event('submit', { cancelable: true });
    await reg.handleTeamSubmit(event, api, loadData);

    expect(event.defaultPrevented).toBe(true);
    expect(api).toHaveBeenCalledWith('/admin/teams', { method: 'POST', body: JSON.stringify({ name: 'New Team', description: 'about', password: 'pw' }) });
    expect(document.getElementById('team-modal').classList.contains('hidden')).toBe(true);
    expect(loadData).toHaveBeenCalled();
    expect(document.querySelector('.toast.success').textContent).toBe('Équipe créée');
  });

  it('handleTeamSubmit updates with PUT when an id is present', async () => {
    const api = vi.fn().mockResolvedValue({});
    reg.renderTeams(sampleTeams(), container());
    reg.editTeam(1);

    await reg.handleTeamSubmit(new Event('submit', { cancelable: true }), api, vi.fn());
    expect(api.mock.calls[0][0]).toBe('/admin/teams/1');
    expect(api.mock.calls[0][1].method).toBe('PUT');
  });

  it('handleTeamSubmit reports API errors and keeps the modal open', async () => {
    const api = vi.fn().mockRejectedValue(new Error('Team name already exists'));
    reg.openAddTeamModal();

    await reg.handleTeamSubmit(new Event('submit', { cancelable: true }), api, vi.fn());
    expect(document.querySelector('.toast.error').textContent).toBe('Erreur: Team name already exists');
    expect(document.getElementById('team-modal').classList.contains('hidden')).toBe(false);
  });

  it('handleMemberSubmit sends the typed member data', async () => {
    const api = vi.fn().mockResolvedValue({});
    reg.renderTeams(sampleTeams(), container());
    reg.openAddMemberModal();
    document.getElementById('member-form-team').value = '1';
    document.getElementById('member-form-firstname').value = 'Neo';
    document.getElementById('member-form-lastname').value = 'Anderson';
    document.getElementById('member-form-email').value = 'neo@example.com';
    document.getElementById('member-form-bac').value = '4';
    document.getElementById('member-form-leader').checked = true;

    await reg.handleMemberSubmit(new Event('submit', { cancelable: true }), api, vi.fn());
    expect(api).toHaveBeenCalledWith('/admin/members', {
      method: 'POST',
      body: JSON.stringify({ teamId: 1, firstName: 'Neo', lastName: 'Anderson', email: 'neo@example.com', bacLevel: 4, foodDiet: '', isLeader: true })
    });
  });

  it('deleteTeam and deleteMember call the API, close the modal and reload', async () => {
    const api = vi.fn().mockResolvedValue({});
    const loadData = vi.fn();
    const update = vi.fn();
    state.selectedMembers.add(11);

    await reg.deleteTeam(1, api, loadData);
    expect(api).toHaveBeenLastCalledWith('/admin/teams/1', { method: 'DELETE' });

    await reg.deleteMember(11, api, loadData, update);
    expect(api).toHaveBeenLastCalledWith('/admin/members/11', { method: 'DELETE' });
    expect(state.selectedMembers.has(11)).toBe(false);
    expect(update).toHaveBeenCalled();
    expect(loadData).toHaveBeenCalledTimes(2);
  });
});

describe('renderStats', () => {
  const stats = { total_teams: 4, total_participants: 20, max_participants: 200, available_spots: 180, food_preferences: [{ food_diet: 'reine', count: 3 }] };

  it('renders the stat cards and the food preferences', () => {
    reg.renderStats(stats, document.getElementById('stats-grid'), document.getElementById('food-stats'));

    const grid = document.getElementById('stats-grid');
    expect(grid.textContent).toContain('Équipes');
    expect(grid.textContent).toContain('180');
    expect(document.querySelector('#food-stats .food-item').textContent).toContain('reine');
  });

  it('escapes hostile food preferences and handles an empty list', () => {
    reg.renderStats({ ...stats, food_preferences: [{ food_diet: XSS_PAYLOAD, count: 1 }] }, null, document.getElementById('food-stats'));
    expect(document.querySelector('#food-stats img')).toBeNull();
    expect(document.querySelector('#food-stats .food-item').textContent).toContain(XSS_PAYLOAD);

    reg.renderStats({ ...stats, food_preferences: [] }, null, document.getElementById('food-stats'));
    expect(document.getElementById('food-stats').textContent).toContain('Aucune préférence');
  });
});

describe('all participants list', () => {
  const rows = () => [...document.querySelectorAll('#all-participants-tbody .member-row')].map(r => r.dataset.memberId);

  beforeEach(() => {
    reg.renderTeams(sampleTeams(), container());
    reg.renderAllParticipants();
  });

  it('lists every member of every team, sorted by name by default', () => {
    expect(rows()).toEqual(['12', '21', '11']);
  });

  it('filters with the search box on name, email and team', () => {
    reg.initAllParticipants();
    const search = document.getElementById('all-participants-search');

    search.value = 'zoe';
    search.dispatchEvent(new Event('input'));
    expect(rows()).toEqual(['11']);

    search.value = 'organisation';
    search.dispatchEvent(new Event('input'));
    expect(rows()).toEqual(['21']);

    search.value = 'no-such-person';
    search.dispatchEvent(new Event('input'));
    expect(document.getElementById('all-participants-tbody').textContent).toContain('Aucun participant trouvé');
  });

  it('sortAllParticipants toggles the direction and flags the header', () => {
    reg.sortAllParticipants('email');
    expect(rows()).toEqual(['12', '21', '11']);
    const emailTh = document.querySelector('#all-participants-table th[data-sort-key="email"]');
    expect(emailTh.dataset.sort).toBe('asc');

    reg.sortAllParticipants('email');
    expect(rows()).toEqual(['11', '21', '12']);
    expect(emailTh.dataset.sort).toBe('desc');
    expect(document.querySelectorAll('#all-participants-table th[data-sort]')).toHaveLength(1);

    reg.sortAllParticipants('team');
    expect(emailTh.hasAttribute('data-sort')).toBe(false);
    expect(document.querySelector('#all-participants-table th[data-sort-key="team"]').dataset.sort).toBe('asc');
  });

  it('escapes hostile data in the list', () => {
    reg.renderTeams(hostileTeams(), container());
    reg.renderAllParticipants();

    const tbody = document.getElementById('all-participants-tbody');
    expect(tbody.querySelector('img')).toBeNull();
    expect(findInlineHandlers(tbody)).toEqual([]);
    expect(tbody.querySelector('td strong').textContent).toBe(`${XSS_PAYLOAD} ${QUOTE_PAYLOAD}`);
  });
});

describe('teams search', () => {
  it('hides non-matching teams and opens the ones that match through a member', () => {
    reg.renderTeams(sampleTeams(), container());
    reg.initTeamsSearch();
    const search = document.getElementById('teams-search');
    const [alpha, org] = container().querySelectorAll('.team-block');

    search.value = 'org@example';
    search.dispatchEvent(new Event('input'));
    expect(alpha.style.display).toBe('none');
    expect(org.style.display).toBe('');
    expect(org.classList.contains('open')).toBe(true);

    search.value = '';
    search.dispatchEvent(new Event('input'));
    expect(alpha.style.display).toBe('');
  });
});

describe('CSV downloads', () => {
  let downloads;

  beforeEach(() => {
    downloads = [];
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      downloads.push(this.download);
    });
  });

  const csvResponse = () => ({ blob: async () => new Blob(['a;b']) });

  it('exportTeam names the file after the sanitized team name', async () => {
    const api = vi.fn().mockResolvedValue(csvResponse());
    await reg.exportTeam(5, 'Team "A"/../b', api);

    expect(api).toHaveBeenCalledWith('/admin/export/5');
    expect(downloads).toEqual(['participants_Team__A_____b.csv']);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('the other exports use fixed file names', async () => {
    const api = vi.fn().mockResolvedValue(csvResponse());

    await reg.handleExportAll(api);
    await reg.handleExportOfficial(api);
    await reg.exportTeamOfficial(5, 'x y', api);

    expect(downloads).toEqual(['participants.csv', 'participants_officiel.csv', 'participants_officiel_x_y.csv']);
  });

  it('shows a toast when the export fails', async () => {
    await reg.handleExportAll(vi.fn().mockRejectedValue(new Error('nope')));
    await flush(1);
    expect(document.querySelector('.toast.error').textContent).toBe('Erreur export: nope');
    expect(downloads).toEqual([]);
  });
});
