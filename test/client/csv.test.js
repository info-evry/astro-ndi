import { describe, it, expect } from 'vitest';
import {
  parseCSVLine,
  parseCSV,
  validateCSVHeaders,
  rowToObject,
  parseImportCSV,
  generateCSV
} from '../../src/client/lib/csv.js';

describe('CSV Utilities', () => {
  describe('parseCSVLine', () => {
    it('parses simple CSV line', () => {
      expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
    });

    it('handles quoted fields', () => {
      expect(parseCSVLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
    });

    it('handles escaped quotes', () => {
      expect(parseCSVLine('a,"b""c",d')).toEqual(['a', 'b"c', 'd']);
    });

    it('trims whitespace', () => {
      expect(parseCSVLine(' a , b , c ')).toEqual(['a', 'b', 'c']);
    });

    it('handles empty fields', () => {
      expect(parseCSVLine('a,,c')).toEqual(['a', '', 'c']);
    });

    it('handles empty string', () => {
      expect(parseCSVLine('')).toEqual(['']);
    });
  });

  describe('parseCSV', () => {
    it('parses CSV with headers and rows', () => {
      const csv = 'name,email\nJohn,john@test.com\nJane,jane@test.com';
      const result = parseCSV(csv);
      expect(result.headers).toEqual(['name', 'email']);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual(['John', 'john@test.com']);
    });

    it('filters empty lines', () => {
      const csv = 'a,b\n\nval1,val2\n\n';
      const result = parseCSV(csv);
      expect(result.rows).toHaveLength(1);
    });

    it('throws on empty input', () => {
      expect(() => parseCSV('')).toThrow('CSV content is required');
      expect(() => parseCSV(null)).toThrow('CSV content is required');
    });

    it('throws on whitespace-only input', () => {
      expect(() => parseCSV('   \n  \n  ')).toThrow('CSV is empty');
    });
  });

  describe('validateCSVHeaders', () => {
    it('validates matching headers', () => {
      const result = validateCSVHeaders(
        ['name', 'email'],
        ['name', 'email']
      );
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('detects missing headers', () => {
      const result = validateCSVHeaders(
        ['name'],
        ['name', 'email']
      );
      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['email']);
    });

    it('detects extra headers', () => {
      const result = validateCSVHeaders(
        ['name', 'email', 'phone'],
        ['name', 'email']
      );
      expect(result.valid).toBe(true);
      expect(result.extra).toEqual(['phone']);
    });

    it('is case insensitive', () => {
      const result = validateCSVHeaders(
        ['NAME', 'Email'],
        ['name', 'email']
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('rowToObject', () => {
    it('converts row to object', () => {
      const headers = ['name', 'email', 'age'];
      const row = ['John', 'john@test.com', '25'];
      const result = rowToObject(headers, row);
      expect(result).toEqual({
        name: 'John',
        email: 'john@test.com',
        age: '25'
      });
    });

    it('handles missing values', () => {
      const headers = ['a', 'b', 'c'];
      const row = ['1'];
      const result = rowToObject(headers, row);
      expect(result).toEqual({ a: '1', b: '', c: '' });
    });
  });

  describe('parseImportCSV', () => {
    it('parses valid import CSV', () => {
      const csv = `id,firstname,lastname,email,fooddiet,baclevel,ismanager,teamName,date
1,John,Doe,john@test.com,vegetarian,3,true,Team Alpha,2024-01-01`;

      const result = parseImportCSV(csv);
      expect(result.errors).toEqual([]);
      expect(result.members).toHaveLength(1);
      expect(result.members[0]).toEqual({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        foodDiet: 'vegetarian',
        bacLevel: 3,
        isManager: true,
        teamName: 'Team Alpha',
        externalId: '1',
        importDate: '2024-01-01'
      });
    });

    it('reports missing required fields', () => {
      const csv = `id,firstname,lastname,email,fooddiet,baclevel,ismanager,teamName,date
1,,Doe,john@test.com,,3,true,Team Alpha,`;

      const result = parseImportCSV(csv);
      expect(result.errors).toContain('Line 2: Missing name');
    });

    it('reports missing email', () => {
      const csv = `id,firstname,lastname,email,fooddiet,baclevel,ismanager,teamName,date
1,John,Doe,,,3,true,Team Alpha,`;

      const result = parseImportCSV(csv);
      expect(result.errors).toContain('Line 2: Missing email');
    });

    it('reports missing team name', () => {
      const csv = `id,firstname,lastname,email,fooddiet,baclevel,ismanager,teamName,date
1,John,Doe,john@test.com,,3,true,,`;

      const result = parseImportCSV(csv);
      expect(result.errors).toContain('Line 2: Missing team name');
    });

    it('handles empty CSV', () => {
      const csv = `id,firstname,lastname,email,fooddiet,baclevel,ismanager,teamName,date`;

      const result = parseImportCSV(csv);
      expect(result.errors).toContain('CSV must have at least one data row');
    });

    it('handles ismanager as 1 or true', () => {
      const csv = `id,firstname,lastname,email,fooddiet,baclevel,ismanager,teamName,date
1,John,Doe,john@test.com,,3,1,Team A,
2,Jane,Doe,jane@test.com,,3,false,Team B,`;

      const result = parseImportCSV(csv);
      expect(result.members[0].isManager).toBe(true);
      expect(result.members[1].isManager).toBe(false);
    });
  });

  describe('generateCSV', () => {
    it('generates valid CSV', () => {
      const headers = ['name', 'email'];
      const rows = [
        { name: 'John', email: 'john@test.com' },
        { name: 'Jane', email: 'jane@test.com' }
      ];

      const result = generateCSV(headers, rows);
      expect(result).toBe('name,email\nJohn,john@test.com\nJane,jane@test.com');
    });

    it('escapes commas in fields', () => {
      const headers = ['name'];
      const rows = [{ name: 'Doe, John' }];

      const result = generateCSV(headers, rows);
      expect(result).toBe('name\n"Doe, John"');
    });

    it('escapes quotes in fields', () => {
      const headers = ['name'];
      const rows = [{ name: 'John "The Man" Doe' }];

      const result = generateCSV(headers, rows);
      expect(result).toBe('name\n"John ""The Man"" Doe"');
    });

    it('handles null/undefined values', () => {
      const headers = ['a', 'b'];
      const rows = [{ a: null, b: undefined }];

      const result = generateCSV(headers, rows);
      expect(result).toBe('a,b\n,');
    });
  });
});
