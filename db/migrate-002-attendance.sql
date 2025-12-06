-- Migration: Add attendance tracking to members table
-- Adds checked_in status and timestamp for event day attendance management

-- Add checked_in column (0 = not checked in, 1 = checked in)
ALTER TABLE members ADD COLUMN checked_in INTEGER DEFAULT 0;

-- Add timestamp for when the person was checked in
ALTER TABLE members ADD COLUMN checked_in_at TEXT DEFAULT NULL;

-- Add index for quick attendance queries
CREATE INDEX IF NOT EXISTS idx_members_checked_in ON members(checked_in);
