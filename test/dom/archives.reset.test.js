/* global document */
/**
 * Regression: the admin "Réinitialiser" button used to POST /admin/reset with
 * no body, so the server (which requires { confirmation: 'SUPPRIMER' }) always
 * answered 400 and the reset never worked from the UI.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let archives;

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = '<div id="toast-container"></div>';
  archives = await import('../../src/client/admin/archives.js');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const toasts = () => [...document.querySelectorAll('.toast')].map((t) => t.textContent);

describe('resetData', () => {
  it('sends the typed confirmation in the request body', async () => {
    vi.stubGlobal('confirm', () => true);
    vi.stubGlobal('prompt', () => 'SUPPRIMER');
    const api = vi.fn().mockResolvedValue({ success: true });
    const loadData = vi.fn().mockResolvedValue();
    const loadSafetyCheck = vi.fn().mockResolvedValue();

    await archives.resetData(api, loadData, loadSafetyCheck);

    expect(api).toHaveBeenCalledTimes(1);
    const [endpoint, options] = api.mock.calls[0];
    expect(endpoint).toBe('/admin/reset');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ confirmation: 'SUPPRIMER' });
    expect(loadData).toHaveBeenCalled();
    expect(loadSafetyCheck).toHaveBeenCalled();
    expect(toasts().join(' ')).toContain('réinitialisées avec succès');
  });

  it('does not report success when the server answers the no_archive warning', async () => {
    vi.stubGlobal('confirm', () => true);
    vi.stubGlobal('prompt', () => 'SUPPRIMER');
    const api = vi.fn().mockResolvedValue({ warning: 'no_archive', year: 2026 });
    const loadData = vi.fn();
    const loadSafetyCheck = vi.fn().mockResolvedValue();

    await archives.resetData(api, loadData, loadSafetyCheck);

    expect(loadData).not.toHaveBeenCalled();
    expect(toasts().join(' ')).toContain('archive');
    expect(toasts().join(' ')).not.toContain('succès');
  });

  it('asks nothing of the server when the user cancels either prompt', async () => {
    const api = vi.fn();
    vi.stubGlobal('confirm', () => false);
    await archives.resetData(api, vi.fn(), vi.fn());
    vi.stubGlobal('confirm', () => true);
    vi.stubGlobal('prompt', () => 'supprimer');
    await archives.resetData(api, vi.fn(), vi.fn());
    expect(api).not.toHaveBeenCalled();
  });

  it('maps a rejected confirmation to a clear message', async () => {
    vi.stubGlobal('confirm', () => true);
    vi.stubGlobal('prompt', () => 'SUPPRIMER');
    const error = Object.assign(new Error('Confirmation requise'), { code: 'confirmation_required', status: 400 });
    await archives.resetData(vi.fn().mockRejectedValue(error), vi.fn(), vi.fn());
    expect(toasts().join(' ')).toContain('SUPPRIMER');
  });
});

describe('createArchive', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="toast-container"></div><span id="current-event-year">2025</span>';
  });

  it('proposes the detected year, lets the organiser change it and sends it', async () => {
    const prompt = vi.fn().mockReturnValue(' 2025 ');
    vi.stubGlobal('prompt', prompt);
    const api = vi.fn().mockResolvedValue({ success: true });
    await archives.createArchive(api, vi.fn().mockResolvedValue());
    expect(prompt.mock.calls[0][1]).toBe('2025');
    const postCall = api.mock.calls.find(([endpoint, opts]) => endpoint === '/admin/archives' && opts?.method === 'POST');
    expect(JSON.parse(postCall[1].body)).toEqual({ year: 2025 });
  });

  it('does nothing when cancelled and rejects invalid years', async () => {
    const api = vi.fn();
    vi.stubGlobal('prompt', () => null);
    await archives.createArchive(api, vi.fn());
    for (const bad of ['', 'abc', '25', '1999', '2101', '20x5', '2025.5']) {
      vi.stubGlobal('prompt', () => bad);
      await archives.createArchive(api, vi.fn());
    }
    expect(api).not.toHaveBeenCalled();
  });
});

describe('an archive taken too early', () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="toast-container"></div><span id="current-event-year">2026</span>
      <div id="reset-safety-check"></div><button id="reset-data-btn" disabled></button>`;
  });

  it('offers to replace an existing archive of that year with the current data', async () => {
    vi.stubGlobal('prompt', () => '2026');
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    const exists = Object.assign(new Error('Une archive existe déjà pour 2026'), { status: 409, code: 'archive_exists' });
    const api = vi.fn()
      .mockRejectedValueOnce(exists)
      .mockResolvedValue({ success: true, archive: { event_year: 2026 } });

    await archives.createArchive(api, vi.fn().mockResolvedValue());

    expect(confirm.mock.calls[0][0]).toContain('remplacer');
    const posts = api.mock.calls.filter(([endpoint, opts]) => endpoint === '/admin/archives' && opts?.method === 'POST');
    expect(posts.map(([, opts]) => JSON.parse(opts.body))).toEqual([{ year: 2026 }, { year: 2026, replace: true }]);
    expect(toasts().join(' ')).toContain('mise à jour');
  });

  it('replaces nothing when the organiser declines', async () => {
    vi.stubGlobal('prompt', () => '2026');
    vi.stubGlobal('confirm', () => false);
    const exists = Object.assign(new Error('exists'), { status: 409, code: 'archive_exists' });
    const api = vi.fn().mockRejectedValueOnce(exists);

    await archives.createArchive(api, vi.fn());

    expect(api).toHaveBeenCalledTimes(1);
  });

  it('the safety check says the archive misses the latest changes, and keeps the reset locked', async () => {
    const api = vi.fn().mockResolvedValue({
      year: 2026, archiveExists: true, archiveCurrent: false, archiveYear: null,
      counts: { teams: 3, members: 12 }, has_data: true, safe: false
    });

    await archives.loadResetSafetyCheck(api);

    expect(document.getElementById('reset-safety-check').textContent).toContain('dernières modifications');
    expect(document.getElementById('reset-data-btn').disabled).toBe(true);
  });

  it('unlocks the reset only when an archive holds exactly the current data, and names it', async () => {
    const api = vi.fn().mockResolvedValue({
      year: 2026, archiveExists: false, archiveCurrent: true, archiveYear: 2025,
      counts: { teams: 3, members: 12 }, has_data: true, safe: true
    });

    await archives.loadResetSafetyCheck(api);

    expect(document.getElementById('reset-safety-check').textContent).toContain('2025');
    expect(document.getElementById('reset-data-btn').disabled).toBe(false);
  });

  it('a reset refused because the archive is outdated says why, and reports no success', async () => {
    vi.stubGlobal('confirm', () => true);
    vi.stubGlobal('prompt', () => 'SUPPRIMER');
    const api = vi.fn().mockResolvedValue({
      warning: 'archive_outdated', message: "L'archive 2026 ne contient pas les dernières modifications", year: 2026
    });
    const loadData = vi.fn();

    await archives.resetData(api, loadData, vi.fn().mockResolvedValue());

    expect(loadData).not.toHaveBeenCalled();
    expect(toasts().join(' ')).toContain('dernières modifications');
    expect(toasts().join(' ')).not.toContain('succès');
  });
});

describe('safety check failure', () => {
  it('locks the reset when the check cannot be made', async () => {
    document.body.innerHTML = '<div id="reset-safety-check"></div><button id="reset-data-btn"></button>';
    await archives.loadResetSafetyCheck(vi.fn().mockRejectedValue(new Error('offline')));
    expect(document.getElementById('reset-data-btn').disabled).toBe(true);
  });
});
