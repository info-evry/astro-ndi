/**
 * Registration API handler
 */

import { json } from 'astro-core/router';
import { parsePositiveId } from 'astro-core/ids';
import { isUniqueConstraintError } from 'astro-core/request';
import { badRequest, conflict, forbidden, invalidId, notFound, serverError } from 'astro-core/http';
import * as db from '../lib/db.js';
import { validateRegistration, validateTeamName, normalizeTeamDescription, normalizeTeamPassword } from '../lib/validation.js';
import { hashPassword, verifyPassword, needsHashUpgrade } from '../shared/crypto.js';
import { ORGANISATION_TEAM_NAME, isNoPizza } from '../shared/constants.js';
import { readBody } from '../shared/http.js';
import { getCapacitySettings } from '../database/db.settings.js';
import { getConfiguredPizzaIds } from './config.js';

const MSG_TEAM_EXISTS = "Ce nom d'équipe existe déjà";
const MSG_MEMBERS_EXIST = 'Un ou plusieurs membres sont déjà inscrits';
const CODE_CAPACITY = 'capacity_exceeded';

/** @param {unknown} value */
const isBlank = (value) => value === undefined || value === null || value === '';

/**
 * Check the total capacity before registration.
 *
 * The Organisation team does not count: capacity is measured with the same
 * figure as the spots shown publicly (`getParticipantsExcludingOrg`).
 */
async function checkCapacity(database, memberCount, maxTotal) {
  const currentTotal = await db.getParticipantsExcludingOrg(database);
  const available = Math.max(0, maxTotal - currentTotal);
  return { ok: memberCount <= available, available };
}

function capacityResponse(available) {
  return badRequest(
    `L'inscription dépasserait la capacité maximale : il reste ${available} place(s) disponible(s).`,
    CODE_CAPACITY
  );
}

/**
 * Create a new team
 */
async function createNewTeam(database, data, passwordHash) {
  // Already validated by validateRegistration, normalised again for the value to store
  const name = validateTeamName(data.teamName).value;
  const description = normalizeTeamDescription(data.teamDescription);

  const existing = await db.getTeamByName(database, name);
  if (existing) {
    return { response: conflict(MSG_TEAM_EXISTS) };
  }

  try {
    const team = await db.createTeam(database, name, description, passwordHash);
    return { teamId: team.id, teamName: name, isNewTeam: true };
  } catch (error_) {
    // Lost a race against another registration of the same team name
    if (isUniqueConstraintError(error_)) return { response: conflict(MSG_TEAM_EXISTS) };
    throw error_;
  }
}

/**
 * Join an existing team with password verification
 */
async function joinExistingTeam(database, teamId, password, memberCount, limits) {
  const team = await db.getTeamById(database, teamId);

  if (!team) {
    return { response: notFound('Équipe introuvable') };
  }

  const passwordValid = await verifyPassword(password, team.password_hash);
  if (!passwordValid) {
    return { response: forbidden('Code secret incorrect') };
  }

  // Upgrade legacy hash to new format on successful verification
  if (needsHashUpgrade(team.password_hash)) {
    try {
      const newHash = await hashPassword(password);
      await db.updateTeam(database, teamId, { passwordHash: newHash });
    } catch (error_) {
      console.error('Failed to upgrade password hash:', error_);
    }
  }

  // The Organisation team has no size limit and does not count for the capacity
  if (team.name !== ORGANISATION_TEAM_NAME) {
    const teamMemberCount = await db.getTeamMemberCount(database, teamId);
    const available = Math.max(0, limits.maxTeamSize - teamMemberCount);
    if (memberCount > available) {
      return {
        response: badRequest(
          `L'équipe est complète ou dépasserait sa capacité : il reste ${available} place(s).`,
          'team_full'
        )
      };
    }

    const capacity = await checkCapacity(database, memberCount, limits.maxTotal);
    if (!capacity.ok) return { response: capacityResponse(capacity.available) };
  }

  return { teamId, teamName: team.name, isNewTeam: false };
}

/**
 * Insert members into the database using batch operations
 */
async function insertMembers(database, teamId, members) {
  const insertStatements = members.map(member =>
    database.prepare(`
      INSERT INTO members (team_id, first_name, last_name, email, bac_level, is_leader, food_diet)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      teamId,
      member.firstName,
      member.lastName,
      member.email,
      member.bacLevel || 0,
      member.isLeader ? 1 : 0,
      member.foodDiet || ''
    )
  );

  const results = await database.batch(insertStatements);
  return members.map((member, i) => ({
    id: results[i].meta.last_row_id,
    ...member
  }));
}

/**
 * Best-effort removal of a team created during a registration that then failed
 */
async function removeEmptyTeam(database, teamId) {
  try {
    await db.deleteTeam(database, teamId);
  } catch (error_) {
    console.error('Failed to remove team after a failed registration:', error_);
  }
}

/**
 * Create the new team or check the right to join the existing one.
 * Resolves the target team (`teamId`, `teamName`, `isNewTeam`) or a `response`.
 */
async function resolveTeam(database, data, { teamId, password, memberCount, limits }) {
  if (!data.createNewTeam) {
    return joinExistingTeam(database, teamId, password, memberCount, limits);
  }

  const capacity = await checkCapacity(database, memberCount, limits.maxTotal);
  if (!capacity.ok) return { response: capacityResponse(capacity.available) };

  return createNewTeam(database, data, await hashPassword(password));
}

/**
 * Insert the members (one atomic batch). A team created for this very
 * registration is removed when the insert fails, so it cannot block a retry
 * with the same team name.
 */
async function addMembers(database, team, members) {
  try {
    return { addedMembers: await insertMembers(database, team.teamId, members) };
  } catch (error_) {
    if (team.isNewTeam) {
      await removeEmptyTeam(database, team.teamId);
    }
    if (isUniqueConstraintError(error_)) {
      return { response: conflict(MSG_MEMBERS_EXIST) };
    }
    throw error_;
  }
}

/**
 * POST /api/register - Register team members
 */
export async function register(request, env) {
  try {
    const { data, response } = await readBody(request);
    if (response) return response;

    // A teamId that is present but malformed is an invalid id (a missing one is a validation error)
    const teamId = data.createNewTeam ? null : parsePositiveId(data.teamId);
    if (!data.createNewTeam && !isBlank(data.teamId) && teamId === null) {
      return invalidId("Identifiant d'équipe invalide");
    }

    // Capacity limits: admin-edited D1 settings take precedence over the
    // environment defaults (same source as GET /api/config and /api/teams).
    const { maxTeamSize, maxTotalParticipants: maxTotal, minTeamSize } = await getCapacitySettings(env.DB, env);

    // Validate input (the food choice must be one of the configured pizzas)
    const pizzaIds = await getConfiguredPizzaIds(env);
    const validation = validateRegistration(data, { maxTeamSize, minTeamSize, pizzaIds });
    if (!validation.valid) {
      // `error` (joined) stays for existing clients; `errors` lets a form list them one by one
      return json({ error: validation.errors.join('; '), code: 'validation_error', errors: validation.errors }, 400);
    }

    // Validate the team secret code (API field: `teamPassword`; there is no user account)
    const password = normalizeTeamPassword(data.teamPassword);
    if (!password) {
      return badRequest("Le code secret de l'équipe est requis", 'password_required');
    }

    // Handle team creation or joining
    const teamResult = await resolveTeam(env.DB, data, {
      teamId,
      password,
      memberCount: validation.members.length,
      limits: { maxTeamSize, maxTotal }
    });
    if (teamResult.response) {
      return teamResult.response;
    }

    const { teamId: targetTeamId, teamName, isNewTeam } = teamResult;

    // Insert members
    const { addedMembers, response: insertResponse } = await addMembers(env.DB, teamResult, validation.members);
    if (insertResponse) {
      return insertResponse;
    }

    // Send confirmation email (non-blocking)
    try {
      await sendConfirmationEmail(env, { teamName, isNewTeam, members: validation.members });
    } catch (error_) {
      console.error('Failed to send confirmation email:', error_);
    }

    return json({
      success: true,
      message: `Inscription enregistrée : ${addedMembers.length} membre(s) dans l'équipe « ${teamName} »`,
      team: { id: targetTeamId, name: teamName, isNew: isNewTeam },
      members: addedMembers.map(m => ({ id: m.id, firstName: m.firstName, lastName: m.lastName }))
    });

  } catch (error_) {
    return serverError(
      'Registration error:',
      error_,
      "Une erreur est survenue pendant l'inscription. Veuillez réessayer."
    );
  }
}

/**
 * Send confirmation email via MailChannels API (free for Workers)
 */
async function sendConfirmationEmail(env, { teamName, isNewTeam, members }) {
  // Skip email in test environment
  const adminEmail = env.ADMIN_EMAIL || 'asso@info-evry.fr';
  if (adminEmail === 'test@example.com') {
    return;
  }

  // Use MailChannels Send API (free for Cloudflare Workers)
  const replyTo = env.REPLY_TO_EMAIL || 'contact@info-evry.fr';

  const memberList = members.map(m =>
    `- ${m.firstName} ${m.lastName} (${m.email})${m.isLeader ? ' [Chef d\'équipe]' : ''}`
  ).join('\n');

  const pizzaList = members
    .filter(m => !isNoPizza(m.foodDiet))
    .map(m => `- ${m.firstName} ${m.lastName}: ${m.foodDiet}`)
    .join('\n') || 'Aucune sélection';

  const subject = isNewTeam
    ? `[NDI] Nouvelle équipe créée: ${teamName}`
    : `[NDI] Nouveaux membres: ${teamName}`;

  const body = `
Bonjour,

${isNewTeam ? `L'équipe "${teamName}" a été créée` : `De nouveaux membres ont rejoint l'équipe "${teamName}"`} pour la Nuit de l'Info.

Membres inscrits:
${memberList}

Préférences pizza:
${pizzaList}

Cordialement,
L'équipe d'organisation
`.trim();

  // Get first member email for participant confirmation
  const firstMemberEmail = members[0]?.email;

  // Send to admin
  try {
    await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: adminEmail }] }],
        from: { email: replyTo, name: 'Nuit de l\'Info' },
        reply_to: { email: replyTo },
        subject,
        content: [{ type: 'text/plain', value: body }]
      })
    });
  } catch (error_) {
    console.error('Error sending admin notification email:', error_);
    // Optionally, handle the error, e.g. add fallback or response status
  }

  // Send confirmation to first member
  if (firstMemberEmail) {
    const participantBody = `
Bonjour,

Votre inscription à la Nuit de l'Info a été confirmée!

Équipe: ${teamName}
Membres inscrits: ${members.length}

${memberList}

À bientôt!
L'équipe d'organisation
`.trim();

    try {
      await fetch('https://api.mailchannels.net/tx/v1/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: firstMemberEmail }] }],
          from: { email: replyTo, name: 'Nuit de l\'Info' },
          reply_to: { email: replyTo },
          subject: '[NDI] Confirmation d\'inscription',
          content: [{ type: 'text/plain', value: participantBody }]
        })
      });
    } catch (error_) {
      console.error('Error sending participant confirmation email:', error_);
      // Optionally, handle the error as needed
    }
  }
}
