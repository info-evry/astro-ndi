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
