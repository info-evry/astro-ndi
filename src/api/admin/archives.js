/**
 * Admin archive API handlers
 * Manages yearly event archiving with GDPR compliance
 */

import { json, error } from 'astro-core/router';
import { adminOnly } from 'astro-core/auth';
import { parsePositiveId } from 'astro-core/ids';
import { badRequest, forbidden, invalidId, notFound, serverError } from 'astro-core/http';
import * as archivesDb from '../../database/db.archives.js';
import { MAX_EVENT_YEAR, MIN_EVENT_YEAR } from '../../shared/constants.js';
import { readOptionalBody } from '../../shared/http.js';

const MSG_INVALID_YEAR = 'Année invalide';
const MSG_ARCHIVE_NOT_FOUND = 'Archive introuvable';

/**
 * Validate an event year (path param or body value): a positive integer
 * within [MIN_EVENT_YEAR, MAX_EVENT_YEAR].
 * @param {unknown} value
 * @returns {{ year: number, response: null } | { year: null, response: Response }}
 */
function parseYear(value) {
  const year = parsePositiveId(value);
  if (year === null) return { year: null, response: invalidId(MSG_INVALID_YEAR) };
  if (year < MIN_EVENT_YEAR || year > MAX_EVENT_YEAR) {
    return {
      year: null,
      response: badRequest(`${MSG_INVALID_YEAR} (${MIN_EVENT_YEAR}-${MAX_EVENT_YEAR})`, 'invalid_year')
    };
  }
  return { year, response: null };
}

/**
 * GET /api/admin/archives - List all archives
 */
export const listArchives = adminOnly(async (request, env) => {
  try {
    const archives = await archivesDb.getArchives(env.DB);

    // Parse stats for each archive (a corrupt row gets `stats: null`)
    const archivesWithStats = archives.map(archive => ({
      event_year: archive.event_year,
      archived_at: archive.archived_at,
      expiration_date: archive.expiration_date,
      is_expired: archive.is_expired,
      total_teams: archive.total_teams,
      total_participants: archive.total_participants,
      total_revenue: archive.total_revenue,
      stats: archivesDb.parseJsonColumn(archive.stats_json, null)
    }));

    return json({ archives: archivesWithStats });
  } catch (error_) {
    return serverError('Error listing archives:', error_);
  }
});

/**
 * GET /api/admin/archives/:year - Get archive by year
 */
export const getArchive = adminOnly(async (request, env, ctx, params) => {
  try {
    const { year, response } = parseYear(params.year);
    if (response) return response;

    // Check and apply expiration if needed
    await archivesDb.checkAndApplyExpiration(env.DB, year);

    const archive = await archivesDb.getArchiveByYear(env.DB, year);
    if (!archive) return notFound(MSG_ARCHIVE_NOT_FOUND);

    return json({ archive });
  } catch (error_) {
    return serverError('Error fetching archive:', error_);
  }
});

/**
 * POST /api/admin/archives - Create new archive
 * Optional body `{ year }`; without a body (or without a year) the event year is detected.
 */
export const createArchive = adminOnly(async (request, env) => {
  try {
    const { data: body, response: bodyResponse } = await readOptionalBody(request);
    if (bodyResponse) return bodyResponse;

    // Get year from body or detect it
    let year;
    const requested = body?.year;
    if (requested !== undefined && requested !== null && requested !== '') {
      const parsed = parseYear(requested);
      if (parsed.response) return parsed.response;
      year = parsed.year;
    } else {
      year = await archivesDb.detectEventYear(env.DB);
    }

    // Check if archive already exists
    const exists = await archivesDb.archiveExists(env.DB, year);
    if (exists) {
      return error(`Une archive existe déjà pour ${year}`, 409, 'archive_exists');
    }

    // Check if there's data to archive
    const counts = await archivesDb.getDataCounts(env.DB);
    if (counts.teams === 0 && counts.members === 0) {
      return badRequest('Aucune donnée à archiver', 'no_data');
    }

    // Create the archive
    const archive = await archivesDb.createArchive(env.DB, year);

    return json({
      success: true,
      archive: {
        event_year: archive.event_year,
        total_teams: archive.total_teams,
        total_participants: archive.total_participants,
        total_revenue: archive.total_revenue,
        expiration_date: archive.expiration_date
      }
    }, 201);
  } catch (error_) {
    return serverError('Error creating archive:', error_);
  }
});

/**
 * GET /api/admin/archives/:year/export - Export archive as JSON
 */
export const exportArchive = adminOnly(async (request, env, ctx, params) => {
  try {
    const { year, response } = parseYear(params.year);
    if (response) return response;

    // Check and apply expiration if needed
    await archivesDb.checkAndApplyExpiration(env.DB, year);

    const archive = await archivesDb.getArchiveByYear(env.DB, year);
    if (!archive) return notFound(MSG_ARCHIVE_NOT_FOUND);

    // Return structured JSON export
    return json({
      filename: `ndi-${year}-archive.json`,
      export: {
        metadata: {
          event_year: archive.event_year,
          archived_at: archive.archived_at,
          expiration_date: archive.expiration_date,
          is_expired: archive.is_expired,
          total_teams: archive.total_teams,
          total_participants: archive.total_participants,
          total_revenue: archive.total_revenue,
          data_hash: archive.data_hash
        },
        statistics: archive.stats,
        teams: archive.teams,
        participants: archive.members,
        payment_events: archive.payment_events || []
      }
    });
  } catch (error_) {
    return serverError('Error exporting archive:', error_);
  }
});

/**
 * POST /api/admin/expiration-check - Trigger GDPR expiration check
 */
export const checkExpiration = adminOnly(async (request, env) => {
  try {
    const results = await archivesDb.checkAllExpirations(env.DB);

    return json({
      checked: results.length,
      expired: results.filter(r => r.expired).length,
      updated: results.filter(r => r.updated).length,
      details: results
    });
  } catch (error_) {
    return serverError('Error checking expirations:', error_);
  }
});

/**
 * GET /api/admin/event-year - Get current event year
 */
export const getEventYear = adminOnly(async (request, env) => {
  try {
    const year = await archivesDb.detectEventYear(env.DB);
    return json({ year });
  } catch (error_) {
    return serverError('Error getting event year:', error_);
  }
});

/**
 * POST /api/admin/reset - Reset all data with archive check.
 * The Organisation team is kept (see `resetAllData`).
 */
export const resetData = adminOnly(async (request, env) => {
  try {
    const { data, response } = await readOptionalBody(request);
    if (response) return response;
    const body = data ?? {};

    // Require confirmation
    if (body.confirmation !== 'SUPPRIMER') {
      return badRequest('Confirmation requise : tapez "SUPPRIMER"', 'confirmation_required');
    }

    // Get current year
    const year = await archivesDb.detectEventYear(env.DB);

    // Check if archive exists for current year
    const archiveExists = await archivesDb.archiveExists(env.DB, year);

    // If no archive and not forcing, suggest creating one
    if (!archiveExists && !body.force) {
      const counts = await archivesDb.getDataCounts(env.DB);
      return json({
        warning: 'no_archive',
        message: `No archive exists for ${year}. Create one before resetting?`,
        counts: counts,
        year: year
      }, 200);
    }

    // If createArchiveFirst is set, create archive before reset
    if (body.createArchiveFirst && !archiveExists) {
      const counts = await archivesDb.getDataCounts(env.DB);
      if (counts.teams > 0 || counts.members > 0) {
        await archivesDb.createArchive(env.DB, year);
      }
    }

    // Perform reset
    const result = await archivesDb.resetAllData(env.DB);

    return json({
      success: true,
      deleted: result,
      archiveCreated: body.createArchiveFirst && !archiveExists
    });
  } catch (error_) {
    return serverError('Error resetting data:', error_);
  }
});

/**
 * GET /api/admin/reset/check - Check if reset is safe (archive exists)
 */
export const checkResetSafety = adminOnly(async (request, env) => {
  try {
    const year = await archivesDb.detectEventYear(env.DB);
    const archiveExists = await archivesDb.archiveExists(env.DB, year);
    const counts = await archivesDb.getDataCounts(env.DB);

    // Calculate if there's any data in the database
    const hasData = counts.teams > 0 || counts.members > 0 || counts.payments > 0;

    // Reset is safe if:
    // 1. Archive exists for current year (data is backed up), OR
    // 2. There's no data to lose
    const safeToReset = archiveExists || !hasData;

    // Build message based on state
    let message = 'La base de données est vide.';
    if (hasData) {
      message = archiveExists
        ? `Une archive existe pour ${year}. Vous pouvez réinitialiser en toute sécurité.`
        : `Attention: Il y a des données non archivées pour ${year}.`;
    }

    return json({
      year: year,
      archiveExists: archiveExists,
      counts: counts,
      has_data: hasData,
      safe: safeToReset,
      message: message
    });
  } catch (error_) {
    return serverError('Error checking reset safety:', error_);
  }
});

/**
 * DELETE /api/admin/archives/:year - Delete an archive (development only)
 */
export const deleteArchive = adminOnly(async (request, env, ctx, params) => {
  // Only allow in development environment
  if (env.ENVIRONMENT !== 'development') {
    return forbidden("La suppression d'une archive n'est autorisée qu'en environnement de développement");
  }

  try {
    const { year, response } = parseYear(params.year);
    if (response) return response;

    // Check if archive exists
    const exists = await archivesDb.archiveExists(env.DB, year);
    if (!exists) return notFound(MSG_ARCHIVE_NOT_FOUND);

    // Delete the archive
    const deleted = await archivesDb.deleteArchive(env.DB, year);
    if (!deleted) return notFound(MSG_ARCHIVE_NOT_FOUND); // deleted in the meantime

    return json({ success: true, message: `Archive for ${year} has been deleted` });
  } catch (error_) {
    return serverError('Error deleting archive:', error_);
  }
});
