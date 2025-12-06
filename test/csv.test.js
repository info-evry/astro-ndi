/**
 * CSV Utilities Tests
 */

import { describe, it, expect } from 'vitest';
import { escapeCSV, generateCSV, CSV_BOM, createCSVResponse } from '../src/lib/csv.js';

describe('escapeCSV', () => {
  it('should return empty string for null', () => {
    expect(escapeCSV(null)).toBe('');
  });

  it('should return empty string for undefined', () => {
    expect(escapeCSV(undefined)).toBe('');
  });

  it('should convert numbers to strings', () => {
    expect(escapeCSV(42)).toBe('42');
  });

  it('should convert booleans to strings', () => {
    expect(escapeCSV(true)).toBe('true');
  });

  it('should return simple strings unchanged', () => {
    expect(escapeCSV('hello')).toBe('hello');
  });

  it('should prefix formula characters with single quote and quote the result', () => {
    // After prefixing with single quote, the field contains a special char, so it gets quoted
    expect(escapeCSV('=SUM(A1:A10)')).toBe("\"'=SUM(A1:A10)\"");
    expect(escapeCSV('+1234')).toBe("\"'+1234\"");
    expect(escapeCSV('-100')).toBe("\"'-100\"");
    expect(escapeCSV('@mention')).toBe("\"'@mention\"");
  });

  it('should quote fields containing semicolons', () => {
    expect(escapeCSV('a;b')).toBe('"a;b"');
  });

  it('should quote fields containing double quotes and escape them', () => {
    expect(escapeCSV('say "hello"')).toBe('"say ""hello"""');
  });

  it('should quote fields containing newlines', () => {
    expect(escapeCSV('line1\nline2')).toBe('"line1\nline2"');
  });

  it('should handle single quotes in content', () => {
    expect(escapeCSV("it's")).toBe('"it\'s"');
  });

  it('should handle French text with accents', () => {
    expect(escapeCSV('Café')).toBe('Café');
  });

  it('should handle emojis', () => {
    expect(escapeCSV('Hello 👋')).toBe('Hello 👋');
  });
});

describe('generateCSV', () => {
  it('should generate CSV with headers and rows', () => {
    const headers = ['Name', 'Age'];
    const rows = [
      ['Alice', 30],
      ['Bob', 25]
    ];

    const csv = generateCSV(headers, rows);

    expect(csv).toContain(CSV_BOM);
    expect(csv).toContain('Name;Age');
    expect(csv).toContain('Alice;30');
    expect(csv).toContain('Bob;25');
  });

  it('should include BOM by default', () => {
    const csv = generateCSV(['A'], [['1']]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
  });

  it('should allow disabling BOM', () => {
    const csv = generateCSV(['A'], [['1']], { includeBOM: false });
    expect(csv.startsWith(CSV_BOM)).toBe(false);
    expect(csv).toBe('A\n1');
  });

  it('should use semicolon delimiter by default', () => {
    const csv = generateCSV(['A', 'B'], [['1', '2']], { includeBOM: false });
    expect(csv).toBe('A;B\n1;2');
  });

  it('should allow custom delimiter', () => {
    const csv = generateCSV(['A', 'B'], [['1', '2']], { includeBOM: false, delimiter: ',' });
    expect(csv).toBe('A,B\n1,2');
  });

  it('should escape special characters in cells', () => {
    const csv = generateCSV(['Formula'], [['=SUM(A1)']], { includeBOM: false });
    expect(csv).toContain("'=SUM(A1)");
  });

  it('should handle empty rows', () => {
    const csv = generateCSV(['A'], [], { includeBOM: false });
    expect(csv).toBe('A');
  });

  it('should handle null and undefined values', () => {
    const csv = generateCSV(['A', 'B'], [[null, undefined]], { includeBOM: false });
    expect(csv).toBe('A;B\n;');
  });
});

describe('createCSVResponse', () => {
  it('should create Response with correct content type', () => {
    const response = createCSVResponse('a;b\n1;2', 'test.csv');

    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
  });

  it('should set Content-Disposition header with filename', () => {
    const response = createCSVResponse('data', 'export.csv');

    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="export.csv"');
  });

  it('should include the CSV content in body', async () => {
    const content = 'Name;Age\nAlice;30';
    const response = createCSVResponse(content, 'test.csv');

    const body = await response.text();
    expect(body).toBe(content);
  });
});

describe('CSV_BOM', () => {
  it('should be the UTF-8 BOM character', () => {
    expect(CSV_BOM).toBe('\ufeff');
  });
});
