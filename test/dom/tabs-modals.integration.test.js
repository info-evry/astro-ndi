/* global KeyboardEvent, MouseEvent, document */
/**
 * Integration of the admin modules with the shared design-system scripts:
 * tabs (initTabs / switchTab / badges) and modals (initModals).
 * The markup mirrors AdminTabs.astro and the admin Modal components.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MODALS_HTML, sampleTeams, trackDocumentListeners } from './helpers.js';

let untrack;
let design;
let reg;

const TAB_IDS = ['registrations', 'attendance', 'pizza', 'rooms', 'archives', 'settings'];

function tabsHtml(active = 'registrations') {
  const buttons = TAB_IDS.map(id => `
    <button type="button" role="tab" id="tab-${id}" aria-controls="panel-${id}" aria-selected="${id === active}"
            class="tab-item ${id === active ? 'active' : ''}" data-tab="${id}">
      <span class="tab-label">${id}</span>
      <span id="${id}-badge" class="tab-badge">0</span>
    </button>`).join('');
  const panels = TAB_IDS.map(id => `<section id="panel-${id}" class="tab-panel ${id === active ? '' : 'hidden'}">${id}</section>`).join('');
  return `<nav class="tab-nav" role="tablist">${buttons}</nav>${panels}`;
}

beforeEach(async () => {
  vi.resetModules();
  untrack = trackDocumentListeners();
  document.body.innerHTML = `${tabsHtml()}<div id="teams-container"></div>${MODALS_HTML}`;
  design = {
    tabs: await import('@info-evry/astro-design/scripts/tabs'),
    modal: await import('@info-evry/astro-design/scripts/modal')
  };
  reg = await import('../../src/client/admin/registrations.js');
});

afterEach(() => {
  untrack();
  document.body.innerHTML = '';
});

const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
const visiblePanels = () => [...document.querySelectorAll('.tab-panel:not(.hidden)')].map(p => p.id);

describe('tabs', () => {
  it('shows only the active panel after initTabs and a click', () => {
    design.tabs.initTabs();
    expect(visiblePanels()).toEqual(['panel-registrations']);

    click(document.getElementById('tab-pizza'));
    expect(visiblePanels()).toEqual(['panel-pizza']);
    expect(document.getElementById('tab-pizza').classList.contains('active')).toBe(true);
    expect(document.getElementById('tab-pizza').getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('tab-registrations').classList.contains('active')).toBe(false);
    expect(document.getElementById('tab-registrations').getAttribute('aria-selected')).toBe('false');
  });

  it('keeps exactly one active tab while switching around', () => {
    design.tabs.initTabs();
    for (const id of ['rooms', 'archives', 'settings', 'attendance', 'registrations']) {
      click(document.getElementById(`tab-${id}`));
      expect(document.querySelectorAll('.tab-nav .tab-item.active')).toHaveLength(1);
      expect(visiblePanels()).toEqual([`panel-${id}`]);
    }
  });

  it('reports the selected tab id to onChange', () => {
    const onChange = vi.fn();
    design.tabs.initTabs({ onChange });
    click(document.getElementById('tab-rooms'));
    expect(onChange).toHaveBeenCalledWith('rooms');
  });

  it('the module badge updaters write into the tab badges', async () => {
    const attendance = await import('../../src/client/admin/attendance.js');
    const pizza = await import('../../src/client/admin/pizza.js');
    const rooms = await import('../../src/client/admin/rooms.js');

    attendance.updateAttendanceBadge(12);
    pizza.updatePizzaBadge(7);
    rooms.updateRoomsBadge(3);

    expect(document.getElementById('attendance-badge').textContent).toBe('12');
    expect(document.getElementById('pizza-badge').textContent).toBe('7');
    expect(document.getElementById('rooms-badge').textContent).toBe('3');
  });

  it('setTabBadge hides a zero badge and shows a positive one', () => {
    design.tabs.setTabBadge('pizza', 0);
    expect(document.getElementById('pizza-badge').classList.contains('hidden')).toBe(true);
    design.tabs.setTabBadge('pizza', 4);
    expect(document.getElementById('pizza-badge').textContent).toBe('4');
    expect(document.getElementById('pizza-badge').classList.contains('hidden')).toBe(false);
  });

  it('a missing badge is ignored', () => {
    expect(() => design.tabs.setTabBadge('does-not-exist', 3)).not.toThrow();
  });
});

describe('modals', () => {
  const isOpen = (id) => !document.getElementById(id).classList.contains('hidden');

  beforeEach(() => {
    design.modal.initModals();
  });

  it('the admin modules open their modals through the shared openModal', () => {
    reg.renderTeams(sampleTeams(), document.getElementById('teams-container'));

    reg.openAddTeamModal();
    expect(isOpen('team-modal')).toBe(true);
    reg.openAddMemberModal();
    expect(isOpen('member-modal')).toBe(true);
    reg.confirmDeleteTeam(1, 'Alpha', vi.fn());
    expect(isOpen('confirm-modal')).toBe(true);
  });

  it('the cancel button (data-modal-close) closes its own modal only', () => {
    reg.openAddTeamModal();
    reg.confirmDeleteTeam(1, 'Alpha', vi.fn());

    click(document.getElementById('confirm-cancel'));
    expect(isOpen('confirm-modal')).toBe(false);
    expect(isOpen('team-modal')).toBe(true);
  });

  it('Escape closes every open modal', () => {
    reg.openAddTeamModal();
    reg.confirmDeleteTeam(1, 'Alpha', vi.fn());

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(isOpen('team-modal')).toBe(false);
    expect(isOpen('confirm-modal')).toBe(false);
  });

  it('other keys do not close modals', () => {
    reg.openAddTeamModal();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(isOpen('team-modal')).toBe(true);
  });

  it('a click on the backdrop closes the modal, a click inside does not', () => {
    reg.openAddTeamModal();

    click(document.getElementById('team-modal-title'));
    expect(isOpen('team-modal')).toBe(true);

    click(document.getElementById('team-modal'));
    expect(isOpen('team-modal')).toBe(false);
  });

  it('data-modal-open buttons open the named modal', () => {
    document.body.insertAdjacentHTML('beforeend', '<button type="button" id="opener" data-modal-open="member-modal">open</button>');
    click(document.getElementById('opener'));
    expect(isOpen('member-modal')).toBe(true);
  });

  it('calling initModals again does not stack handlers (one click, one close)', () => {
    design.modal.initModals();
    design.modal.initModals();
    reg.openAddTeamModal();

    click(document.getElementById('team-cancel'));
    expect(isOpen('team-modal')).toBe(false);

    // reopening still works: a doubled toggle would have left it hidden
    reg.openAddTeamModal();
    expect(isOpen('team-modal')).toBe(true);
  });

  it('closing and reopening the confirm modal rebinds the confirm callback each time', () => {
    const first = vi.fn();
    const second = vi.fn();

    reg.confirmDeleteMember(1, 'A', first);
    reg.confirmDeleteMember(2, 'B', second);
    click(document.getElementById('confirm-delete-btn'));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(2);
  });
});
