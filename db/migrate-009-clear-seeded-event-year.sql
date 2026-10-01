-- Migration 009: drop the stale seeded `event_year` setting.
--
-- migrate-008 seeded ('event_year', '2024') and nothing in the application
-- ever writes that key, so an existing row is always the seed. Because
-- `detectEventYear` prefers the setting, every archive was labelled 2024
-- (and a second archive would have collided with the first). Without the row
-- the edition defaults to the most recent NDI that has started.
--
-- Only the untouched seed is removed: a row with another value or another
-- description was written deliberately and is kept.
DELETE FROM settings
WHERE key = 'event_year'
  AND value = '2024'
  AND description = 'Current event year for the NDI event';
