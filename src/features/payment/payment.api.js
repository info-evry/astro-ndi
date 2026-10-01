/**
 * Payment API handlers
 * Handles SumUp checkout creation and payment verification
 */

import { json, error } from 'astro-core/router';
import { verifyAdminToken } from 'astro-core/auth';
import { parsePositiveId } from 'astro-core/ids';
import { badRequest, forbidden, invalidId, notFound, serverError } from 'astro-core/http';
import * as paymentsDb from '../../database/db.payments.js';
import * as settingsDb from '../../database/db.settings.js';
import * as db from '../../lib/db.js';
import { normalizeTeamPassword } from '../../lib/validation.js';
import { verifyPassword } from '../../shared/crypto.js';
import {
  DEFAULT_PRICES,
  DEFAULT_TIER1_CUTOFF_DAYS,
  PAYMENT_STATUS
} from '../../shared/constants.js';
import { readBody } from '../../shared/http.js';
import {
  SumUpClient,
  generateCheckoutReference,
  parseCheckoutResponse,
  calculateTier,
  getPrice
} from 'astro-payments';

const MSG_TEAM_AUTH = "Mot de passe d'équipe requis ou incorrect";
const MSG_MEMBER_NOT_FOUND = 'Membre introuvable';
const MSG_MEMBER_ID = 'memberId invalide ou manquant';
const MSG_CHECKOUT_ID = 'checkoutId invalide ou manquant';
const MSG_NOT_CONFIGURED = "Le paiement en ligne n'est pas configuré";
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CHECKOUT_ID_LENGTH = 128;

/**
 * Authorize a mutating action on behalf of a member's team.
 * Allows either an authenticated admin, or a caller who supplies the
 * correct team password for the member's team (same normalisation as when
 * the password was set).
 * @param {Request} request
 * @param {object} env
 * @param {object} member - Member row (must include team_id)
 * @param {object} body - Parsed request body (may contain teamPassword)
 * @returns {Promise<boolean>}
 */
async function authorizeMemberAction(request, env, member, body) {
  if (await verifyAdminToken(request, env)) {
    return true;
  }

  const password = typeof body.teamPassword === 'string' ? normalizeTeamPassword(body.teamPassword) : '';
  if (!password) {
    return false;
  }

  const team = await db.getTeamById(env.DB, member.team_id);
  if (!team) {
    return false;
  }

  return verifyPassword(password, team.password_hash);
}

/**
 * Read an integer setting; the fallback is used when it is missing or corrupt.
 * @returns {Promise<number>}
 */
async function readIntSetting(database, key, fallback) {
  const parsed = Number.parseInt(await settingsDb.getSetting(database, key), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Pricing configuration: deadline, tier cut-off and the two online prices.
 */
async function loadPricingConfig(database) {
  return {
    registrationDeadline: await settingsDb.getSetting(database, 'registration_deadline'),
    tierCutoffDays: await readIntSetting(database, 'tier1_cutoff_days', DEFAULT_TIER1_CUTOFF_DAYS),
    tier1Price: await readIntSetting(database, 'price_tier1', DEFAULT_PRICES.tier1),
    tier2Price: await readIntSetting(database, 'price_tier2', DEFAULT_PRICES.tier2)
  };
}

/**
 * Validate a checkout id taken from a request body.
 * @param {unknown} value
 * @returns {string|null}
 */
function parseCheckoutId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_CHECKOUT_ID_LENGTH ? value : null;
}

/**
 * POST /api/payment/checkout - Create SumUp checkout for a member
 */
export async function createCheckout(request, env) {
  try {
    const { data: body, response } = await readBody(request);
    if (response) return response;

    const memberId = parsePositiveId(body.memberId);
    if (memberId === null) return invalidId(MSG_MEMBER_ID);

    // Verify member exists and payment is pending
    const member = await db.getMemberById(env.DB, memberId);
    if (!member) {
      return notFound(MSG_MEMBER_NOT_FOUND);
    }

    if (!await authorizeMemberAction(request, env, member, body)) {
      return forbidden(MSG_TEAM_AUTH);
    }

    if (member.payment_status !== PAYMENT_STATUS.PENDING && member.payment_status !== PAYMENT_STATUS.UNPAID) {
      return badRequest(`Statut de paiement invalide : ${member.payment_status}`, 'invalid_payment_status');
    }

    // Check if payment is enabled
    const paymentEnabled = await settingsDb.getSetting(env.DB, 'payment_enabled');
    if (paymentEnabled !== 'true') {
      return badRequest('Le paiement en ligne est actuellement désactivé', 'payment_disabled');
    }

    // Get pricing configuration
    const { registrationDeadline, tierCutoffDays, tier1Price, tier2Price } = await loadPricingConfig(env.DB);

    // Calculate tier and price
    const tier = member.registration_tier || calculateTier(registrationDeadline, tierCutoffDays);
    const priceConfig = { tier1: tier1Price, tier2: tier2Price };
    const priceCents = getPrice(tier, priceConfig);
    const priceEuros = priceCents / 100;

    // Check for SumUp credentials
    if (!env.SUMUP_API_KEY) {
      return serverError('SumUp API key not configured', null, MSG_NOT_CONFIGURED);
    }
    if (!env.SUMUP_MERCHANT_CODE) {
      return serverError('SumUp merchant code not configured', null, MSG_NOT_CONFIGURED);
    }
    if (env.SUMUP_MERCHANT_CODE === 'PLACEHOLDER_MERCHANT_CODE') {
      return error(
        "Le paiement en ligne n'est pas encore configuré pour cet environnement",
        503,
        'payment_unavailable'
      );
    }

    // Create SumUp checkout
    const sumup = new SumUpClient(env.SUMUP_API_KEY);
    const checkoutReference = generateCheckoutReference(memberId, 'ndi');

    const siteUrl = env.SITE_URL || 'https://asso.info-evry.fr/nuit-de-linfo';

    const checkout = await sumup.createCheckout({
      checkout_reference: checkoutReference,
      amount: priceEuros,
      currency: 'EUR',
      merchant_code: env.SUMUP_MERCHANT_CODE,
      description: `NDI - ${member.first_name} ${member.last_name}`,
      return_url: `${siteUrl}/api/payment/callback`,
      redirect_url: `${siteUrl}?payment=success`
    });

    // Update member with checkout info
    await paymentsDb.updateMemberPayment(env.DB, memberId, {
      checkout_id: checkout.id,
      payment_status: PAYMENT_STATUS.PENDING,
      payment_method: 'online',
      registration_tier: tier
    });

    // Log payment event
    await paymentsDb.logPaymentEvent(env.DB, {
      member_id: memberId,
      checkout_id: checkout.id,
      event_type: 'checkout_created',
      amount: priceCents,
      tier,
      metadata: { checkout_reference: checkoutReference }
    });

    return json({
      checkoutId: checkout.id,
      amount: priceCents,
      amountFormatted: `${priceEuros.toFixed(2)} €`,
      tier,
      reference: checkoutReference
    });
  } catch (error_) {
    return serverError('Error creating checkout:', error_, 'Impossible de créer le paiement');
  }
}

/**
 * POST /api/payment/verify - Verify payment completion
 */
export async function verifyPayment(request, env) {
  try {
    const { data: body, response } = await readBody(request);
    if (response) return response;

    const checkoutId = parseCheckoutId(body.checkoutId);
    if (checkoutId === null) return badRequest(MSG_CHECKOUT_ID, 'invalid_checkout_id');

    // Find member by checkout ID
    const member = await paymentsDb.getMemberByCheckoutId(env.DB, checkoutId);
    if (!member) {
      return notFound('Aucun membre pour ce paiement');
    }

    // Require admin or team password before revealing anything about the
    // payment status of this member.
    if (!await authorizeMemberAction(request, env, member, body)) {
      return forbidden(MSG_TEAM_AUTH);
    }

    // Get checkout status from SumUp
    if (!env.SUMUP_API_KEY) {
      return serverError('SumUp API key not configured', null, MSG_NOT_CONFIGURED);
    }

    const sumup = new SumUpClient(env.SUMUP_API_KEY);
    const rawCheckout = await sumup.getCheckout(checkoutId);
    const checkout = parseCheckoutResponse(rawCheckout);

    if (checkout.isPaid) {
      // Payment successful - update member
      await paymentsDb.updateMemberPayment(env.DB, member.id, {
        payment_status: PAYMENT_STATUS.PAID,
        payment_amount: checkout.amountCents,
        payment_confirmed_at: new Date().toISOString(),
        transaction_id: checkout.transactionId,
        payment_tier: member.registration_tier
      });

      // Log payment event
      await paymentsDb.logPaymentEvent(env.DB, {
        member_id: member.id,
        checkout_id: checkoutId,
        event_type: 'payment_completed',
        amount: checkout.amountCents,
        tier: member.registration_tier,
        metadata: { transaction_id: checkout.transactionId }
      });

      return json({
        success: true,
        status: 'paid',
        amount: checkout.amountCents,
        transactionId: checkout.transactionId
      });
    }

    if (checkout.isFailed) {
      // Payment failed
      await paymentsDb.logPaymentEvent(env.DB, {
        member_id: member.id,
        checkout_id: checkoutId,
        event_type: 'payment_failed',
        amount: checkout.amountCents,
        tier: member.registration_tier
      });

      return json({
        success: false,
        status: 'failed',
        error: 'Payment failed'
      });
    }

    if (checkout.isExpired) {
      return json({
        success: false,
        status: 'expired',
        error: 'Checkout expired'
      });
    }

    // Still pending
    return json({
      success: false,
      status: 'pending',
      message: 'Payment not yet completed'
    });
  } catch (error_) {
    return serverError('Error verifying payment:', error_, 'Impossible de vérifier le paiement');
  }
}

/**
 * POST /api/payment/delayed - Mark payment as delayed (pay at event)
 */
export async function markPaymentDelayed(request, env) {
  try {
    const { data: body, response } = await readBody(request);
    if (response) return response;

    const memberId = parsePositiveId(body.memberId);
    if (memberId === null) return invalidId(MSG_MEMBER_ID);

    // Verify member exists
    const member = await db.getMemberById(env.DB, memberId);
    if (!member) {
      return notFound(MSG_MEMBER_NOT_FOUND);
    }

    if (!await authorizeMemberAction(request, env, member, body)) {
      return forbidden(MSG_TEAM_AUTH);
    }

    if (member.payment_status === PAYMENT_STATUS.PAID) {
      return error('Ce membre a déjà payé', 409, 'already_paid');
    }

    // Get pricing tier for the member
    const { registrationDeadline, tierCutoffDays } = await loadPricingConfig(env.DB);
    const tier = calculateTier(registrationDeadline, tierCutoffDays);

    // Update member
    await paymentsDb.updateMemberPayment(env.DB, memberId, {
      payment_status: PAYMENT_STATUS.DELAYED,
      payment_method: 'on_site',
      registration_tier: tier
    });

    // Log payment event
    await paymentsDb.logPaymentEvent(env.DB, {
      member_id: memberId,
      event_type: 'payment_delayed',
      amount: 0,
      tier
    });

    return json({
      success: true,
      status: 'delayed',
      tier
    });
  } catch (error_) {
    return serverError('Error marking payment delayed:', error_, 'Impossible de différer le paiement');
  }
}

/**
 * GET /api/payment/pricing - Get current pricing information
 */
export async function getPricing(request, env) {
  try {
    // Get pricing configuration
    const { registrationDeadline, tierCutoffDays, tier1Price, tier2Price } = await loadPricingConfig(env.DB);
    const paymentEnabled = await settingsDb.getSetting(env.DB, 'payment_enabled');

    // Calculate current tier
    const currentTier = calculateTier(registrationDeadline, tierCutoffDays);
    const priceConfig = { tier1: tier1Price, tier2: tier2Price };
    const currentPrice = getPrice(currentTier, priceConfig);

    // Calculate days until deadline
    let daysUntilDeadline = null;
    if (registrationDeadline) {
      const deadline = new Date(registrationDeadline);
      const days = Math.floor((deadline.getTime() - Date.now()) / DAY_MS);
      daysUntilDeadline = Number.isNaN(days) ? null : days;
    }

    return json({
      enabled: paymentEnabled === 'true',
      currentTier,
      currentPrice,
      currentPriceFormatted: `${(currentPrice / 100).toFixed(2)} €`,
      tier1: {
        price: tier1Price,
        priceFormatted: `${(tier1Price / 100).toFixed(2)} €`,
        label: 'Inscription anticipée'
      },
      tier2: {
        price: tier2Price,
        priceFormatted: `${(tier2Price / 100).toFixed(2)} €`,
        label: 'Inscription standard'
      },
      tierCutoffDays,
      registrationDeadline,
      daysUntilDeadline
    });
  } catch (error_) {
    return serverError('Error getting pricing:', error_, 'Impossible de charger les tarifs');
  }
}

/**
 * POST /api/payment/callback - SumUp webhook callback
 * This is called by SumUp when payment status changes.
 *
 * A body that is not a JSON object is a 400. Once the body is understood the
 * webhook is always acknowledged with 200 (SumUp must not retry forever); a
 * processing failure is logged server-side and reported as `processed: false`,
 * never with its message.
 */
export async function paymentCallback(request, env) {
  const { data: body, response } = await readBody(request);
  if (response) return response;

  try {
    // SumUp sends checkout_reference and status
    const { checkout_reference, id } = body;
    const checkoutId = parseCheckoutId(id);

    if (!checkout_reference && !checkoutId) {
      return json({ received: true }); // Acknowledge but ignore
    }

    // Find member by checkout ID
    let member;
    if (checkoutId) {
      member = await paymentsDb.getMemberByCheckoutId(env.DB, checkoutId);
    }

    if (!member) {
      console.log('Payment callback: member not found', { checkout_reference, checkoutId });
      return json({ received: true }); // Acknowledge but ignore
    }

    // Verify with SumUp API - never mutate the DB unless we can actually
    // verify the payment status with SumUp.
    if (!env.SUMUP_API_KEY) {
      console.warn('Payment callback: SUMUP_API_KEY not configured, ignoring callback');
      return json({ received: true, processed: false });
    }

    const sumup = new SumUpClient(env.SUMUP_API_KEY);
    const rawCheckout = await sumup.getCheckout(checkoutId);
    const checkout = parseCheckoutResponse(rawCheckout);

    if (checkout.isPaid && member.payment_status !== PAYMENT_STATUS.PAID) {
      // Update member
      await paymentsDb.updateMemberPayment(env.DB, member.id, {
        payment_status: PAYMENT_STATUS.PAID,
        payment_amount: checkout.amountCents,
        payment_confirmed_at: new Date().toISOString(),
        transaction_id: checkout.transactionId,
        payment_tier: member.registration_tier
      });

      // Log payment event
      await paymentsDb.logPaymentEvent(env.DB, {
        member_id: member.id,
        checkout_id: checkoutId,
        event_type: 'payment_completed',
        amount: checkout.amountCents,
        tier: member.registration_tier,
        metadata: { source: 'webhook', transaction_id: checkout.transactionId }
      });
    }

    return json({ received: true, processed: true });
  } catch (error_) {
    console.error('Error processing payment callback:', error_);
    return json({ received: true, processed: false });
  }
}
