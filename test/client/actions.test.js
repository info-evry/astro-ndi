import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@info-evry/astro-design/scripts/disclosure', () => ({
  toggleDisclosure: vi.fn(),
  initDisclosures: vi.fn()
}));

vi.mock('../../src/client/admin/registrations.js', () => ({
  toggleTeam: vi.fn(),
  toggleSelectAll: vi.fn(),
  toggleMemberSelect: vi.fn(),
  sortTeamMembers: vi.fn(),
  editTeam: vi.fn(),
  editMember: vi.fn(),
  confirmDeleteTeam: vi.fn(),
  confirmDeleteMember: vi.fn(),
  deleteTeam: vi.fn(),
  deleteMember: vi.fn(),
  exportTeam: vi.fn(),
  exportTeamOfficial: vi.fn(),
  sortAllParticipants: vi.fn()
}));

vi.mock('../../src/client/admin/attendance.js', () => ({
  handleCheckIn: vi.fn(),
  handleCheckOut: vi.fn(),
  confirmCheckIn: vi.fn()
}));

vi.mock('../../src/client/admin/pizza.js', () => ({
  handleGivePizza: vi.fn(),
  handleRevokePizza: vi.fn()
}));

vi.mock('../../src/client/admin/rooms.js', () => ({
  handleRoomChange: vi.fn(),
  handleClearRoom: vi.fn()
}));

vi.mock('../../src/client/admin/archives.js', () => ({
  viewArchive: vi.fn(),
  deleteArchive: vi.fn()
}));

const { buildActions } = await import('../../src/client/admin/actions.js');
const { toggleTeam, sortTeamMembers, exportTeam, toggleSelectAll, toggleMemberSelect } = await import('../../src/client/admin/registrations.js');
const { handleCheckIn, handleCheckOut } = await import('../../src/client/admin/attendance.js');
const { handleGivePizza, handleRevokePizza } = await import('../../src/client/admin/pizza.js');
const { handleRoomChange, handleClearRoom } = await import('../../src/client/admin/rooms.js');
const { viewArchive, deleteArchive } = await import('../../src/client/admin/archives.js');
const { toggleDisclosure } = await import('@info-evry/astro-design/scripts/disclosure');

describe('buildActions', () => {
  let api;
  let loadData;
  let updateDeleteButton;
  let actions;
  let changes;

  beforeEach(() => {
    vi.clearAllMocks();
    api = vi.fn();
    loadData = vi.fn();
    updateDeleteButton = vi.fn();
    ({ actions, changes } = buildActions({ api, loadData, updateDeleteButton }));
  });

  it('reads numeric member id from dataset for check-in', () => {
    actions['check-in']({ dataset: { memberId: '5' } });
    expect(handleCheckIn).toHaveBeenCalledWith(5, api, loadData);
  });

  it('reads numeric member id from dataset for check-out', () => {
    actions['check-out']({ dataset: { memberId: '7' } });
    expect(handleCheckOut).toHaveBeenCalledWith(7, api, loadData);
  });

  it('reads numeric member id from dataset for give-pizza / revoke-pizza', () => {
    actions['give-pizza']({ dataset: { memberId: '3' } });
    expect(handleGivePizza).toHaveBeenCalledWith(3, api, loadData);

    actions['revoke-pizza']({ dataset: { memberId: '9' } });
    expect(handleRevokePizza).toHaveBeenCalledWith(9, api, loadData);
  });

  it('reads numeric team id for toggle-team', () => {
    actions['toggle-team']({ dataset: { teamId: '12' } });
    expect(toggleTeam).toHaveBeenCalledWith(12);
  });

  it('reads numeric team id and name for export-team', () => {
    actions['export-team']({ dataset: { teamId: '4', teamName: 'Les Pixels' } });
    expect(exportTeam).toHaveBeenCalledWith(4, 'Les Pixels', api);
  });

  it('reads team id and sort key for sort-team', () => {
    const el = { dataset: { teamId: '2', sortKey: 'email' } };
    actions['sort-team'](el);
    expect(sortTeamMembers).toHaveBeenCalledWith(2, 'email', el);
  });

  it('reads numeric team id for clear-room', () => {
    actions['clear-room']({ dataset: { teamId: '8' } });
    expect(handleClearRoom).toHaveBeenCalledWith(8, api, loadData);
  });

  it('reads numeric year for view-archive / delete-archive', () => {
    actions['view-archive']({ dataset: { year: '2024' } });
    expect(viewArchive).toHaveBeenCalledWith(2024, api);

    actions['delete-archive']({ dataset: { year: '2023' } });
    expect(deleteArchive).toHaveBeenCalledWith(2023, api, loadData);
  });

  it('resolves the disclosure group from an ancestor for toggle-disclosure', () => {
    const group = { dataset: { disclosure: 'stats' } };
    const header = {
      closest: vi.fn(() => group)
    };
    actions['toggle-disclosure'](header);
    expect(header.closest).toHaveBeenCalledWith('[data-disclosure]');
    expect(toggleDisclosure).toHaveBeenCalledWith('stats');
  });

  it('is a no-op for stop-propagation', () => {
    expect(() => actions['stop-propagation']()).not.toThrow();
  });

  it('calls loadData for load-data', () => {
    actions['load-data']();
    expect(loadData).toHaveBeenCalled();
  });

  it('toggle-select-all change handler forwards checked state and updateDeleteButton', () => {
    changes['toggle-select-all']({ dataset: { teamId: '6' }, checked: true });
    expect(toggleSelectAll).toHaveBeenCalledWith(6, true, updateDeleteButton);
  });

  it('toggle-member-select change handler forwards checked state and updateDeleteButton', () => {
    changes['toggle-member-select']({ dataset: { memberId: '11' }, checked: false });
    expect(toggleMemberSelect).toHaveBeenCalledWith(11, false, updateDeleteButton);
  });

  it('room-change change handler forwards team id, value, api and loadData', () => {
    changes['room-change']({ dataset: { teamId: '1' }, value: 'Salle A' });
    expect(handleRoomChange).toHaveBeenCalledWith(1, 'Salle A', api, loadData);
  });
});
