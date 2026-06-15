---
name: Schema drift & startup migrations
description: Why this repo syncs schema via idempotent startup migrations in server/routes.ts instead of db:push.
---

# Schema sync strategy

This repo has real schema drift between `shared/schema.ts` and the actual Postgres DB: tables/enums defined in Drizzle have at times never existed in the live DB (e.g. the `fiscal_years` table + its `calendar_type`/`fiscal_year_status` enums were absent, which silently broke "save fiscal year").

**Rule:** sync schema with idempotent startup migrations (raw SQL with `CREATE TABLE/TYPE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, repeatable backfills) placed in `server/routes.ts`, grouped by module (HR migration block, Finance migration block run before `seedChartOfAccounts`). On boot the logs print e.g. `Finance module migration completed`.

**Why:** `npm run db:push` is interactive — it prompts create-vs-rename for new tables and `--force` does NOT bypass that prompt, so it cannot be relied on for unattended dev/prod sync. Startup migrations run automatically on every deploy, so production self-heals on publish without manual DB steps.

**How to apply:** when adding a new table/column, (1) add it to `shared/schema.ts`, (2) apply it to dev DB directly (raw SQL via the executeSql sandbox callback), and (3) add a matching `IF NOT EXISTS` block to the relevant startup migration in routes.ts so prod gets it on deploy. Verify with a workflow restart and check the migration-completed log line.

**Columns with defaults + drizzle-zod:** a NOT NULL column with `.default('')` (e.g. `employees.full_name_ar`) becomes optional in the generated insert schema, so the API can persist an empty string. If a field must be non-blank, add an explicit backend guard in the POST/PATCH route — schema validation alone won't enforce it.

**Never put `db:push` in `scripts/post-merge.sh`.** It runs unattended (stdin closed) so any drift prompt makes it hang to timeout or abort — merges flakily fail. Worse, several live tables are created by raw SQL and are NOT in `shared/schema.ts` (e.g. `user_sessions` for connect-pg-simple, `employee_otp_codes`), so push reports them as "data loss" and `--force` would DROP them and break auth. Post-merge should only `npm install` + run idempotent SQL; schema deltas arrive via the startup migrations on workflow restart.

**Drizzle constraint-name drift:** inline `UNIQUE` in a `CREATE TABLE` gets Postgres's default name `<table>_<col>_key`, but Drizzle's `.unique()` expects `<table>_<col>_unique`. Same constraint, different name → push keeps wanting to "add" it and prompts forever. Fix non-destructively with `ALTER TABLE x RENAME CONSTRAINT x_col_key TO x_col_unique;` (no truncation).

**`ALTER TYPE ... ADD VALUE` must be its own statement.** Adding an enum value cannot run inside a multi-DDL `db.execute` batch/transaction with other statements — Postgres errors. Run it alone in its own `db.execute`, wrapped in try/catch, separate from any `ALTER TABLE ADD COLUMN` block.

**`getCompanySettings()` selects every `company_settings` column,** so any column declared in `shared/schema.ts` but missing from the live table makes it throw `column ... does not exist` — and it's called by many finance paths. When you add a `companySettings` field, add the matching `ADD COLUMN IF NOT EXISTS` startup migration in the same change or unrelated features break.
