/**
 * Admin action/change delegation
 *
 * Builds the lookup maps consumed by the delegated `click` and `change`
 * listeners, and wires those listeners up. This replaces inline
 * onclick/onchange handlers and window.* globals with data-action /
 * data-change attributes read from the clicked/changed element's dataset.
 */
/* eslint-env browser */

import { toggleDisclosure } from '@info-evry/astro-design/scripts/disclosure';
import {
  toggleTeam,
  toggleSelectAll,
  toggleMemberSelect,
  sortTeamMembers,
  editTeam,
  editMember,
  confirmDeleteTeam,
  confirmDeleteMember,
  deleteTeam,
  deleteMember,
  exportTeam,
  exportTeamOfficial,
  sortAllParticipants
} from './registrations.js';
import { handleCheckIn, handleCheckOut, confirmCheckIn } from './attendance.js';
import { handleGivePizza, handleRevokePizza } from './pizza.js';
import { handleRoomChange, handleClearRoom } from './rooms.js';
import { viewArchive, deleteArchive } from './archives.js';

/**
 * Build the click-action ("actions") and change-action ("changes") lookup
 * maps used by the delegated document listeners.
 * @param {Object} deps
 * @param {Function} deps.api - API client function
 * @param {Function} deps.loadData - Reload callback
 * @param {Function} deps.updateDeleteButton - Delete button state updater
 * @returns {{actions: Object<string, Function>, changes: Object<string, Function>}}
 */
export function buildActions({ api, loadData, updateDeleteButton }) {
  const actions = {
    'toggle-team': (el) => toggleTeam(Number(el.dataset.teamId)),
    'edit-team': (el) => editTeam(Number(el.dataset.teamId)),
    'export-team': (el) => exportTeam(Number(el.dataset.teamId), el.dataset.teamName, api),
    'export-team-official': (el) => exportTeamOfficial(Number(el.dataset.teamId), el.dataset.teamName, api),
    'confirm-delete-team': (el) =>
      confirmDeleteTeam(Number(el.dataset.teamId), el.dataset.teamName, (id) => deleteTeam(id, api, loadData)),
    'sort-team': (el) => sortTeamMembers(Number(el.dataset.teamId), el.dataset.sortKey, el),

    'edit-member': (el) => editMember(Number(el.dataset.memberId), Number(el.dataset.teamId)),
    'confirm-delete-member': (el) =>
      confirmDeleteMember(Number(el.dataset.memberId), el.dataset.memberName, (id) => deleteMember(id, api, loadData, updateDeleteButton)),

    'sort-all-participants': (el) => sortAllParticipants(el.dataset.sortKey),

    'check-in': (el) => handleCheckIn(Number(el.dataset.memberId), api, loadData),
    'check-out': (el) => handleCheckOut(Number(el.dataset.memberId), api, loadData),
    'confirm-checkin': () => confirmCheckIn(api, loadData),

    'give-pizza': (el) => handleGivePizza(Number(el.dataset.memberId), api, loadData),
    'revoke-pizza': (el) => handleRevokePizza(Number(el.dataset.memberId), api, loadData),

    'clear-room': (el) => handleClearRoom(Number(el.dataset.teamId), api, loadData),

    'view-archive': (el) => viewArchive(Number(el.dataset.year), api),
    'delete-archive': (el) => deleteArchive(Number(el.dataset.year), api, loadData),

    'toggle-disclosure': (el) => {
      const group = el.closest('[data-disclosure]');
      if (group) toggleDisclosure(group.dataset.disclosure);
    },
    'load-data': () => loadData(),
    // Absorbs clicks on wrapper elements that must not bubble to an
    // ancestor's data-action (e.g. header buttons inside a disclosure
    // header that also has data-action="toggle-disclosure").
    'stop-propagation': () => {}
  };

  const changes = {
    'toggle-select-all': (el) => toggleSelectAll(Number(el.dataset.teamId), el.checked, updateDeleteButton),
    'toggle-member-select': (el) => toggleMemberSelect(Number(el.dataset.memberId), el.checked, updateDeleteButton),
    'room-change': (el) => handleRoomChange(Number(el.dataset.teamId), el.value, api, loadData)
  };

  return { actions, changes };
}

/**
 * Bind the delegated `click` and `change` listeners on document.
 * @param {Object<string, Function>} actions - Click action map (data-action)
 * @param {Object<string, Function>} changes - Change action map (data-change)
 */
export function bindDelegation(actions, changes) {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    if ('stop' in el.dataset) e.stopPropagation();
    const fn = actions[el.dataset.action];
    if (fn) {
      e.preventDefault?.();
      fn(el, e);
    }
  });

  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (!el) return;
    changes[el.dataset.change]?.(el, e);
  });
}
