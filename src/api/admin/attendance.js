/**
 * Admin attendance handlers - check-in/check-out operations
 */

import { json, error } from '../../lib/router.js';
import * as db from '../../lib/db.js';
import { verifyAdmin } from '../../shared/auth.js';

/**
 * GET /api/admin/attendance - Get all members with attendance status
 */
export async function getAttendance(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const members = await db.getAllMembersWithPayment(env.DB);
    const stats = await db.getAttendanceStats(env.DB);
    const paymentStats = await db.getPaymentStats(env.DB);

    return json({
      members,
      stats: {
        total: stats?.total || 0,
        checked_in: stats?.checked_in || 0,
        not_checked_in: stats?.not_checked_in || 0,
        // Payment stats (nested for cleaner structure)
        payment: {
          total_paid: paymentStats?.total_paid || 0,
          total_revenue: paymentStats?.total_revenue || 0,
          asso_members: paymentStats?.asso_members || 0,
          asso_revenue: paymentStats?.asso_revenue || 0,
          non_members: paymentStats?.non_members || 0,
          non_member_revenue: paymentStats?.non_member_revenue || 0,
          late_arrivals: paymentStats?.late_arrivals || 0,
          late_revenue: paymentStats?.late_revenue || 0
        }
      }
    });
  } catch (err) {
    console.error('Error fetching attendance:', err);
    return error('Failed to fetch attendance', 500);
  }
}

/**
 * POST /api/admin/attendance/check-in/:id - Check in a member
 * Optionally accepts { paymentTier, paymentAmount } in body for paid check-in
 */
export async function checkInMember(request, env, ctx, params) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const memberId = Number.parseInt(params.id, 10);

    const member = await db.getMemberById(env.DB, memberId);
    if (!member) {
      return error('Member not found', 404);
    }

    // Check for payment info in request body
    let paymentTier = null;
    let paymentAmount = null;

    try {
      const body = await request.json();
      if (body.paymentTier && body.paymentAmount !== undefined) {
        paymentTier = body.paymentTier;
        paymentAmount = Number.parseInt(body.paymentAmount, 10);
      }
    } catch {
      // No body or invalid JSON - proceed without payment info
    }

    // Check in with or without payment
    const success = paymentTier && paymentAmount !== null
      ? await db.checkInWithPayment(env.DB, memberId, paymentTier, paymentAmount)
      : await db.checkInMember(env.DB, memberId);

    if (!success) {
      return error('Failed to check in member', 500);
    }

    const updated = await db.getMemberById(env.DB, memberId);

    return json({
      success: true,
      member: {
        id: updated.id,
        checked_in: updated.checked_in,
        checked_in_at: updated.checked_in_at,
        payment_tier: updated.payment_tier,
        payment_amount: updated.payment_amount,
        payment_confirmed_at: updated.payment_confirmed_at
      }
    });
  } catch (err) {
    console.error('Error checking in member:', err);
    return error('Failed to check in member', 500);
  }
}

/**
 * POST /api/admin/attendance/check-out/:id - Check out a member (revoke attendance)
 */
export async function checkOutMember(request, env, ctx, params) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const memberId = Number.parseInt(params.id, 10);

    const member = await db.getMemberById(env.DB, memberId);
    if (!member) {
      return error('Member not found', 404);
    }

    const success = await db.checkOutMember(env.DB, memberId);
    if (!success) {
      return error('Failed to check out member', 500);
    }

    return json({
      success: true,
      member: {
        id: memberId,
        checked_in: 0,
        checked_in_at: null,
        payment_tier: null,
        payment_amount: null,
        payment_confirmed_at: null
      }
    });
  } catch (err) {
    console.error('Error checking out member:', err);
    return error('Failed to check out member', 500);
  }
}

/**
 * POST /api/admin/attendance/check-in-batch - Batch check in multiple members
 */
export async function checkInMembersBatch(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const { memberIds } = await request.json();

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return error('memberIds array is required', 400);
    }

    const count = await db.checkInMembers(env.DB, memberIds.map(id => Number.parseInt(id, 10)));

    return json({ success: true, checked_in: count });
  } catch (err) {
    console.error('Error batch checking in:', err);
    return error('Failed to check in members', 500);
  }
}

/**
 * POST /api/admin/attendance/check-out-batch - Batch check out multiple members
 */
export async function checkOutMembersBatch(request, env) {
  if (!await verifyAdmin(request, env)) {
    return error('Unauthorized', 401);
  }

  try {
    const { memberIds } = await request.json();

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return error('memberIds array is required', 400);
    }

    const count = await db.checkOutMembers(env.DB, memberIds.map(id => Number.parseInt(id, 10)));

    return json({ success: true, checked_out: count });
  } catch (err) {
    console.error('Error batch checking out:', err);
    return error('Failed to check out members', 500);
  }
}
