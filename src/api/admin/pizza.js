/**
 * Admin pizza distribution handlers
 */

import { json, error } from '../../lib/router.js';
import * as db from '../../lib/db.js';
import { verifyAdmin } from '../../shared/auth.js';

/**
 * GET /api/admin/pizza - Get all members with pizza distribution status
 */
export async function getPizza(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

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
    console.error('Error fetching pizza status:', error_);
    return error('Failed to fetch pizza status', 500);
  }
}

/**
 * POST /api/admin/pizza/give/:id - Mark member as received pizza
 */
export async function givePizzaMember(request, env, ctx, params) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const memberId = Number.parseInt(params.id, 10);

    const member = await db.getMemberById(env.DB, memberId);
    if (!member) {
      return error('Member not found', 404);
    }

    const success = await db.givePizza(env.DB, memberId);
    if (!success) {
      return error('Failed to give pizza', 500);
    }

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
    console.error('Error giving pizza:', error_);
    return error('Failed to give pizza', 500);
  }
}

/**
 * POST /api/admin/pizza/revoke/:id - Revoke pizza from member (undo)
 */
export async function revokePizzaMember(request, env, ctx, params) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const memberId = Number.parseInt(params.id, 10);

    const member = await db.getMemberById(env.DB, memberId);
    if (!member) {
      return error('Member not found', 404);
    }

    const success = await db.revokePizza(env.DB, memberId);
    if (!success) {
      return error('Failed to revoke pizza', 500);
    }

    return json({
      success: true,
      member: {
        id: memberId,
        pizza_received: 0,
        pizza_received_at: null
      }
    });
  } catch (error_) {
    console.error('Error revoking pizza:', error_);
    return error('Failed to revoke pizza', 500);
  }
}

/**
 * POST /api/admin/pizza/give-batch - Batch give pizza to multiple members
 */
export async function givePizzaMembersBatch(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const { memberIds } = await request.json();

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return error('memberIds array is required', 400);
    }

    const count = await db.givePizzaBatch(env.DB, memberIds.map(id => Number.parseInt(id, 10)));

    return json({ success: true, given: count });
  } catch (error_) {
    console.error('Error batch giving pizza:', error_);
    return error('Failed to give pizza', 500);
  }
}

/**
 * POST /api/admin/pizza/revoke-batch - Batch revoke pizza from multiple members
 */
export async function revokePizzaMembersBatch(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const { memberIds } = await request.json();

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return error('memberIds array is required', 400);
    }

    const count = await db.revokePizzaBatch(env.DB, memberIds.map(id => Number.parseInt(id, 10)));

    return json({ success: true, revoked: count });
  } catch (error_) {
    console.error('Error batch revoking pizza:', error_);
    return error('Failed to revoke pizza', 500);
  }
}
