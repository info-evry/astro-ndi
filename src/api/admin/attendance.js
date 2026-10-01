/**
 * Admin attendance handlers - check-in/check-out operations
 */

import { json } from 'astro-core/router';
import { adminOnly } from 'astro-core/auth';
import { parsePositiveId } from 'astro-core/ids';
import { badRequest, invalidId, notFound, serverError } from 'astro-core/http';
import * as db from '../../lib/db.js';
import { MAX_PAYMENT_AMOUNT_CENTS, isPaymentTier } from '../../shared/constants.js';
import { readIdList, readOptionalBody } from '../../shared/http.js';

const MSG_MEMBER_NOT_FOUND = 'Membre introuvable';

/**
 * Parse a payment amount in cents: a non-negative integer (number or digit
 * string) not above MAX_PAYMENT_AMOUNT_CENTS. `null` when invalid.
 * @param {unknown} value
 * @returns {number|null}
 */
function parsePaymentAmount(value) {
  let amount = Number.NaN;
  if (typeof value === 'number') {
    amount = value;
  } else if (typeof value === 'string' && /^\d{1,9}$/.test(value)) {
    amount = Number(value);
  }
  return Number.isSafeInteger(amount) && amount >= 0 && amount <= MAX_PAYMENT_AMOUNT_CENTS ? amount : null;
}

/**
 * Extract the optional payment info of a check-in body.
 * Resolves `{ payment: null }` when the body carries none, `{ payment }` with
 * a validated tier and amount, or `{ response }` (400) when it is invalid.
 * @param {Record<string, any>|null} body
 */
function parseCheckInPayment(body) {
  const hasTier = body && body.paymentTier !== undefined && body.paymentTier !== null && body.paymentTier !== '';
  const hasAmount = body && body.paymentAmount !== undefined && body.paymentAmount !== null;
  if (!hasTier && !hasAmount) return { payment: null };

  if (!isPaymentTier(body.paymentTier)) {
    return { response: badRequest('Type de paiement invalide', 'invalid_payment_tier') };
  }
  const amount = parsePaymentAmount(body.paymentAmount);
  if (amount === null) {
    return {
      response: badRequest(
        `Montant invalide (entier entre 0 et ${MAX_PAYMENT_AMOUNT_CENTS} centimes)`,
        'invalid_payment_amount'
      )
    };
  }
  return { payment: { tier: body.paymentTier, amount } };
}

/**
 * GET /api/admin/attendance - Get all members with attendance status
 */
export const getAttendance = adminOnly(async (request, env) => {
  try {
    const members = await db.getAllMembersWithPayment(env.DB);
    const stats = await db.getAttendanceStats(env.DB);
    const paymentStats = await db.getTierStats(env.DB);

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
  } catch (error_) {
    return serverError('Error fetching attendance:', error_);
  }
});

/**
 * POST /api/admin/attendance/check-in/:id - Check in a member
 * Optionally accepts { paymentTier, paymentAmount } in body for paid check-in.
 * An absent body is a plain check-in; a body that is present but malformed,
 * or whose payment info is invalid, is a 400.
 */
export const checkInMember = adminOnly(async (request, env, ctx, params) => {
  try {
    const memberId = parsePositiveId(params.id);
    if (memberId === null) return invalidId();

    const { data: body, response } = await readOptionalBody(request);
    if (response) return response;

    const { payment, response: paymentResponse } = parseCheckInPayment(body);
    if (paymentResponse) return paymentResponse;

    const member = await db.getMemberById(env.DB, memberId);
    if (!member) return notFound(MSG_MEMBER_NOT_FOUND);

    // Check in with or without payment
    const success = payment
      ? await db.checkInWithPayment(env.DB, memberId, payment.tier, payment.amount)
      : await db.checkInMember(env.DB, memberId);

    if (!success) return notFound(MSG_MEMBER_NOT_FOUND); // deleted in the meantime

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
  } catch (error_) {
    return serverError('Error checking in member:', error_);
  }
});

/**
 * POST /api/admin/attendance/check-out/:id - Check out a member (revoke attendance)
 */
export const checkOutMember = adminOnly(async (request, env, ctx, params) => {
  try {
    const memberId = parsePositiveId(params.id);
    if (memberId === null) return invalidId();

    const member = await db.getMemberById(env.DB, memberId);
    if (!member) return notFound(MSG_MEMBER_NOT_FOUND);

    const success = await db.checkOutMember(env.DB, memberId);
    if (!success) return notFound(MSG_MEMBER_NOT_FOUND); // deleted in the meantime

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
  } catch (error_) {
    return serverError('Error checking out member:', error_);
  }
});

/**
 * POST /api/admin/attendance/check-in-batch - Batch check in multiple members
 */
export const checkInMembersBatch = adminOnly(async (request, env) => {
  try {
    const { ids, response } = await readIdList(request, 'memberIds');
    if (response) return response;

    const count = await db.checkInMembers(env.DB, ids);

    return json({ success: true, checked_in: count });
  } catch (error_) {
    return serverError('Error batch checking in:', error_);
  }
});

/**
 * POST /api/admin/attendance/check-out-batch - Batch check out multiple members
 */
export const checkOutMembersBatch = adminOnly(async (request, env) => {
  try {
    const { ids, response } = await readIdList(request, 'memberIds');
    if (response) return response;

    const count = await db.checkOutMembers(env.DB, ids);

    return json({ success: true, checked_out: count });
  } catch (error_) {
    return serverError('Error batch checking out:', error_);
  }
});
