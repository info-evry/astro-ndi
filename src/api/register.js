/**
 * Registration API handler
 */

import { json, error } from '../lib/router.js';
import * as db from '../lib/db.js';
import { validateRegistration, sanitizeString } from '../lib/validation.js';

/**
 * Hash password using Web Crypto API (SHA-256)
 */
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * POST /api/register - Register team members
 */
export async function register(request, env) {
  try {
    const data = await request.json();
    const maxTeamSize = parseInt(env.MAX_TEAM_SIZE, 10) || 15;
    const maxTotal = parseInt(env.MAX_TOTAL_PARTICIPANTS, 10) || 200;
    const minTeamSize = parseInt(env.MIN_TEAM_SIZE, 10) || 2;

    // Validate input
    const validation = validateRegistration(data, {
      maxTeamSize,
      minTeamSize
    });

    if (!validation.valid) {
      return error(validation.errors.join('; '), 400);
    }

    // Check total capacity
    const currentTotal = await db.getTotalParticipants(env.DB);
    if (currentTotal + validation.members.length > maxTotal) {
      return error(
        `Registration would exceed maximum capacity. Only ${maxTotal - currentTotal} spots available.`,
        400
      );
    }

    let teamId;
    let teamName;
    let isNewTeam = false;

    // Hash password using Web Crypto API
    const password = sanitizeString(data.teamPassword || '', 64);
    if (!password) {
      return error('Team password is required', 400);
    }

    const passwordHash = await hashPassword(password);

    // Handle team creation or selection
    if (data.createNewTeam) {
      const name = sanitizeString(data.teamName, 128);
      const description = sanitizeString(data.teamDescription || '', 256);

      // Check if team name exists
      const existing = await db.getTeamByName(env.DB, name);
      if (existing) {
        return error('Team name already exists', 400);
      }

      const team = await db.createTeam(env.DB, name, description, passwordHash);
      teamId = team.id;
      teamName = name;
      isNewTeam = true;
    } else {
      teamId = parseInt(data.teamId, 10);
      const team = await db.getTeamById(env.DB, teamId);

      if (!team) {
        return error('Selected team not found', 404);
      }

      // Verify password
      const passwordValid = await db.verifyTeamPassword(env.DB, teamId, passwordHash);
      if (!passwordValid) {
        return error('Incorrect password', 403);
      }

      teamName = team.name;

      // Check team capacity (except for Organisation)
      if (team.name !== 'Organisation') {
        const teamMemberCount = await db.getTeamMemberCount(env.DB, teamId);
        if (teamMemberCount + validation.members.length > maxTeamSize) {
          return error(
            `Team is full or would exceed capacity. Only ${maxTeamSize - teamMemberCount} spots available.`,
            400
          );
        }
      }
    }

    // Check for existing members
    for (const member of validation.members) {
      const exists = await db.memberExists(env.DB, member.firstName, member.lastName);
      if (exists) {
        return error(
          `${member.firstName} ${member.lastName} is already registered`,
          400
        );
      }
    }

    // Add all members
    const addedMembers = [];
    for (const member of validation.members) {
      const added = await db.addMember(env.DB, teamId, member);
      addedMembers.push(added);
    }

    // Send confirmation email (non-blocking)
    try {
      await sendConfirmationEmail(env, {
        teamName,
        isNewTeam,
        members: validation.members
      });
    } catch (emailErr) {
      console.error('Failed to send confirmation email:', emailErr);
      // Don't fail the registration if email fails
    }

    return json({
      success: true,
      message: `Successfully registered ${addedMembers.length} member(s) to team "${teamName}"`,
      team: { id: teamId, name: teamName, isNew: isNewTeam },
      members: addedMembers.map(m => ({
        id: m.id,
        firstName: m.firstName,
        lastName: m.lastName
      }))
    });

  } catch (err) {
    console.error('Registration error:', err);
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
  } catch (err) {
    console.error('Error sending admin notification email:', err);
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
    } catch (err) {
      console.error('Error sending participant confirmation email:', err);
      // Optionally, handle the error as needed
    }
  }
}
