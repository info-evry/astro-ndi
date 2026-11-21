/**
 * Public pizza change: a team changes the pizza of one of its members with the
 * team's code secret, as long as the organisers keep the changes open and the
 * pizza has not been handed out.
 */

import { json, error } from 'astro-core/router';
import { parsePositiveId } from 'astro-core/ids';
import { badRequest, invalidId, notFound, serverError } from 'astro-core/http';
import * as db from '../lib/db.js';
import { normalizeTeamPassword, validateMemberUpdate } from '../lib/validation.js';
import { readBody } from '../shared/http.js';
import { getPizzaChangesOpen } from '../database/db.settings.js';
import { getConfiguredPizzaIds } from './config.js';
import { checkTeamSecret } from './team-auth.js';

const CODE_CHANGES_CLOSED = 'pizza_changes_closed';
const CODE_ALREADY_GIVEN = 'pizza_already_given';

/**
 * PUT /api/teams/:id/members/:memberId/pizza - body `{ password, foodDiet }`
 */
export async function changeMemberPizza(request, env, ctx, params) {
  try {
    const teamId = parsePositiveId(params.id);
    const memberId = parsePositiveId(params.memberId);
    if (teamId === null || memberId === null) return invalidId();

    const { data, response } = await readBody(request);
    if (response) return response;

    const password = normalizeTeamPassword(data.password);
    if (!password) return badRequest('Code secret requis', 'password_required');

    const team = await db.getTeamById(env.DB, teamId);
    if (!team) return notFound('Équipe introuvable');

    const refusal = await checkTeamSecret(env.DB, team, password);
    if (refusal) return refusal;

    // Same rule as the registration and the admin: one of the catalogue's ids, or "no pizza"
    const update = validateMemberUpdate({ foodDiet: data.foodDiet }, { pizzaIds: await getConfiguredPizzaIds(env) });
    if (!update.valid || update.value.foodDiet === undefined || typeof data.foodDiet !== 'string') {
      return badRequest(update.errors?.[0] ?? 'Le choix de pizza est invalide');
    }

    const member = team.members.find(m => m.id === memberId);
    if (!member) return notFound('Membre introuvable');

    if (!await getPizzaChangesOpen(env.DB)) {
      return error(
        'Les modifications de pizza sont closes : contactez les organisateurs',
        403,
        CODE_CHANGES_CLOSED
      );
    }
    // One statement checks and writes, so a pizza handed out at that very moment is not overwritten
    const result = await env.DB.prepare(
      'UPDATE members SET food_diet = ? WHERE id = ? AND team_id = ? AND COALESCE(pizza_received, 0) = 0'
    ).bind(update.value.foodDiet, memberId, teamId).run();
    if (result.meta.changes === 0) {
      return error('Cette pizza a déjà été remise : elle ne peut plus être changée', 409, CODE_ALREADY_GIVEN);
    }

    return json({ success: true, member: { id: memberId, foodDiet: update.value.foodDiet } });
  } catch (error_) {
    return serverError('Error changing pizza:', error_);
  }
}
