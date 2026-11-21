/* global document, localStorage */
/**
 * Admin start-up: the lists show pizza names from the very first render. The
 * stats only carry stored ids, so the catalogue (settings) must be loaded
 * before the teams are drawn. Own file: main.auth.test.js mocks settings.js,
 * which keeps the first module registry alive across its tests.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MODALS_HTML, sampleTeams, flush } from './helpers.js';

const TOKEN = 'good-token';

const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = `
    <meta name="base-url" content="/nuit-de-linfo/">
    <section id="auth-section"><input id="admin-token"><button id="auth-btn"></button><p id="auth-error" class="hidden"></p></section>
    <div id="admin-content" class="hidden"><div id="stats-grid"></div><div id="food-stats"></div><div id="teams-container"></div></div>
    ${MODALS_HTML}`;
  localStorage.setItem('ndi_admin_token', TOKEN);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('admin start-up', () => {
  it('shows pizza names, not ids, in the first render', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const path = String(url).replace('/nuit-de-linfo/api', '');
      if (path === '/admin/stats') {
        return json({
          stats: { total_teams: 2, total_participants: 3, max_participants: 200, available_spots: 197, food_preferences: [{ food_diet: 'reine', count: 1 }] },
          teams: sampleTeams()
        });
      }
      if (path === '/admin/settings') return json({ settings: { pizzas: [{ id: 'reine', name: 'Reine du jour', description: '' }] } });
      return json({ members: [], teams: [], archives: [], stats: {}, rooms: [], pizza_by_room: [] });
    }));

    await import('../../src/client/admin/main.js');
    await flush(10);

    const text = document.getElementById('teams-container').textContent;
    expect(text).toContain('Reine du jour');
    expect(text).not.toMatch(/\breine\b/);
    expect(document.getElementById('food-stats').textContent).toContain('Reine du jour');
  });
});
