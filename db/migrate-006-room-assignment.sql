-- Migration: Add room assignment to teams table
-- Allows assigning teams to specific rooms during the event

-- Add room column to teams table (nullable text field for room name/number)
ALTER TABLE teams ADD COLUMN room TEXT DEFAULT NULL;

-- Add index for quick room queries
CREATE INDEX IF NOT EXISTS idx_teams_room ON teams(room);
