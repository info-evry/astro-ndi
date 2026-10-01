/**
 * src/lib/members-csv.js: the export formats and the import cell parsers.
 */

import { describe, it, expect } from 'vitest';
import { mapCsvHeaders, parseCsv } from 'astro-core/csv';
import {
  CSV_BOM, EXPORT_HEADERS, IMPORT_HEADER_ALIASES, OFFICIAL_HEADERS, generateMembersCsv, generateOfficialMembersCsv,
  parseBacLevelCell, parseLeaderCell
} from '../src/lib/members-csv.js';

const member = (overrides = {}) => ({
  id: 7, first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com', team_name: 'Analytical', bac_level: 5,
  is_leader: 1, food_diet: 'reine', created_at: '2026-10-01 10:00:00', ...overrides
});

describe('generateMembersCsv', () => {
  it('starts with a BOM, uses ";" and the French headers, and has no trailing line break', () => {
    const csv = generateMembersCsv([member()]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);

    const [header, row, ...rest] = csv.slice(1).split('\r\n');
    expect(header.split(';')).toEqual(Object.values(EXPORT_HEADERS));
    expect(row).toBe('7;Ada;Lovelace;ada@example.com;Analytical;BAC+5;Oui;reine;2026-10-01 10:00:00');
    expect(rest).toEqual([]);
  });

  it('writes "Aucune" when there is no pizza and "Non" for a member', () => {
    const [, row] = generateMembersCsv([member({ food_diet: '', is_leader: 0 })]).split('\r\n');
    expect(row.split(';').slice(6, 8)).toEqual(['Non', 'Aucune']);
  });

  it('neutralises formulas, keeps phone numbers, and quotes delimiters, quotes and line breaks', () => {
    const csv = generateMembersCsv([member({ first_name: '=SUM(1)', last_name: '+49 123', team_name: 'A;"B"\nC' })]);
    const { rows } = parseCsv(csv);
    expect(rows[0][1]).toBe("'=SUM(1)");
    expect(rows[0][2]).toBe('+49 123');
    expect(rows[0][4]).toBe('A;"B"\nC');
  });

  it('an empty list is just the header line', () => {
    expect(generateMembersCsv([]).slice(1)).toBe(Object.values(EXPORT_HEADERS).join(';'));
  });
});

describe('generateOfficialMembersCsv', () => {
  it('writes the official columns with the school and an upper-cased last name', () => {
    const csv = generateOfficialMembersCsv([member({ bac_level: '4' })], "Université d'Evry");
    const { headers, rows } = parseCsv(csv);
    expect(headers).toEqual(Object.values(OFFICIAL_HEADERS));
    expect(rows[0]).toEqual(['Ada', 'LOVELACE', 'ada@example.com', '4', 'Analytical', '1', "Université d'Evry"]);
  });
});

describe('import header aliases', () => {
  const required = ['firstName', 'lastName', 'email', 'team'];

  it.each([
    ['English', ['firstname', 'lastname', 'email', 'teamname', 'baclevel', 'fooddiet', 'ismanager']],
    ['French export', Object.values(EXPORT_HEADERS)],
    ['official export', Object.values(OFFICIAL_HEADERS)]
  ])('maps the %s header set to every required field', (_label, headers) => {
    const columns = mapCsvHeaders(headers, IMPORT_HEADER_ALIASES);
    for (const field of required) expect(columns[field], field).toBeTypeOf('number');
  });

  it('is case-insensitive and maps each column once', () => {
    const columns = mapCsvHeaders(['FIRSTNAME', 'LastName', 'EMAIL', 'TeamName', 'isManager'], IMPORT_HEADER_ALIASES);
    expect(columns).toEqual({ firstName: 0, lastName: 1, email: 2, team: 3, isLeader: 4 });
  });
});

describe('import cell parsers', () => {
  it.each([['Oui', true], ['yes', true], ['1', true], ['TRUE', true], [' oui ', true], ['Non', false], ['0', false], ['', false], [undefined, false], ['2', false]])(
    'parseLeaderCell(%j) is %s', (cell, expected) => {
      expect(parseLeaderCell(cell)).toBe(expected);
    }
  );

  it.each([['3', 3], ['BAC+3', 3], ['bac+10', 10], ['BAC 2', 2], ['bac +4', 4], ['', 0], [undefined, 0], [' 5 ', 5]])(
    'parseBacLevelCell(%j) is %i', (cell, expected) => {
      expect(parseBacLevelCell(cell)).toBe(expected);
    }
  );

  it.each(['BAC+', 'abc', '3.5', '-1', '1234', 'bac+x'])('parseBacLevelCell(%j) is null', (cell) => {
    expect(parseBacLevelCell(cell)).toBeNull();
  });
});
