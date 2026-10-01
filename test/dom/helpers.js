/* global document */
/**
 * Shared helpers for the happy-dom test project.
 */
import { vi } from 'vitest';

/** Payloads that must never become markup when interpolated into a page. */
export const XSS_PAYLOAD = '"><img src=x onerror=alert(1)>';
export const QUOTE_PAYLOAD = `O'Brien "the" <b>bold</b> & co`;

/** Let pending promise callbacks (and 0 ms timers) run. */
export async function flush(times = 5) {
  for (let i = 0; i < times; i++) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

/**
 * Record every listener added to `document` so a test can remove them in
 * afterEach (modules bind document-level listeners on import / init, and the
 * document is shared by all tests of a file).
 * @returns {() => void} cleanup function
 */
export function trackDocumentListeners() {
  const added = [];
  const original = document.addEventListener.bind(document);
  const spy = vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
    added.push([type, listener, options]);
    return original(type, listener, options);
  });
  return () => {
    for (const [type, listener, options] of added) {
      document.removeEventListener(type, listener, options);
    }
    spy.mockRestore();
  };
}

/** Count elements carrying an inline event-handler attribute (onclick, onerror, ...). */
export function findInlineHandlers(root) {
  const offenders = [];
  for (const el of root.querySelectorAll('*')) {
    for (const attr of el.attributes) {
      if (/^on/i.test(attr.name)) offenders.push(`${el.tagName.toLowerCase()}[${attr.name}]`);
    }
  }
  return offenders;
}

/** A realistic admin API payload for one team with members. */
export function sampleTeams() {
  return [
    {
      id: 1,
      name: 'Alpha',
      description: 'First team',
      room: 'Salle A',
      members: [
        { id: 11, first_name: 'Zoe', last_name: 'Zed', email: 'zoe@example.com', bac_level: 3, is_leader: 1, food_diet: 'reine' },
        { id: 12, first_name: 'Abe', last_name: 'Able', email: 'abe@example.com', bac_level: 1, is_leader: 0, food_diet: '' }
      ]
    },
    {
      id: 2,
      name: 'Organisation',
      description: '',
      room: null,
      members: [
        { id: 21, first_name: 'Org', last_name: 'Anizer', email: 'org@example.com', bac_level: 5, is_leader: 1, food_diet: 'none' }
      ]
    }
  ];
}

/** Minimal markup for the admin modals used by registrations.js. */
export const MODALS_HTML = `
  <div id="confirm-modal" class="modal hidden">
    <p id="confirm-message"></p>
    <button type="button" id="confirm-delete-btn">Supprimer</button>
    <button type="button" id="confirm-cancel" data-modal-close="confirm-modal">Annuler</button>
  </div>
  <div id="team-modal" class="modal hidden">
    <h3 id="team-modal-title"></h3>
    <form id="team-form">
      <input type="hidden" id="team-form-id">
      <input type="text" id="team-form-name">
      <textarea id="team-form-desc"></textarea>
      <input type="text" id="team-form-password">
    </form>
    <button type="button" id="team-cancel" data-modal-close="team-modal">Annuler</button>
  </div>
  <div id="member-modal" class="modal hidden">
    <h3 id="member-modal-title"></h3>
    <form id="member-form">
      <input type="hidden" id="member-form-id">
      <select id="member-form-team"></select>
      <input type="text" id="member-form-firstname">
      <input type="text" id="member-form-lastname">
      <input type="text" id="member-form-email">
      <input type="number" id="member-form-bac" value="0">
      <select id="member-form-food"></select>
      <input type="checkbox" id="member-form-leader">
    </form>
  </div>
`;
