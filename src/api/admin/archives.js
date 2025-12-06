/**
 * Admin archive API handlers
 * Manages yearly event archiving with GDPR compliance
 */

import { json, error } from '../../lib/router.js';
import { verifyAdmin } from '../../shared/auth.js';
import * as archivesDb from '../../database/db.archives.js';

/**
 * GET /api/admin/archives - List all archives
 */
export async function listArchives(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const archives = await archivesDb.getArchives(env.DB);
    
    // Parse stats for each archive
    const archivesWithStats = archives.map(archive => ({
      event_year: archive.event_year,
      archived_at: archive.archived_at,
      expiration_date: archive.expiration_date,
      is_expired: archive.is_expired,
      total_teams: archive.total_teams,
      total_participants: archive.total_participants,
      total_revenue: archive.total_revenue,
      stats: archive.stats_json ? JSON.parse(archive.stats_json) : null
    }));

    return json({ archives: archivesWithStats });
  } catch (error_) {
    console.error('Error listing archives:', error_);
    return error('Failed to fetch archives', 500);
  }
}

/**
 * GET /api/admin/archives/:year - Get archive by year
 */
export async function getArchive(request, env, ctx, params) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const year = Number.parseInt(params.year, 10);
    if (Number.isNaN(year)) {
      return error('Invalid year', 400);
    }

    // Check and apply expiration if needed
    await archivesDb.checkAndApplyExpiration(env.DB, year);

    const archive = await archivesDb.getArchiveByYear(env.DB, year);
    if (!archive) {
      return error('Archive not found', 404);
    }

    return json({ archive });
  } catch (error_) {
    console.error('Error fetching archive:', error_);
    return error('Failed to fetch archive', 500);
  }
}

/**
 * POST /api/admin/archives - Create new archive
 */
export async function createArchive(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const body = await request.json().catch(() => ({}));
    
  // Get year from body or detect it
  let year = body.year;
  if (year) {
    year = Number.parseInt(year, 10);
    if (Number.isNaN(year) || year < 2000 || year > 2100) {
      return error('Invalid year', 400);
    }
  } else {
    year = await archivesDb.detectEventYear(env.DB);
  }

    // Check if archive already exists
    const exists = await archivesDb.archiveExists(env.DB, year);
    if (exists) {
      return error(`Archive for ${year} already exists`, 409);
    }

    // Check if there's data to archive
    const counts = await archivesDb.getDataCounts(env.DB);
    if (counts.teams === 0 && counts.members === 0) {
      return error('No data to archive', 400);
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
    console.error('Error creating archive:', error_);
    return error('Failed to create archive', 500);
  }
}

/**
 * GET /api/admin/archives/:year/export - Export archive as JSON
 */
export async function exportArchive(request, env, ctx, params) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const year = Number.parseInt(params.year, 10);
    if (Number.isNaN(year)) {
      return error('Invalid year', 400);
    }

    // Check and apply expiration if needed
    await archivesDb.checkAndApplyExpiration(env.DB, year);

    const archive = await archivesDb.getArchiveByYear(env.DB, year);
    if (!archive) {
      return error('Archive not found', 404);
    }

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
    console.error('Error exporting archive:', error_);
    return error('Failed to export archive', 500);
  }
}

/**
 * POST /api/admin/archives/check-expiration - Trigger GDPR expiration check
 */
export async function checkExpiration(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const results = await archivesDb.checkAllExpirations(env.DB);
    
    return json({
      checked: results.length,
      expired: results.filter(r => r.expired).length,
      updated: results.filter(r => r.updated).length,
      details: results
    });
  } catch (error_) {
    console.error('Error checking expirations:', error_);
    return error('Failed to check expirations', 500);
  }
}

/**
 * GET /api/admin/event-year - Get current event year
 */
export async function getEventYear(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const year = await archivesDb.detectEventYear(env.DB);
    return json({ year });
  } catch (error_) {
    console.error('Error getting event year:', error_);
    return error('Failed to get event year', 500);
  }
}

/**
 * POST /api/admin/reset - Reset all data with archive check
 */
export async function resetData(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const body = await request.json().catch(() => ({}));
    
    // Require confirmation
    if (body.confirmation !== 'SUPPRIMER') {
      return error('Confirmation required: type "SUPPRIMER"', 400);
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
    console.error('Error resetting data:', error_);
    return error('Failed to reset data', 500);
  }
}

/**
 * GET /api/admin/reset/check - Check if reset is safe (archive exists)
 */
export async function checkResetSafety(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

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

    return json({
      year: year,
      archiveExists: archiveExists,
      counts: counts,
      has_data: hasData,
      safe: safeToReset,
      // Provide a clear message for the frontend
      message: !hasData
        ? 'La base de données est vide.'
        : archiveExists
          ? `Une archive existe pour ${year}. Vous pouvez réinitialiser en toute sécurité.`
          : `Attention: Il y a des données non archivées pour ${year}.`
    });
  } catch (error_) {
    console.error('Error checking reset safety:', error_);
    return error('Failed to check reset safety', 500);
  }
}

/**
 * DELETE /api/admin/archives/:year - Delete an archive (development only)
 */
export async function deleteArchive(request, env, ctx, params) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  // Only allow in development environment
  if (env.ENVIRONMENT !== 'development') {
    return error('Archive deletion is only allowed in development environment', 403);
  }

  try {
    const year = Number.parseInt(params.year, 10);
    if (Number.isNaN(year)) {
      return error('Invalid year', 400);
    }

    // Check if archive exists
    const exists = await archivesDb.archiveExists(env.DB, year);
    if (!exists) {
      return error(`Archive for ${year} not found`, 404);
    }

    // Delete the archive
    const deleted = await archivesDb.deleteArchive(env.DB, year);

    if (deleted) {
      return json({
        success: true,
        message: `Archive for ${year} has been deleted`
      });
    } else {
      return error('Failed to delete archive', 500);
    }
  } catch (error_) {
    console.error('Error deleting archive:', error_);
    return error('Failed to delete archive', 500);
  }
}
