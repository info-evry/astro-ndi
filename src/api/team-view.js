/**
 * Public team view API - allows users to view team members with password
 */

import { json, error } from '../lib/router.js';
import * as db from '../lib/db.js';
import { hashPassword, verifyPassword, needsHashUpgrade } from '../shared/crypto.js';

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

    // Verify password using the new verifyPassword function
    // which handles both legacy SHA-256 and new PBKDF2 formats
    const isValid = await verifyPassword(password, team.password_hash);

    if (!isValid) {
      return error('Mot de passe incorrect', 403);
    }

    // Upgrade legacy hash to new format on successful login
    if (needsHashUpgrade(team.password_hash)) {
      try {
        const newHash = await hashPassword(password);
        await db.updateTeam(env.DB, teamId, { passwordHash: newHash });
      } catch (upgradeErr) {
        // Log but don't fail the request if upgrade fails
        console.error('Failed to upgrade password hash:', upgradeErr);
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
  } catch (err) {
    console.error('Error viewing team:', err);
    return error('Failed to load team', 500);
  }
}
