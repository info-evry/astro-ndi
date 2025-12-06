/**
 * Payment database operations
 * Handles online payment tracking and checkout management
 */

/**
 * Update member payment information
 * @param {D1Database} db
 * @param {number} memberId
 * @param {object} paymentData
 * @returns {Promise<boolean>}
 */
export async function updateMemberPayment(db, memberId, paymentData) {
  const fields = [];
  const values = [];

  if (paymentData.payment_status !== undefined) {
    fields.push('payment_status = ?');
    values.push(paymentData.payment_status);
  }
  if (paymentData.payment_method !== undefined) {
    fields.push('payment_method = ?');
    values.push(paymentData.payment_method);
  }
  if (paymentData.checkout_id !== undefined) {
    fields.push('checkout_id = ?');
    values.push(paymentData.checkout_id);
  }
  if (paymentData.transaction_id !== undefined) {
    fields.push('transaction_id = ?');
    values.push(paymentData.transaction_id);
  }
  if (paymentData.registration_tier !== undefined) {
    fields.push('registration_tier = ?');
    values.push(paymentData.registration_tier);
  }
  if (paymentData.payment_amount !== undefined) {
    fields.push('payment_amount = ?');
    values.push(paymentData.payment_amount);
  }
  if (paymentData.payment_confirmed_at !== undefined) {
    fields.push('payment_confirmed_at = ?');
    values.push(paymentData.payment_confirmed_at);
  }
  if (paymentData.payment_tier !== undefined) {
    fields.push('payment_tier = ?');
    values.push(paymentData.payment_tier);
  }

  if (fields.length === 0) return false;

  values.push(memberId);
  await db.prepare(
    `UPDATE members SET ${fields.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  return true;
}

/**
 * Get member by checkout ID
 * @param {D1Database} db
 * @param {string} checkoutId
 * @returns {Promise<object|null>}
 */
export async function getMemberByCheckoutId(db, checkoutId) {
  return db.prepare(
    'SELECT * FROM members WHERE checkout_id = ?'
  ).bind(checkoutId).first();
}

/**
 * Get members pending payment verification
 * @param {D1Database} db
 * @returns {Promise<Array>}
 */
export async function getPendingPayments(db) {
  const result = await db.prepare(`
    SELECT m.*, t.name as team_name
    FROM members m
    JOIN teams t ON m.team_id = t.id
    WHERE m.payment_status = 'pending'
    ORDER BY m.created_at DESC
  `).all();
  return result.results;
}

/**
 * Get payment statistics
 * @param {D1Database} db
 * @returns {Promise<object>}
 */
export async function getPaymentStats(db) {
  const result = await db.prepare(`
    SELECT
      payment_status,
      COUNT(*) as count,
      SUM(CASE WHEN payment_amount IS NOT NULL THEN payment_amount ELSE 0 END) as total_amount
    FROM members
    GROUP BY payment_status
  `).all();

  const stats = {
    unpaid: { count: 0, amount: 0 },
    pending: { count: 0, amount: 0 },
    paid: { count: 0, amount: 0 },
    delayed: { count: 0, amount: 0 },
    refunded: { count: 0, amount: 0 }
  };

  for (const row of result.results) {
    if (row.payment_status && stats[row.payment_status]) {
      stats[row.payment_status] = {
        count: row.count,
        amount: row.total_amount || 0
      };
    }
  }

  return stats;
}

/**
 * Log a payment event
 * @param {D1Database} db
 * @param {object} event
 * @returns {Promise<number>} Event ID
 */
export async function logPaymentEvent(db, event) {
  const { member_id, checkout_id, event_type, amount, tier, metadata } = event;

  const result = await db.prepare(`
    INSERT INTO payment_events (member_id, checkout_id, event_type, amount, tier, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    member_id,
    checkout_id || null,
    event_type,
    amount,
    tier,
    metadata ? JSON.stringify(metadata) : null
  ).run();

  return result.meta.last_row_id;
}

/**
 * Get payment events for a member
 * @param {D1Database} db
 * @param {number} memberId
 * @returns {Promise<Array>}
 */
export async function getMemberPaymentEvents(db, memberId) {
  const result = await db.prepare(`
    SELECT * FROM payment_events
    WHERE member_id = ?
    ORDER BY created_at DESC
  `).bind(memberId).all();
  return result.results;
}

/**
 * Get payment events by checkout ID
 * @param {D1Database} db
 * @param {string} checkoutId
 * @returns {Promise<Array>}
 */
export async function getPaymentEventsByCheckout(db, checkoutId) {
  const result = await db.prepare(`
    SELECT * FROM payment_events
    WHERE checkout_id = ?
    ORDER BY created_at DESC
  `).bind(checkoutId).all();
  return result.results;
}

/**
 * Get all payment events (admin)
 * @param {D1Database} db
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function getAllPaymentEvents(db, limit = 100) {
  const result = await db.prepare(`
    SELECT pe.*, m.first_name, m.last_name, m.email
    FROM payment_events pe
    JOIN members m ON pe.member_id = m.id
    ORDER BY pe.created_at DESC
    LIMIT ?
  `).bind(limit).all();
  return result.results;
}

/**
 * Get members with payment info for attendance
 * @param {D1Database} db
 * @returns {Promise<Array>}
 */
export async function getMembersWithPaymentInfo(db) {
  const result = await db.prepare(`
    SELECT
      m.*,
      t.name as team_name,
      t.room_id
    FROM members m
    JOIN teams t ON m.team_id = t.id
    ORDER BY t.name, m.last_name, m.first_name
  `).all();
  return result.results;
}

/**
 * Check if payment_events table exists
 * @param {D1Database} db
 * @returns {Promise<boolean>}
 */
export async function paymentEventsTableExists(db) {
  try {
    await db.prepare("SELECT 1 FROM payment_events LIMIT 1").first();
    return true;
  } catch {
    return false;
  }
}
