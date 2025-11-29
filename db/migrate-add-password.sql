-- Migration: Add password_hash column to teams table
ALTER TABLE teams ADD COLUMN password_hash TEXT DEFAULT '';
