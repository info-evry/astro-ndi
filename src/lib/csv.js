/**
 * CSV Utilities Module
 * Shared CSV generation and escaping functions
 */

/**
 * UTF-8 BOM for Excel compatibility
 * Ensures Excel correctly interprets UTF-8 encoding
 */
export const CSV_BOM = '\ufeff';

/**
 * Escape CSV field with formula injection protection
 * Prevents CSV injection attacks by prefixing dangerous characters
 *
 * @param {*} field - Field value to escape
 * @returns {string} Escaped field safe for CSV
 */
export function escapeCSV(field) {
  if (field === null || field === undefined) return '';
  let str = String(field);

  // Protect against formula injection
  // These characters can trigger formula execution in spreadsheets
  if (/^[=+\-@\t\r|;]/.test(str)) {
    str = "'" + str;
  }

  // Quote fields containing delimiter, quotes, or newlines
  if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes("'")) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

/**
 * Generate CSV string from headers and rows
 * Uses semicolon delimiter for European Excel compatibility
 *
 * @param {string[]} headers - Column headers
 * @param {Array<Array<*>>} rows - Data rows (array of arrays)
 * @param {Object} options - Options
 * @param {boolean} options.includeBOM - Include UTF-8 BOM (default: true)
 * @param {string} options.delimiter - Field delimiter (default: ';')
 * @returns {string} CSV string
 */
export function generateCSV(headers, rows, options = {}) {
  const { includeBOM = true, delimiter = ';' } = options;

  const csvContent = [
    headers.join(delimiter),
    ...rows.map(row => row.map(escapeCSV).join(delimiter))
  ].join('\n');

  return includeBOM ? CSV_BOM + csvContent : csvContent;
}

/**
 * Create a CSV Response for download
 *
 * @param {string} csvContent - CSV content string
 * @param {string} filename - Download filename
 * @returns {Response} HTTP Response with CSV content
 */
export function createCSVResponse(csvContent, filename) {
  return new Response(csvContent, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  });
}
