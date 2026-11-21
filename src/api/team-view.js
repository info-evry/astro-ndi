/**
 * Public team view API - allows users to view team members with password
 */

import { json } from 'astro-core/router';
import { parsePositiveId } from 'astro-core/ids';
import { badRequest, invalidId, notFound, serverError } from 'astro-core/http';
import * as db from '../lib/db.js';
import { normalizeTeamPassword } from '../lib/validation.js';
import { readBody } from '../shared/http.js';
import { getPizzaChangesOpen } from '../database/db.settings.js';
import { checkTeamSecret } from './team-auth.js';

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

    const refusal = await checkTeamSecret(env.DB, team, password);
    if (refusal) return refusal;

    // Return team info with members (exclude sensitive data)
    return json({
      team: {
        id: team.id,
        name: team.name,
        description: team.description,
        created_at: team.created_at,
        pizzaChangesOpen: await getPizzaChangesOpen(env.DB),
        members: team.members.map(m => ({
          id: m.id,
          firstName: m.first_name,
          lastName: m.last_name,
          email: m.email,
          bacLevel: m.bac_level,
          isLeader: !!m.is_leader,
          foodDiet: m.food_diet,
          pizzaReceived: !!m.pizza_received
        }))
      }
    });
  } catch (error_) {
    return serverError('Error viewing team:', error_);
  }
}
