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
 * GET /api/admin/archives/:year/export - Export archive as ZIP
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

    // Generate export files
    const files = generateExportFiles(archive);

    // For now, return JSON with file contents
    // Full ZIP implementation would require a ZIP library
    return json({
      filename: `ndi-${year}-archive.json`,
      files: files
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

    return json({
      year: year,
      archiveExists: archiveExists,
      counts: counts,
      safe: archiveExists || (counts.teams === 0 && counts.members === 0)
    });
  } catch (error_) {
    console.error('Error checking reset safety:', error_);
    return error('Failed to check reset safety', 500);
  }
}

/**
 * Generate export file contents from archive
 */
function generateExportFiles(archive) {
  const files = {};

  // Metadata
  files['metadata.json'] = JSON.stringify({
    event_year: archive.event_year,
    archived_at: archive.archived_at,
    expiration_date: archive.expiration_date,
    is_expired: archive.is_expired,
    total_teams: archive.total_teams,
    total_participants: archive.total_participants,
    total_revenue: archive.total_revenue,
    data_hash: archive.data_hash
  }, null, 2);

  // Statistics (always full, even after expiration)
  files['statistics.json'] = JSON.stringify(archive.stats, null, 2);

  // Teams
  files['teams.json'] = JSON.stringify(archive.teams, null, 2);
  files['teams.csv'] = generateTeamsCSV(archive.teams);

  // Participants
  files['participants.json'] = JSON.stringify(archive.members, null, 2);
  files['participants.csv'] = generateMembersCSV(archive.members, archive.is_expired);

  // Payment events (if available)
  if (archive.payment_events && archive.payment_events.length > 0) {
    files['payment_events.json'] = JSON.stringify(archive.payment_events, null, 2);
    files['payment_events.csv'] = generatePaymentEventsCSV(archive.payment_events);
  }

  // README
  files['README.txt'] = generateReadme(archive);

  return files;
}

/**
 * Generate teams CSV
 */
function generateTeamsCSV(teams) {
  const BOM = '\ufeff';
  const headers = ['ID', 'Nom', 'Description', 'Membres', 'Salle', 'Date création'];
  
  const rows = teams.map(t => [
    t.id,
    escapeCSV(t.name),
    escapeCSV(t.description || ''),
    t.member_count,
    t.room_id || '',
    t.created_at
  ]);

  return BOM + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
}

/**
 * Generate members CSV
 */
function generateMembersCSV(members, isExpired) {
  const BOM = '\ufeff';
  const headers = isExpired
    ? ['ID', 'Équipe ID', 'Niveau BAC', 'Chef équipe', 'Pizza', 'Présent', 'Statut paiement', 'Montant']
    : ['ID', 'Prénom', 'Nom', 'Email', 'Équipe ID', 'Niveau BAC', 'Chef équipe', 'Pizza', 'Présent', 'Statut paiement', 'Montant'];
  
  const rows = members.map(m => {
    if (isExpired) {
      return [
        m.id,
        m.team_id,
        m.bac_level,
        m.is_leader ? 'Oui' : 'Non',
        escapeCSV(m.food_diet || ''),
        m.checked_in ? 'Oui' : 'Non',
        m.payment_status || '',
        m.payment_amount || ''
      ];
    }
    return [
      m.id,
      escapeCSV(m.first_name),
      escapeCSV(m.last_name),
      escapeCSV(m.email || ''),
      m.team_id,
      m.bac_level,
      m.is_leader ? 'Oui' : 'Non',
      escapeCSV(m.food_diet || ''),
      m.checked_in ? 'Oui' : 'Non',
      m.payment_status || '',
      m.payment_amount || ''
    ];
  });

  return BOM + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
}

/**
 * Generate payment events CSV
 */
function generatePaymentEventsCSV(events) {
  const BOM = '\ufeff';
  const headers = ['ID', 'Membre ID', 'Type', 'Montant (cents)', 'Tier', 'Date'];
  
  const rows = events.map(e => [
    e.id,
    e.member_id,
    e.event_type,
    e.amount,
    e.tier,
    e.created_at
  ]);

  return BOM + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
}

/**
 * Generate README file
 */
function generateReadme(archive) {
  const expirationStatus = archive.is_expired
    ? 'DONNÉES ANONYMISÉES (conformité GDPR)'
    : `Expiration: ${archive.expiration_date}`;

  return `
=== ARCHIVE NDI ${archive.event_year} ===

Date d'archivage: ${archive.archived_at}
${expirationStatus}

STATISTIQUES
------------
Équipes: ${archive.total_teams}
Participants: ${archive.total_participants}
Revenus: ${archive.total_revenue / 100}€

FICHIERS
--------
- metadata.json: Informations sur l'archive
- statistics.json: Statistiques détaillées
- teams.csv/json: Liste des équipes
- participants.csv/json: Liste des participants${archive.is_expired ? ' (anonymisé)' : ''}
- payment_events.csv/json: Événements de paiement

INTÉGRITÉ
---------
Hash: ${archive.data_hash}

---
Généré par astro-ndi
`.trim();
}

/**
 * Escape CSV field
 */
function escapeCSV(field) {
  if (field === null || field === undefined) return '';
  let str = String(field);
  if (/^[=+\-@\t\r|;]/.test(str)) {
    str = "'" + str;
  }
  if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes("'")) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}
