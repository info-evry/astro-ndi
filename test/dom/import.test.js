/* global File, MouseEvent, document, navigator */
/**
 * Admin CSV import module: file preview, import request, generated
 * passwords table and copy button (happy-dom).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { XSS_PAYLOAD, QUOTE_PAYLOAD, findInlineHandlers, flush } from './helpers.js';

let importMod;
let state;
let writeText;

const CSV = [
  'firstName,lastName,email,teamName',
  'Ann,One,ann@example.com,Alpha',
  'Bob,Two,bob@example.com,Alpha',
  'Cid,Three,cid@example.com,Beta'
].join('\n');

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = `
    <input type="file" id="import-file">
    <div id="import-preview" class="hidden"><div id="import-preview-content"></div></div>
    <button type="button" id="import-btn" disabled>Importer</button>
    <div id="import-status" class="import-status"></div>`;
  writeText = vi.fn().mockResolvedValue();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  state = await import('../../src/client/admin/state.js');
  importMod = await import('../../src/client/admin/import.js');
});

afterEach(() => {
  document.body.innerHTML = '';
  delete navigator.clipboard;
});

const byId = (id) => document.getElementById(id);
const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

describe('parseCSVLine', () => {
  it('splits on commas and keeps quoted commas', () => {
    expect(importMod.parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
    expect(importMod.parseCSVLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
    expect(importMod.parseCSVLine('')).toEqual(['']);
    expect(importMod.parseCSVLine('a,,c')).toEqual(['a', '', 'c']);
  });
});

describe('parseAndPreview', () => {
  it('shows the counts and the first rows, and enables the import button', () => {
    importMod.parseAndPreview(CSV);

    expect(byId('import-preview').classList.contains('hidden')).toBe(false);
    expect(byId('import-preview-content').textContent).toContain('3 membres dans 2 équipes');
    expect(byId('import-preview-content').querySelectorAll('tbody tr')).toHaveLength(3);
    expect(byId('import-btn').disabled).toBe(false);
    expect(state.parsedRows).toHaveLength(3);
    expect(state.parsedRows[0]).toMatchObject({ firstname: 'Ann', teamname: 'Alpha' });
  });

  it('previews 5 rows and summarizes the rest', () => {
    const lines = ['firstName,lastName,email,teamName', ...Array.from({ length: 8 }, (_, i) => `F${i},L${i},f${i}@example.com,T`)];
    importMod.parseAndPreview(lines.join('\n'));

    const rows = byId('import-preview-content').querySelectorAll('tbody tr');
    expect(rows).toHaveLength(6);
    expect(rows[5].textContent).toContain('et 3 autres');
  });

  it('escapes hostile cell values', () => {
    importMod.parseAndPreview(`firstName,lastName,email,teamName\n"${XSS_PAYLOAD.replaceAll('"', '')}",${QUOTE_PAYLOAD.replaceAll(',', '')},x@y.co,<b>team</b>`);

    const content = byId('import-preview-content');
    expect(content.querySelector('img')).toBeNull();
    expect(content.querySelector('b')).toBeNull();
    expect(findInlineHandlers(content)).toEqual([]);
    expect(content.querySelector('tbody td').textContent).toBe('<b>team</b>');
  });

  it('skips lines whose column count does not match the header', () => {
    importMod.parseAndPreview('firstName,lastName,email,teamName\nA,B,c@d.co,T\nbroken,row');
    expect(state.parsedRows).toHaveLength(1);
    expect(byId('import-preview-content').textContent).toContain('1 membres dans 1 équipes');
  });

  it('rejects a file without data rows: toast, hidden preview, disabled button', () => {
    importMod.parseAndPreview(CSV);
    importMod.parseAndPreview('firstName,lastName,email,teamName');

    expect(document.querySelector('.toast.error').textContent).toContain('au moins une ligne de données');
    expect(byId('import-preview').classList.contains('hidden')).toBe(true);
    expect(byId('import-btn').disabled).toBe(true);
    expect(state.csvData).toBeNull();
    expect(state.parsedRows).toEqual([]);
  });

  it('handles Windows line endings and a BOM-prefixed header', () => {
    importMod.parseAndPreview('\uFEFFfirstName,lastName,email,teamName\r\nAnn,One,a@b.co,Alpha\r\n');
    expect(state.parsedRows).toHaveLength(1);
    expect(state.parsedRows[0].teamname).toBe('Alpha');
  });
});

describe('handleFileSelect', () => {
  it('reads the selected file and previews it', async () => {
    const file = new File([CSV], 'team.csv', { type: 'text/csv' });
    importMod.handleFileSelect({ target: { files: [file] } });
    await vi.waitFor(() => expect(state.csvData).toBe(CSV), { interval: 5, timeout: 2000 });

    expect(byId('import-btn').disabled).toBe(false);
  });

  it('resets when the selection is cleared', () => {
    importMod.parseAndPreview(CSV);
    importMod.handleFileSelect({ target: { files: [] } });

    expect(byId('import-btn').disabled).toBe(true);
    expect(byId('import-preview').classList.contains('hidden')).toBe(true);
  });
});

describe('handleImport', () => {
  const successResult = (overrides = {}) => ({
    success: true,
    stats: { membersImported: 3, membersSkipped: 1, teamsCreated: 2, errors: [] },
    passwords: [{ team: 'Alpha', password: 'pw-alpha-1234' }, { team: 'Beta', password: 'pw-beta-5678' }],
    ...overrides
  });

  /** Mimics the file-select flow: the CSV text is kept in state, then previewed. */
  function loadCsv() {
    state.setCsvData(CSV);
    importMod.parseAndPreview(state.csvData);
  }

  async function runImport(result) {
    loadCsv();
    const api = vi.fn().mockResolvedValue(result);
    const loadData = vi.fn();
    await importMod.handleImport(api, loadData);
    return { api, loadData };
  }

  it('asks for a file first', async () => {
    const api = vi.fn();
    await importMod.handleImport(api, vi.fn());

    expect(api).not.toHaveBeenCalled();
    expect(document.querySelector('.toast.error').textContent).toBe('Veuillez sélectionner un fichier');
  });

  it('posts the CSV, reports the stats and reloads the data', async () => {
    const { api, loadData } = await runImport(successResult({ passwords: [] }));

    expect(api).toHaveBeenCalledWith('/admin/import', { method: 'POST', body: JSON.stringify({ csv: CSV }) });
    expect(byId('import-status').textContent).toContain('3 importés, 1 ignorés, 2 équipes créées');
    expect(byId('import-status').className).toBe('import-status success');
    expect(loadData).toHaveBeenCalledTimes(1);
    expect(byId('import-passwords')).toBeNull();
    expect(document.querySelector('#import-status .import-passwords')).toBeNull();
  });

  it('shows each generated password once, with the one-time warning and no inline handler', async () => {
    await runImport(successResult());

    const rows = [...document.querySelectorAll('.import-passwords-table tbody tr')].map(tr => [...tr.cells].map(td => td.textContent));
    expect(rows).toEqual([['Alpha', 'pw-alpha-1234'], ['Beta', 'pw-beta-5678']]);
    expect(document.querySelector('.import-passwords-warning').textContent).toContain('une seule fois');
    expect(document.querySelector('.import-passwords code').textContent).toBe('pw-alpha-1234');
    expect(findInlineHandlers(byId('import-status'))).toEqual([]);
  });

  it('escapes hostile team names and passwords in the table', async () => {
    await runImport(successResult({ passwords: [{ team: XSS_PAYLOAD, password: '<script>x</script>' }] }));

    const status = byId('import-status');
    expect(status.querySelector('img')).toBeNull();
    expect(status.querySelector('script')).toBeNull();
    expect(status.querySelector('.import-passwords-table tbody td').textContent).toBe(XSS_PAYLOAD);
    expect(status.querySelector('code').textContent).toBe('<script>x</script>');
  });

  it('the copy button writes "team<TAB>password" lines to the clipboard', async () => {
    await runImport(successResult());

    click(document.querySelector('[data-action="copy-import-passwords"]'));
    await flush(2);

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('Alpha\tpw-alpha-1234\nBeta\tpw-beta-5678');
    expect(document.querySelector('.toast.success').textContent).toBe('Mots de passe copiés');
  });

  it('reports a failed copy instead of failing silently', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await runImport(successResult());

    click(document.querySelector('[data-action="copy-import-passwords"]'));
    await flush(2);

    expect(document.querySelector('.toast.error').textContent).toBe('Impossible de copier les mots de passe');
  });

  it('shows an escaped error and restores the button when the API fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    loadCsv();
    const api = vi.fn().mockRejectedValue(new Error(XSS_PAYLOAD));
    const loadData = vi.fn();

    await importMod.handleImport(api, loadData);

    expect(byId('import-status').querySelector('img')).toBeNull();
    expect(byId('import-status').textContent).toContain(XSS_PAYLOAD);
    expect(byId('import-status').className).toBe('import-status error');
    expect(byId('import-btn').disabled).toBe(false);
    expect(byId('import-btn').textContent).toBe('Importer');
    expect(loadData).not.toHaveBeenCalled();
  });

  it('disables the button while the request is running', async () => {
    loadCsv();
    let release;
    const api = vi.fn(() => new Promise(resolve => { release = resolve; }));

    const pending = importMod.handleImport(api, vi.fn());
    expect(byId('import-btn').disabled).toBe(true);
    expect(byId('import-btn').textContent).toBe('Import en cours...');

    release(successResult({ passwords: [] }));
    await pending;
    expect(byId('import-btn').disabled).toBe(false);
  });
});

describe('initImport', () => {
  it('wires the file input and the import button', async () => {
    const api = vi.fn().mockResolvedValue({ success: true, stats: { membersImported: 1, membersSkipped: 0, teamsCreated: 1 }, passwords: [] });
    importMod.initImport(api, vi.fn());

    state.setCsvData(CSV);
    importMod.parseAndPreview(CSV);
    click(byId('import-btn'));
    await flush(2);

    expect(api).toHaveBeenCalledWith('/admin/import', expect.objectContaining({ method: 'POST' }));
  });

  it('resetImport clears the state', () => {
    importMod.parseAndPreview(CSV);
    importMod.resetImport();

    expect(state.csvData).toBeNull();
    expect(state.parsedRows).toEqual([]);
    expect(byId('import-btn').disabled).toBe(true);
    expect(byId('import-status').textContent).toBe('');
  });
});
