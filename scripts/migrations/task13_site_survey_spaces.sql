-- Task #13: Site Survey Restructure
-- Idempotent migration (safe to run multiple times)

-- Add spaces JSONB column to site_surveys table
ALTER TABLE site_surveys ADD COLUMN IF NOT EXISTS spaces jsonb;

-- Add missing columns that Drizzle schema expects but DB was missing
ALTER TABLE site_surveys ADD COLUMN IF NOT EXISTS doors_count integer;
ALTER TABLE site_surveys ADD COLUMN IF NOT EXISTS windows_count integer;
ALTER TABLE site_surveys ADD COLUMN IF NOT EXISTS door_details jsonb;
ALTER TABLE site_surveys ADD COLUMN IF NOT EXISTS window_details jsonb;
ALTER TABLE site_surveys ADD COLUMN IF NOT EXISTS drainage_points jsonb;
ALTER TABLE site_surveys ADD COLUMN IF NOT EXISTS obstacles text;
ALTER TABLE site_surveys ADD COLUMN IF NOT EXISTS photos text[];
ALTER TABLE site_surveys ADD COLUMN IF NOT EXISTS created_by integer;

-- Make sales_person_id nullable only if it exists and has a NOT NULL constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'site_surveys'
      AND column_name = 'sales_person_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE site_surveys ALTER COLUMN sales_person_id DROP NOT NULL;
  END IF;
END $$;
