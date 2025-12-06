-- Payment Tracking Migration
-- Adds columns to track payment tier and amount when checking in participants

-- Add payment tracking columns to members table
ALTER TABLE members ADD COLUMN payment_tier TEXT DEFAULT NULL;
ALTER TABLE members ADD COLUMN payment_amount INTEGER DEFAULT NULL;
ALTER TABLE members ADD COLUMN payment_confirmed_at TEXT DEFAULT NULL;

-- Index for efficient filtering by payment status
CREATE INDEX IF NOT EXISTS idx_members_payment_tier ON members(payment_tier);
