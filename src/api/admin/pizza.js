/**
 * Admin pizza distribution handlers
 */

import { json } from 'astro-core/router';
import { adminOnly } from 'astro-core/auth';
import { parsePositiveId } from 'astro-core/ids';
import { invalidId, notFound, serverError } from 'astro-core/http';
import * as db from '../../lib/db.js';
import { readIdList } from '../../shared/http.js';

const MSG_MEMBER_NOT_FOUND = 'Membre introuvable';

/**
 * GET /api/admin/pizza - Get all members with pizza distribution status
 */
export const getPizza = adminOnly(async (request, env) => {
  try {
    const members = await db.getAllMembersWithPizzaStatus(env.DB);
    const stats = await db.getPizzaStats(env.DB);

    return json({
      members,
      stats: {
        total: stats?.total || 0,
        received: stats?.received || 0,
        pending: stats?.pending || 0,
        by_type: stats?.by_type || [],
        present: stats?.present || { total: 0, received: 0, pending: 0, by_type: [] }
      }
    });
  } catch (error_) {
    return serverError('Error fetching pizza status:', error_);
  }
});

/**
 * POST /api/admin/pizza/give/:id - Mark member as received pizza
 */
export const givePizzaMember = adminOnly(async (request, env, ctx, params) => {
  try {
    const memberId = parsePositiveId(params.id);
    if (memberId === null) return invalidId();

    const member = await db.getMemberById(env.DB, memberId);
    if (!member) return notFound(MSG_MEMBER_NOT_FOUND);

    const success = await db.givePizza(env.DB, memberId);
    if (!success) return notFound(MSG_MEMBER_NOT_FOUND); // deleted in the meantime

    const updated = await db.getMemberById(env.DB, memberId);

    return json({
      success: true,
      member: {
        id: updated.id,
        pizza_received: updated.pizza_received,
        pizza_received_at: updated.pizza_received_at
      }
    });
  } catch (error_) {
    return serverError('Error giving pizza:', error_);
  }
});

/**
 * POST /api/admin/pizza/revoke/:id - Revoke pizza from member (undo)
 */
export const revokePizzaMember = adminOnly(async (request, env, ctx, params) => {
  try {
    const memberId = parsePositiveId(params.id);
    if (memberId === null) return invalidId();

    const member = await db.getMemberById(env.DB, memberId);
    if (!member) return notFound(MSG_MEMBER_NOT_FOUND);

    const success = await db.revokePizza(env.DB, memberId);
    if (!success) return notFound(MSG_MEMBER_NOT_FOUND); // deleted in the meantime

    return json({
      success: true,
      member: {
        id: memberId,
        pizza_received: 0,
        pizza_received_at: null
      }
    });
  } catch (error_) {
    return serverError('Error revoking pizza:', error_);
  }
});

/**
 * POST /api/admin/pizza/give-batch - Batch give pizza to multiple members
 */
export const givePizzaMembersBatch = adminOnly(async (request, env) => {
  try {
    const { ids, response } = await readIdList(request, 'memberIds');
    if (response) return response;

    const count = await db.givePizzaBatch(env.DB, ids);

    return json({ success: true, given: count });
  } catch (error_) {
    return serverError('Error batch giving pizza:', error_);
  }
});

/**
 * POST /api/admin/pizza/revoke-batch - Batch revoke pizza from multiple members
 */
export const revokePizzaMembersBatch = adminOnly(async (request, env) => {
  try {
    const { ids, response } = await readIdList(request, 'memberIds');
    if (response) return response;

    const count = await db.revokePizzaBatch(env.DB, ids);

    return json({ success: true, revoked: count });
  } catch (error_) {
    return serverError('Error batch revoking pizza:', error_);
  }
});
