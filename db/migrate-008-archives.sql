-- Migration 008: Archives table for yearly event snapshots
-- Supports GDPR-compliant data retention with automatic expiration

-- Archives table for storing yearly event snapshots
CREATE TABLE IF NOT EXISTS archives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_year INTEGER NOT NULL UNIQUE,
    archived_at TEXT NOT NULL DEFAULT (datetime('now')),
    expiration_date TEXT NOT NULL,
    is_expired INTEGER DEFAULT 0,
    
    -- Archived data as JSON (immutable after creation)
    teams_json TEXT NOT NULL,
    members_json TEXT NOT NULL,
    payment_events_json TEXT,
    
    -- Summary statistics (always available, even after expiration)
    stats_json TEXT NOT NULL,
    
    -- Metadata
    total_teams INTEGER NOT NULL,
    total_participants INTEGER NOT NULL,
    total_revenue INTEGER DEFAULT 0,
    
    -- Integrity hash (SHA-256 of concatenated JSON data)
    data_hash TEXT NOT NULL
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_archives_year ON archives(event_year);
CREATE INDEX IF NOT EXISTS idx_archives_expired ON archives(is_expired);

-- NOTE: no `event_year` seed here any more. It used to be seeded with the
-- stale value '2024', which pinned every archive to 2024 (see migrate-009).
-- Without the setting the edition is derived from the NDI date; an admin can
-- still set it explicitly.

-- Add GDPR retention period setting
INSERT OR IGNORE INTO settings (key, value, description) VALUES
    ('gdpr_retention_years', '3', 'Years to retain personal data before automatic anonymization');
