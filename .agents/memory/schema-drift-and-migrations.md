---
name: Schema drift and Publish migrations
description: Managed production schema changes must use Publish; preserve runtime tables and handle new catalog data separately.
---

# Schema sync strategy

This repo has real schema drift between `shared/schema.ts` and the actual Postgres DB: tables/enums defined in Drizzle have at times never existed in the live DB (e.g. the `fiscal_years` table + its `calendar_type`/`fiscal_year_status` enums were absent, which silently broke "save fiscal year").

**Rule:** change the schema source of truth and development database, then let the user apply production schema changes through Publish. Do not add startup DDL, deploy hooks, or production migration scripts.

**Why:** Publish validates the development-to-production schema diff before the new application starts. Startup repair cannot rescue a failed constraint validation, and schema publication does not copy development catalog rows.

**How to apply:** inspect both schemas and read-only production data, apply approved development-only changes, and recompute the Publish diff. Preserve production runtime tables in development even if an idle worker has not created them there. A new populated lookup relationship may need staged releases; never assume development seed data reaches production.

**Columns with defaults + drizzle-zod:** a NOT NULL column with `.default('')` (e.g. `employees.full_name_ar`) becomes optional in the generated insert schema, so the API can persist an empty string. If a field must be non-blank, add an explicit backend guard in the POST/PATCH route — schema validation alone won't enforce it.

**Custom JSONB shapes may need explicit insert-schema refinements.**

**Why:** The installed drizzle-zod inference can turn an optional typed JSON property into `unknown`, making a validated insert/update incompatible with the Drizzle column's custom type.

**How to apply:** Give the affected JSON field an explicit matching Zod refinement, preserving nullable/optional behavior and validating known fields. Do not hide the mismatch with unchecked casts or global type suppression.

**Do not run broad unattended `db:push` against this incomplete schema.** Several live session and employee-auth tables originate in legacy raw SQL and are not declared in `shared/schema.ts`; blindly pushing can propose deleting them. Review the actual diff and preserve them. Build must only produce the bundle, and production schema changes belong to Publish.

**Drizzle constraint-name drift:** inline `UNIQUE` in a `CREATE TABLE` gets Postgres's default name `<table>_<col>_key`, but Drizzle's `.unique()` expects `<table>_<col>_unique`. Same constraint, different name → push keeps wanting to "add" it and prompts forever. Fix non-destructively with `ALTER TABLE x RENAME CONSTRAINT x_col_key TO x_col_unique;` (no truncation).

**`ALTER TYPE ... ADD VALUE` must be its own statement.** Adding an enum value cannot run inside a multi-DDL `db.execute` batch/transaction with other statements — Postgres errors. Run it alone in its own `db.execute`, wrapped in try/catch, separate from any `ALTER TABLE ADD COLUMN` block.

**Enum filters must respect the actual stored enum vocabulary, including negative filters.**

**Why:** A `NOT IN` exclusion containing an unsupported status still makes PostgreSQL cast that literal to the enum and fail, even if no row has that status. Mocked database tests can miss this.

**How to apply:** Use only supported enum literals, or an explicit text comparison when interoperating with differing legacy status vocabularies. Exercise new request writes against isolated real PostgreSQL fixtures as well as mocks.

**`getCompanySettings()` selects every `company_settings` column,** so any declared column missing from the live table makes it throw `column ... does not exist` across finance paths. Keep the development schema aligned and have the user publish its schema changes before relying on new fields in production.
