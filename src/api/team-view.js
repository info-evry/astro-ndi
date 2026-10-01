/**
 * Public team view API - allows users to view team members with password
 */

import { json } from 'astro-core/router';
import { parsePositiveId } from 'astro-core/ids';
import { badRequest, forbidden, invalidId, notFound, serverError } from 'astro-core/http';
import * as db from '../lib/db.js';
import { normalizeTeamPassword } from '../lib/validation.js';
import { hashPassword, verifyPassword, needsHashUpgrade } from '../shared/crypto.js';
import { readBody } from '../shared/http.js';

/**
 * POST /api/teams/:id/view - View team members with password
 */
export async function viewTeamMembers(request, env, ctx, params) {
  try {
    const teamId = parsePositiveId(params.id);
    if (teamId === null) return invalidId();

    const { data, response } = await readBody(request);
    if (response) return response;

    // Same trim / length policy as when the password was set
    const password = normalizeTeamPassword(data.password);
    if (!password) {
      return badRequest('Code secret requis', 'password_required');
    }

    const team = await db.getTeamById(env.DB, teamId);
    if (!team) {
      return notFound('Équipe introuvable');
    }

    // Verify password using the new verifyPassword function
    // which handles both legacy SHA-256 and new PBKDF2 formats
    const isValid = await verifyPassword(password, team.password_hash);

    if (!isValid) {
      return forbidden('Code secret incorrect');
    }

    // Upgrade legacy hash to new format on successful login
    if (needsHashUpgrade(team.password_hash)) {
      try {
        const newHash = await hashPassword(password);
        await db.updateTeam(env.DB, teamId, { passwordHash: newHash });
      } catch (error_) {
        // Log but don't fail the request if upgrade fails
        console.error('Failed to upgrade password hash:', error_);
      }
    }

    // Return team info with members (exclude sensitive data)
    return json({
      team: {
        id: team.id,
        name: team.name,
        description: team.description,
        created_at: team.created_at,
        members: team.members.map(m => ({
          id: m.id,
          firstName: m.first_name,
          lastName: m.last_name,
          email: m.email,
          bacLevel: m.bac_level,
          isLeader: !!m.is_leader,
          foodDiet: m.food_diet
        }))
      }
    });
  } catch (error_) {
    return serverError('Error viewing team:', error_);
  }
}
