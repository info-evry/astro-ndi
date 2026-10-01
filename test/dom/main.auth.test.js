/* global Event, KeyboardEvent, MouseEvent, document, localStorage */
/**
 * Admin dashboard bootstrap (main.js): stored-token start-up, interactive
 * login, invalid token, 401 mid-session and the registrations toolbar.
 * The domain init functions are wrapped with spies; fetch is mocked.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MODALS_HTML, sampleTeams, trackDocumentListeners, flush } from './helpers.js';

vi.mock('../../src/client/admin/settings.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, initSettings: vi.fn(actual.initSettings) };
});
vi.mock('../../src/client/admin/import.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, initImport: vi.fn(actual.initImport) };
});
vi.mock('../../src/client/admin/archives.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, initArchives: vi.fn(actual.initArchives) };
});

const TOKEN_KEY = 'ndi_admin_token';
const VALID = 'good-token';

const ADMIN_HTML = `
  <meta name="base-url" content="/nuit-de-linfo/">
  <section id="auth-section">
    <input type="password" id="admin-token">
    <button type="button" id="auth-btn">Connexion</button>
    <p id="auth-error" class="error-text hidden"></p>
  </section>
  <div id="admin-content" class="hidden">
    <button type="button" id="refresh-btn">Rafraîchir</button>
    <button type="button" id="add-team-btn">+ team</button>
    <button type="button" id="add-member-btn">+ member</button>
    <button type="button" id="select-all-btn">Tout sélectionner</button>
    <button type="button" id="delete-selected-btn" disabled>Supprimer sélection</button>
    <button type="button" id="export-all-btn">all</button>
    <button type="button" id="export-official-btn">official</button>
    <div id="stats-grid"></div>
    <div id="food-stats"></div>
    <div id="teams-container"></div>
    <button type="button" id="reload-via-action" data-action="load-data">reload</button>
  </div>
  ${MODALS_HTML}
`;

let untrack;
let fetchMock;
let calls;

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Mock of the worker's admin API: 401 unless the bearer token is the valid one. */
function installFetch({ validToken = VALID, statsStatus = 200 } = {}) {
  calls = [];
  fetchMock = vi.fn(async (url, init = {}) => {
    const path = String(url).replace('/nuit-de-linfo/api', '');
    calls.push({ path, auth: init.headers?.Authorization, method: init.method || 'GET' });
    if (init.headers?.Authorization !== `Bearer ${validToken}`) {
      return jsonResponse(401, { error: 'Unauthorized' });
    }
    if (path === '/admin/stats') {
      if (statsStatus !== 200) return jsonResponse(statsStatus, { error: 'Internal server error' });
      return jsonResponse(200, {
        stats: { total_teams: 2, total_participants: 3, max_participants: 200, available_spots: 197, food_preferences: [] },
        teams: sampleTeams()
      });
    }
    const routes = {
      '/admin/attendance': { members: [], stats: { checked_in: 0, not_checked_in: 0, total: 0, payment: {} } },
      '/admin/pizza': { members: [], stats: { received: 0, pending: 0, total: 0 } },
      '/admin/rooms': { teams: [], rooms: [], stats: {}, pizza_by_room: [] },
      '/admin/archives': { archives: [] },
      '/admin/settings': { settings: {} },
      '/admin/reset/check': { has_data: false, counts: {}, archiveExists: false },
      '/admin/event-year': { year: 2030 }
    };
    return jsonResponse(200, routes[path] ?? {});
  });
  vi.stubGlobal('fetch', fetchMock);
}

const statsCalls = () => calls.filter(c => c.path === '/admin/stats');
const byId = (id) => document.getElementById(id);
const isHidden = (id) => byId(id).classList.contains('hidden');
const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

async function loadMain() {
  await import('../../src/client/admin/main.js');
  await flush();
}

async function spies() {
  return {
    settings: (await import('../../src/client/admin/settings.js')).initSettings,
    importer: (await import('../../src/client/admin/import.js')).initImport,
    archives: (await import('../../src/client/admin/archives.js')).initArchives
  };
}

async function login(token) {
  byId('admin-token').value = token;
  click(byId('auth-btn'));
  await flush();
}

beforeEach(async () => {
  vi.resetModules();
  // the spies live in the mock registry, which survives resetModules()
  for (const spy of Object.values(await spies())) spy.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  untrack = trackDocumentListeners();
  document.body.innerHTML = ADMIN_HTML;
  localStorage.clear();
  installFetch();
});

afterEach(() => {
  untrack();
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('start-up with a stored token', () => {
  it('shows the admin, hides the login and initialises the authenticated modules once', async () => {
    localStorage.setItem(TOKEN_KEY, VALID);
    await loadMain();

    expect(isHidden('admin-content')).toBe(false);
    expect(isHidden('auth-section')).toBe(true);
    expect(statsCalls()).toHaveLength(1);
    expect(statsCalls()[0].auth).toBe(`Bearer ${VALID}`);
    expect(statsCalls()[0].path).toBe('/admin/stats');
    expect(byId('teams-container').querySelectorAll('.team-block')).toHaveLength(2);

    const { settings, importer, archives } = await spies();
    expect(settings).toHaveBeenCalledTimes(1);
    expect(importer).toHaveBeenCalledTimes(1);
    expect(archives).toHaveBeenCalledTimes(1);
  });

  it('loads every tab data source through the shared client', async () => {
    localStorage.setItem(TOKEN_KEY, VALID);
    await loadMain();

    const paths = new Set(calls.map(c => c.path));
    for (const path of ['/admin/stats', '/admin/attendance', '/admin/pizza', '/admin/rooms', '/admin/archives', '/admin/settings']) {
      expect(paths.has(path)).toBe(true);
    }
    expect(calls.every(c => c.auth === `Bearer ${VALID}`)).toBe(true);
  });

  it('does not run the authenticated modules a second time on later logins or refreshes', async () => {
    localStorage.setItem(TOKEN_KEY, VALID);
    await loadMain();

    click(byId('refresh-btn'));
    await flush();
    await login(VALID);

    const { settings, importer, archives } = await spies();
    expect(settings).toHaveBeenCalledTimes(1);
    expect(importer).toHaveBeenCalledTimes(1);
    expect(archives).toHaveBeenCalledTimes(1);
  });

  it('falls back to the login form and drops a stale token on a 401', async () => {
    localStorage.setItem(TOKEN_KEY, 'stale-token');
    await loadMain();

    expect(isHidden('auth-section')).toBe(false);
    expect(isHidden('admin-content')).toBe(true);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    const { settings } = await spies();
    expect(settings).not.toHaveBeenCalled();
  });

  it('keeps the token when the server is merely failing (500), shows the login form and a retry hint', async () => {
    installFetch({ statsStatus: 500 });
    localStorage.setItem(TOKEN_KEY, VALID);
    await loadMain();

    expect(isHidden('auth-section')).toBe(false);
    expect(isHidden('admin-content')).toBe(true);
    expect(localStorage.getItem(TOKEN_KEY)).toBe(VALID);
    expect(byId('auth-error').textContent).toContain('indisponible');
    expect(isHidden('auth-error')).toBe(false);
  });

  it('retries with the kept token when the login button is clicked with an empty field', async () => {
    installFetch({ statsStatus: 500 });
    localStorage.setItem(TOKEN_KEY, VALID);
    await loadMain();
    expect(isHidden('admin-content')).toBe(true);

    installFetch();
    click(byId('auth-btn'));
    await flush();

    expect(isHidden('admin-content')).toBe(false);
    expect(statsCalls()[0].auth).toBe(`Bearer ${VALID}`);
  });

  it('hands the modules the live api client, never a token string (no stale token after a re-login)', async () => {
    localStorage.setItem(TOKEN_KEY, VALID);
    await loadMain();

    const { archives } = await spies();
    expect(archives.mock.calls[0]).toHaveLength(2);
    expect(archives.mock.calls[0].every(arg => typeof arg === 'function')).toBe(true);
  });

  it('shows the login form straight away when there is no token', async () => {
    await loadMain();

    expect(isHidden('auth-section')).toBe(false);
    expect(isHidden('admin-content')).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

describe('interactive login', () => {
  beforeEach(loadMain);

  it('a valid token reveals the admin, is persisted and starts the modules once', async () => {
    await login(VALID);

    expect(isHidden('admin-content')).toBe(false);
    expect(isHidden('auth-section')).toBe(true);
    expect(isHidden('auth-error')).toBe(true);
    expect(localStorage.getItem(TOKEN_KEY)).toBe(VALID);
    expect(statsCalls()[0].auth).toBe(`Bearer ${VALID}`);

    const { settings, importer, archives } = await spies();
    expect(settings).toHaveBeenCalledTimes(1);
    expect(importer).toHaveBeenCalledTimes(1);
    expect(archives).toHaveBeenCalledTimes(1);
  });

  it('trims the typed token', async () => {
    await login(`  ${VALID}  `);
    expect(statsCalls()[0].auth).toBe(`Bearer ${VALID}`);
    expect(isHidden('admin-content')).toBe(false);
  });

  it('an invalid token shows the error, removes the token and keeps the admin hidden', async () => {
    await login('wrong-token');

    expect(byId('auth-error').textContent).toBe('Token invalide');
    expect(isHidden('auth-error')).toBe(false);
    expect(isHidden('admin-content')).toBe(true);
    expect(isHidden('auth-section')).toBe(false);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();

    const { settings, importer, archives } = await spies();
    expect(settings).not.toHaveBeenCalled();
    expect(importer).not.toHaveBeenCalled();
    expect(archives).not.toHaveBeenCalled();
  });

  it('a retry with the right token after a failure succeeds and clears the error', async () => {
    await login('wrong-token');
    await login(VALID);

    expect(isHidden('admin-content')).toBe(false);
    expect(isHidden('auth-error')).toBe(true);
    expect(localStorage.getItem(TOKEN_KEY)).toBe(VALID);
  });

  it('an empty token asks for one without calling the API', async () => {
    await login('   ');

    expect(byId('auth-error').textContent).toBe('Veuillez entrer un token');
    expect(isHidden('auth-error')).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('pressing Enter in the token field logs in', async () => {
    byId('admin-token').value = VALID;
    byId('admin-token').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await flush();

    expect(isHidden('admin-content')).toBe(false);
  });

  it('shows a retry hint instead of "Token invalide" for a server failure, and keeps the token', async () => {
    installFetch({ statsStatus: 500 });
    await login(VALID);

    expect(byId('auth-error').textContent).toContain('indisponible');
    expect(byId('auth-error').textContent).not.toBe('Token invalide');
    expect(localStorage.getItem(TOKEN_KEY)).toBe(VALID);
    expect(isHidden('admin-content')).toBe(true);
  });
});

describe('401 in the middle of a session', () => {
  it('sends the user back to the login form and drops the token', async () => {
    localStorage.setItem(TOKEN_KEY, VALID);
    await loadMain();
    expect(isHidden('admin-content')).toBe(false);

    // the token is revoked server-side
    installFetch({ validToken: 'rotated-token' });
    click(byId('refresh-btn'));
    await flush();

    expect(isHidden('auth-section')).toBe(false);
    expect(isHidden('admin-content')).toBe(true);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('the data-action="load-data" button handles the 401 the same way', async () => {
    localStorage.setItem(TOKEN_KEY, VALID);
    await loadMain();

    installFetch({ validToken: 'rotated-token' });
    click(byId('reload-via-action'));
    await flush();

    expect(isHidden('auth-section')).toBe(false);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('subsequent API calls no longer send the revoked token', async () => {
    localStorage.setItem(TOKEN_KEY, VALID);
    await loadMain();
    installFetch({ validToken: 'rotated-token' });
    click(byId('refresh-btn'));
    await flush();

    installFetch({ validToken: 'rotated-token' });
    click(byId('refresh-btn'));
    await flush();

    expect(statsCalls().every(c => c.auth === 'Bearer ')).toBe(true);
  });

  it('a failed refresh leaves no unhandled rejection behind', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      localStorage.setItem(TOKEN_KEY, VALID);
      await loadMain();
      installFetch({ statsStatus: 500 });
      click(byId('refresh-btn'));
      await flush(10);

      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});

describe('registrations toolbar', () => {
  beforeEach(async () => {
    localStorage.setItem(TOKEN_KEY, VALID);
    await loadMain();
  });

  it('the select-all button selects every member, updates the delete button and toggles its label', async () => {
    click(byId('select-all-btn'));

    expect(byId('teams-container').querySelectorAll('.member-row input:checked')).toHaveLength(3);
    expect(byId('delete-selected-btn').disabled).toBe(false);
    expect(byId('delete-selected-btn').textContent).toBe('Supprimer sélection (3)');
    expect(byId('select-all-btn').textContent).toBe('Tout désélectionner');

    click(byId('select-all-btn'));
    expect(byId('teams-container').querySelectorAll('.member-row input:checked')).toHaveLength(0);
    expect(byId('delete-selected-btn').disabled).toBe(true);
    expect(byId('delete-selected-btn').textContent).toBe('Supprimer sélection');
    expect(byId('select-all-btn').textContent).toBe('Tout sélectionner');
  });

  it('ticking a member checkbox updates the delete button', () => {
    const checkbox = byId('teams-container').querySelector('[data-change="toggle-member-select"][data-member-id="11"]');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(byId('delete-selected-btn').disabled).toBe(false);
    expect(byId('delete-selected-btn').textContent).toBe('Supprimer sélection (1)');
  });

  it('deleting the selection asks for confirmation, then posts the ids and reloads', async () => {
    click(byId('select-all-btn'));
    click(byId('delete-selected-btn'));

    expect(byId('confirm-modal').classList.contains('hidden')).toBe(false);
    expect(byId('confirm-message').textContent).toContain('3 membre(s)');

    const before = statsCalls().length;
    click(byId('confirm-delete-btn'));
    await flush();

    const batch = calls.find(c => c.path === '/admin/members/delete-batch');
    expect(batch).toMatchObject({ method: 'POST', auth: `Bearer ${VALID}` });
    expect(JSON.parse(fetchMock.mock.calls.find(([url]) => String(url).endsWith('/delete-batch'))[1].body).memberIds.sort()).toEqual([11, 12, 21]);
    expect(statsCalls().length).toBe(before + 1);
    expect(byId('delete-selected-btn').disabled).toBe(true);
  });

  it('the add-team and add-member buttons open their modals', () => {
    click(byId('add-team-btn'));
    expect(byId('team-modal').classList.contains('hidden')).toBe(false);
    click(byId('add-member-btn'));
    expect(byId('member-modal').classList.contains('hidden')).toBe(false);
  });

  it('delegated actions are bound: clicking a team header opens it', () => {
    const block = byId('teams-container').querySelector('.team-block[data-team-id="1"]');
    click(block.querySelector('.team-header'));
    expect(block.classList.contains('open')).toBe(true);
  });

  it('the team form submits through the shared client with the bearer token', async () => {
    click(byId('add-team-btn'));
    byId('team-form-name').value = 'Brand New';
    byId('team-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    const create = calls.find(c => c.path === '/admin/teams');
    expect(create).toMatchObject({ method: 'POST', auth: `Bearer ${VALID}` });
    expect(byId('team-modal').classList.contains('hidden')).toBe(true);
  });
});
