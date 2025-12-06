/**
 * Registration API handler
 */

import { json, error } from '../lib/router.js';
import * as db from '../lib/db.js';
import { validateRegistration, sanitizeString } from '../lib/validation.js';
import { hashPassword, verifyPassword, needsHashUpgrade } from '../shared/crypto.js';

/**
 * Check total capacity before registration
 */
async function checkCapacity(database, memberCount, maxTotal) {
  const currentTotal = await db.getTotalParticipants(database);
  const available = maxTotal - currentTotal;
  if (memberCount > available) {
    return { ok: false, available };
  }
  return { ok: true, available };
}

/**
 * Create a new team
 */
async function createNewTeam(database, data, passwordHash) {
  const name = sanitizeString(data.teamName, 128);
  const description = sanitizeString(data.teamDescription || '', 256);

  const existing = await db.getTeamByName(database, name);
  if (existing) {
    return { error: 'Team name already exists' };
  }

  const team = await db.createTeam(database, name, description, passwordHash);
  return { teamId: team.id, teamName: name, isNewTeam: true };
}

/**
 * Join an existing team with password verification
 */
async function joinExistingTeam(database, data, password, memberCount, maxTeamSize) {
  const teamId = Number.parseInt(data.teamId, 10);
  const team = await db.getTeamById(database, teamId);

  if (!team) {
    return { error: 'Selected team not found', status: 404 };
  }

  const passwordValid = await verifyPassword(password, team.password_hash);
  if (!passwordValid) {
    return { error: 'Incorrect password', status: 403 };
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

  // Check team capacity (except for Organisation)
  if (team.name !== 'Organisation') {
    const teamMemberCount = await db.getTeamMemberCount(database, teamId);
    const available = maxTeamSize - teamMemberCount;
    if (memberCount > available) {
      return { error: `Team is full or would exceed capacity. Only ${available} spots available.` };
    }
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
 * POST /api/register - Register team members
 */
export async function register(request, env) {
  try {
    const data = await request.json();
    const maxTeamSize = Number.parseInt(env.MAX_TEAM_SIZE, 10) || 15;
    const maxTotal = Number.parseInt(env.MAX_TOTAL_PARTICIPANTS, 10) || 200;
    const minTeamSize = Number.parseInt(env.MIN_TEAM_SIZE, 10) || 2;

    // Validate input
    const validation = validateRegistration(data, { maxTeamSize, minTeamSize });
    if (!validation.valid) {
      return error(validation.errors.join('; '), 400);
    }

    // Check total capacity
    const capacity = await checkCapacity(env.DB, validation.members.length, maxTotal);
    if (!capacity.ok) {
      return error(`Registration would exceed maximum capacity. Only ${capacity.available} spots available.`, 400);
    }

    // Validate password
    const password = sanitizeString(data.teamPassword || '', 64);
    if (!password) {
      return error('Team password is required', 400);
    }

    // Handle team creation or joining
    let teamResult;
    if (data.createNewTeam) {
      const passwordHash = await hashPassword(password);
      teamResult = await createNewTeam(env.DB, data, passwordHash);
    } else {
      teamResult = await joinExistingTeam(env.DB, data, password, validation.members.length, maxTeamSize);
    }

    if (teamResult.error) {
      return error(teamResult.error, teamResult.status || 400);
    }

    const { teamId, teamName, isNewTeam } = teamResult;

    // Insert members
    let addedMembers;
    try {
      addedMembers = await insertMembers(env.DB, teamId, validation.members);
    } catch (error_) {
      const errMsg = error_.message?.toLowerCase() || '';
      const isConstraintError = errMsg.includes('unique constraint') ||
          errMsg.includes('duplicate') ||
          errMsg.includes('already exists') ||
          (error_.code && String(error_.code).includes('CONSTRAINT'));
      if (isConstraintError) {
        return error('One or more members are already registered', 400);
      }
      throw error_;
    }

    // Send confirmation email (non-blocking)
    try {
      await sendConfirmationEmail(env, { teamName, isNewTeam, members: validation.members });
    } catch (error_) {
      console.error('Failed to send confirmation email:', error_);
    }

    return json({
      success: true,
      message: `Successfully registered ${addedMembers.length} member(s) to team "${teamName}"`,
      team: { id: teamId, name: teamName, isNew: isNewTeam },
      members: addedMembers.map(m => ({ id: m.id, firstName: m.firstName, lastName: m.lastName }))
    });

  } catch (error_) {
    console.error('Registration error:', error_);
    return error('An error occurred during registration. Please try again.', 500);
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
    .filter(m => m.foodDiet && m.foodDiet !== 'none')
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
