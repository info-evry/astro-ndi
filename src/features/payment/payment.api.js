/**
 * Payment API handlers
 * Handles SumUp checkout creation and payment verification
 */

import { json, error } from '../../shared/response.js';
import * as paymentsDb from '../../database/db.payments.js';
import * as membersDb from '../../database/db.members.js';
import * as settingsDb from '../../database/db.settings.js';
import {
  SumUpClient,
  generateCheckoutReference,
  parseCheckoutResponse,
  calculateTier,
  getPrice
} from 'astro-payments';

/**
 * POST /api/payment/checkout - Create SumUp checkout for a member
 */
export async function createCheckout(request, env) {
  try {
    const { memberId } = await request.json();

    if (!memberId) {
      return error('memberId is required', 400);
    }

    // Verify member exists and payment is pending
    const member = await membersDb.getMemberById(env.DB, memberId);
    if (!member) {
      return error('Member not found', 404);
    }

    if (member.payment_status !== 'pending' && member.payment_status !== 'unpaid') {
      return error(`Invalid payment status: ${member.payment_status}`, 400);
    }

    // Check if payment is enabled
    const paymentEnabled = await settingsDb.getSetting(env.DB, 'payment_enabled');
    if (paymentEnabled !== 'true') {
      return error('Online payments are currently disabled', 400);
    }

    // Get pricing configuration
    const registrationDeadline = await settingsDb.getSetting(env.DB, 'registration_deadline');
    const tierCutoffDays = Number.parseInt(await settingsDb.getSetting(env.DB, 'tier1_cutoff_days') || '7', 10);
    const tier1Price = Number.parseInt(await settingsDb.getSetting(env.DB, 'price_tier1') || '500', 10);
    const tier2Price = Number.parseInt(await settingsDb.getSetting(env.DB, 'price_tier2') || '700', 10);

    // Calculate tier and price
    const tier = member.registration_tier || calculateTier(registrationDeadline, tierCutoffDays);
    const priceConfig = { tier1: tier1Price, tier2: tier2Price };
    const priceCents = getPrice(tier, priceConfig);
    const priceEuros = priceCents / 100;

    // Check for SumUp credentials
    if (!env.SUMUP_API_KEY) {
      return error('SumUp API key not configured', 500);
    }
    if (!env.SUMUP_MERCHANT_CODE) {
      return error('SumUp merchant code not configured', 500);
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
      payment_status: 'pending',
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
    console.error('Error creating checkout:', error_);
    return error(error_.message || 'Failed to create checkout', 500);
  }
}

/**
 * POST /api/payment/verify - Verify payment completion
 */
export async function verifyPayment(request, env) {
  try {
    const { checkoutId } = await request.json();

    if (!checkoutId) {
      return error('checkoutId is required', 400);
    }

    // Find member by checkout ID
    const member = await paymentsDb.getMemberByCheckoutId(env.DB, checkoutId);
    if (!member) {
      return error('Member not found for checkout', 404);
    }

    // Get checkout status from SumUp
    if (!env.SUMUP_API_KEY) {
      return error('SumUp API key not configured', 500);
    }

    const sumup = new SumUpClient(env.SUMUP_API_KEY);
    const rawCheckout = await sumup.getCheckout(checkoutId);
    const checkout = parseCheckoutResponse(rawCheckout);

    if (checkout.isPaid) {
      // Payment successful - update member
      await paymentsDb.updateMemberPayment(env.DB, member.id, {
        payment_status: 'paid',
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
    console.error('Error verifying payment:', error_);
    return error(error_.message || 'Failed to verify payment', 500);
  }
}

/**
 * POST /api/payment/delayed - Mark payment as delayed (pay at event)
 */
export async function markPaymentDelayed(request, env) {
  try {
    const { memberId } = await request.json();

    if (!memberId) {
      return error('memberId is required', 400);
    }

    // Verify member exists
    const member = await membersDb.getMemberById(env.DB, memberId);
    if (!member) {
      return error('Member not found', 404);
    }

    // Get pricing tier for the member
    const registrationDeadline = await settingsDb.getSetting(env.DB, 'registration_deadline');
    const tierCutoffDays = Number.parseInt(await settingsDb.getSetting(env.DB, 'tier1_cutoff_days') || '7', 10);
    const tier = calculateTier(registrationDeadline, tierCutoffDays);

    // Update member
    await paymentsDb.updateMemberPayment(env.DB, memberId, {
      payment_status: 'delayed',
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
    console.error('Error marking payment delayed:', error_);
    return error(error_.message || 'Failed to mark payment delayed', 500);
  }
}

/**
 * GET /api/payment/pricing - Get current pricing information
 */
export async function getPricing(request, env) {
  try {
    // Get pricing configuration
    const registrationDeadline = await settingsDb.getSetting(env.DB, 'registration_deadline');
    const tierCutoffDays = Number.parseInt(await settingsDb.getSetting(env.DB, 'tier1_cutoff_days') || '7', 10);
    const tier1Price = Number.parseInt(await settingsDb.getSetting(env.DB, 'price_tier1') || '500', 10);
    const tier2Price = Number.parseInt(await settingsDb.getSetting(env.DB, 'price_tier2') || '700', 10);
    const paymentEnabled = await settingsDb.getSetting(env.DB, 'payment_enabled');

    // Calculate current tier
    const currentTier = calculateTier(registrationDeadline, tierCutoffDays);
    const priceConfig = { tier1: tier1Price, tier2: tier2Price };
    const currentPrice = getPrice(currentTier, priceConfig);

    // Calculate days until deadline
    let daysUntilDeadline = null;
    if (registrationDeadline) {
      const deadline = new Date(registrationDeadline);
      const now = new Date();
      daysUntilDeadline = Math.floor((deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
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
    console.error('Error getting pricing:', error_);
    return error(error_.message || 'Failed to get pricing', 500);
  }
}

/**
 * POST /api/payment/callback - SumUp webhook callback
 * This is called by SumUp when payment status changes
 */
export async function paymentCallback(request, env) {
  try {
    const body = await request.json();

    // SumUp sends checkout_reference and status
    const { checkout_reference, id: checkoutId } = body;

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

    // Verify with SumUp API
    if (env.SUMUP_API_KEY) {
      const sumup = new SumUpClient(env.SUMUP_API_KEY);
      const rawCheckout = await sumup.getCheckout(checkoutId);
      const checkout = parseCheckoutResponse(rawCheckout);

      if (checkout.isPaid && member.payment_status !== 'paid') {
        // Update member
        await paymentsDb.updateMemberPayment(env.DB, member.id, {
          payment_status: 'paid',
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
    }

    return json({ received: true, processed: true });
  } catch (error_) {
    console.error('Error processing payment callback:', error_);
    return json({ received: true, error: error_.message });
  }
}
