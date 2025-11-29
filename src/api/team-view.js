/**
 * Public team view API - allows users to view team members with password
 */

import { json, error } from '../lib/router.js';
import * as db from '../lib/db.js';

/**
 * Hash password using Web Crypto API
 */
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * POST /api/teams/:id/view - View team members with password
 */
export async function viewTeamMembers(request, env, ctx, params) {
  try {
    const teamId = parseInt(params.id, 10);
    const { password } = await request.json();

    if (!password) {
      return error('Password is required', 400);
    }

    const team = await db.getTeamById(env.DB, teamId);
    if (!team) {
      return error('Team not found', 404);
    }

    // Verify password
    const passwordHash = await hashPassword(password);
    const isValid = await db.verifyTeamPassword(env.DB, teamId, passwordHash);

    if (!isValid) {
      return error('Mot de passe incorrect', 403);
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
  } catch (err) {
    console.error('Error viewing team:', err);
    return error('Failed to load team', 500);
  }
}
