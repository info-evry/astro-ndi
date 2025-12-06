/**
 * Client-side CSV parsing utilities
 * Pure functions that can be tested without DOM
 */

/* global Blob, document */

/**
 * Escape a CSV field value
 * @param {*} value - Value to escape
 * @returns {string} Escaped value
 */
function escapeField(value) {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

/**
 * Parse a CSV line respecting quoted fields
 * @param {string} line - CSV line to parse
 * @returns {string[]} Array of field values
 */
export function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  let skipNext = false;

  for (let i = 0; i < line.length; i++) {
    if (skipNext) {
      skipNext = false;
      continue;
    }

    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        // Escaped quote
        current += '"';
        skipNext = true;
      } else if (char === '"') {
        // End of quoted field
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Parse CSV content into rows
 * @param {string} csv - CSV content
 * @returns {{ headers: string[], rows: string[][] }}
 */
export function parseCSV(csv) {
  if (!csv || typeof csv !== 'string') {
    throw new Error('CSV content is required');
  }

  const lines = csv.split('\n').filter(line => line.trim());

  if (lines.length === 0) {
    throw new Error('CSV is empty');
  }

  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(parseCSVLine);

  return { headers, rows };
}

/**
 * Validate CSV headers against expected format
 * @param {string[]} headers - Parsed headers
 * @param {string[]} expectedHeaders - Expected headers
 * @returns {{ valid: boolean, missing: string[], extra: string[] }}
 */
export function validateCSVHeaders(headers, expectedHeaders) {
  const headerSet = new Set(headers.map(h => h.toLowerCase()));
  const expectedSet = new Set(expectedHeaders.map(h => h.toLowerCase()));

  const missing = expectedHeaders.filter(h => !headerSet.has(h.toLowerCase()));
  const extra = headers.filter(h => !expectedSet.has(h.toLowerCase()));

  return {
    valid: missing.length === 0,
    missing,
    extra
  };
}

/**
 * Convert row array to object using headers
 * @param {string[]} headers - Header names
 * @param {string[]} row - Row values
 * @returns {object} Object with header keys
 */
export function rowToObject(headers, row) {
  const obj = {};
  for (const [index, header] of headers.entries()) {
    obj[header] = row[index] || '';
  }
  return obj;
}

/**
 * Parse import CSV and extract member data
 * Expected format: id,firstname,lastname,email,fooddiet,baclevel,ismanager,teamName,date
 * @param {string} csv - CSV content
 * @returns {{ members: object[], errors: string[] }}
 */
export function parseImportCSV(csv) {
  const errors = [];
  const members = [];

  try {
    const { headers, rows } = parseCSV(csv);

    if (rows.length === 0) {
      errors.push('CSV must have at least one data row');
      return { members, errors };
    }

    // Validate headers
    const expectedHeaders = ['id', 'firstname', 'lastname', 'email', 'fooddiet', 'baclevel', 'ismanager', 'teamName', 'date'];
    const validation = validateCSVHeaders(headers, expectedHeaders);

    if (!validation.valid) {
      errors.push(`Missing required headers: ${validation.missing.join(', ')}`);
    }

    // Parse each row
    for (const [index, row] of rows.entries()) {
      const obj = rowToObject(headers, row);
      const lineNum = index + 2; // +2 for 1-indexed and header row

      // Validate required fields
      if (!obj.firstname?.trim() || !obj.lastname?.trim()) {
        errors.push(`Line ${lineNum}: Missing name`);
        continue;
      }

      if (!obj.email?.trim()) {
        errors.push(`Line ${lineNum}: Missing email`);
        continue;
      }

      if (!obj.teamName?.trim()) {
        errors.push(`Line ${lineNum}: Missing team name`);
        continue;
      }

      members.push({
        firstName: obj.firstname.trim(),
        lastName: obj.lastname.trim(),
        email: obj.email.trim().toLowerCase(),
        foodDiet: obj.fooddiet?.trim() || '',
        bacLevel: Number.parseInt(obj.baclevel, 10) || 0,
        isManager: obj.ismanager === '1' || obj.ismanager?.toLowerCase() === 'true',
        teamName: obj.teamName.trim(),
        externalId: obj.id?.trim() || null,
        importDate: obj.date?.trim() || null
      });
    }
  } catch (error) {
    errors.push(error.message);
  }

  return { members, errors };
}

/**
 * Generate CSV content from data
 * @param {string[]} headers - Column headers
 * @param {object[]} rows - Array of objects with data
 * @returns {string} CSV content
 */
export function generateCSV(headers, rows) {
  const headerLine = headers.map(h => escapeField(h)).join(',');
  const dataLines = rows.map(row =>
    headers.map(h => escapeField(row[h])).join(',')
  );

  return [headerLine, ...dataLines].join('\n');
}

/**
 * Download content as a file
 * @param {string} content - File content
 * @param {string} filename - Filename for download
 * @param {string} mimeType - MIME type (default: text/csv)
 */
export function downloadFile(content, filename, mimeType = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
