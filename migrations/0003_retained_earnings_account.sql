-- Migration: Add retained_earnings_account_code to company_settings
-- Purpose: Allow accountants to configure which account code is used for retained earnings
-- instead of hardcoding "3200" in the year-end close route.

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS retained_earnings_account_code TEXT NOT NULL DEFAULT '3200';
