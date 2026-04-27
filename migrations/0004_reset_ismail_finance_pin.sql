-- Migration: Reset ismail's finance_pin to NULL
-- Purpose: ismail's finance_pin was changed to a non-default value ('Omial3azeeza')
--          which prevented login. Resetting to NULL causes the system to fall back
--          to the default PIN "1400" per the logic in /api/finance-auth/login:
--            const expectedPin = user.financePin || "1400";
--
-- Context (Task #106): Finance login phone normalization fix (2026-04-27)
-- This is a one-time data remediation. Run against production after deploying the
-- code changes from this task.
--
-- Verification query (run after applying):
--   SELECT username, finance_pin FROM users WHERE username = 'ismail';
--   -- Expected: finance_pin = NULL
--
-- Rollback (if needed):
--   UPDATE users SET finance_pin = '1400' WHERE username = 'ismail';

UPDATE users SET finance_pin = NULL WHERE username = 'ismail' AND role = 'accountant';
