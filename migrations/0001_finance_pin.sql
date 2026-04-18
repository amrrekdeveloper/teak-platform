-- Migration: Add finance_pin column to users table
-- Purpose: Supports the finance quick-login portal (/finance-login)
-- Accountants use phone + PIN instead of username + password
-- The PIN is intentionally stored in plain text (displayed back to the user in the lookup flow)

ALTER TABLE users ADD COLUMN IF NOT EXISTS finance_pin TEXT;

-- Initialize default PIN "1400" for existing accountant accounts
UPDATE users SET finance_pin = '1400' WHERE finance_pin IS NULL AND role = 'accountant';
