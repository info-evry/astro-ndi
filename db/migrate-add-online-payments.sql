-- Online Payments Migration
-- Adds SumUp payment integration support

-- Extend members table with online payment tracking
-- payment_status: 'unpaid', 'pending', 'paid', 'delayed', 'refunded'
ALTER TABLE members ADD COLUMN payment_status TEXT DEFAULT 'unpaid';

-- payment_method: 'online' (SumUp), 'on_site' (cash/card at event), NULL (legacy)
ALTER TABLE members ADD COLUMN payment_method TEXT DEFAULT NULL;

-- SumUp checkout ID for payment verification
ALTER TABLE members ADD COLUMN checkout_id TEXT DEFAULT NULL;

-- SumUp transaction ID after successful payment
ALTER TABLE members ADD COLUMN transaction_id TEXT DEFAULT NULL;

-- registration_tier: 'tier1' (early bird), 'tier2' (late registration)
-- This is the pricing tier at time of registration, separate from payment_tier
ALTER TABLE members ADD COLUMN registration_tier TEXT DEFAULT NULL;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_members_payment_status ON members(payment_status);
CREATE INDEX IF NOT EXISTS idx_members_checkout_id ON members(checkout_id);
CREATE INDEX IF NOT EXISTS idx_members_registration_tier ON members(registration_tier);

-- Payment events audit table for tracking payment lifecycle
CREATE TABLE IF NOT EXISTS payment_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    checkout_id TEXT,
    event_type TEXT NOT NULL,
    -- event_type values:
    -- 'checkout_created': SumUp checkout was created
    -- 'payment_pending': Payment is being processed
    -- 'payment_completed': Payment was successful
    -- 'payment_failed': Payment failed
    -- 'payment_delayed': User chose to pay at event
    -- 'refunded': Payment was refunded
    amount INTEGER NOT NULL,           -- Amount in cents
    tier TEXT NOT NULL,                -- 'tier1' or 'tier2'
    metadata TEXT,                     -- JSON for additional data
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payment_events_member_id ON payment_events(member_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_checkout_id ON payment_events(checkout_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_event_type ON payment_events(event_type);

-- Insert default payment settings (if not already present)
INSERT OR IGNORE INTO settings (key, value) VALUES ('price_tier1', '500');
INSERT OR IGNORE INTO settings (key, value) VALUES ('price_tier2', '700');
INSERT OR IGNORE INTO settings (key, value) VALUES ('tier1_cutoff_days', '7');
INSERT OR IGNORE INTO settings (key, value) VALUES ('payment_enabled', 'false');
INSERT OR IGNORE INTO settings (key, value) VALUES ('registration_deadline', '');
