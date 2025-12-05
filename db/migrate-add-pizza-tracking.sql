-- Pizza Distribution Tracking Migration
-- Adds columns to track whether participants have received their pizza

-- Add pizza distribution tracking columns to members table
ALTER TABLE members ADD COLUMN pizza_received INTEGER DEFAULT 0;
ALTER TABLE members ADD COLUMN pizza_received_at TEXT DEFAULT NULL;

-- Index for efficient filtering by pizza status
CREATE INDEX IF NOT EXISTS idx_members_pizza_received ON members(pizza_received);
