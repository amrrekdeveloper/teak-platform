#!/bin/bash
set -e

npm install

# Apply idempotent site-survey migration (safe to re-run; all IF NOT EXISTS).
node -e "
const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = fs.readFileSync('scripts/migrations/task13_site_survey_spaces.sql', 'utf8');
pool.query(sql).then(() => { console.log('Migration applied'); pool.end(); }).catch(e => { console.error('Migration error:', e.message); pool.end(); process.exit(1); });
"

# NOTE: We intentionally do NOT run `drizzle-kit push` here.
# This project syncs its schema through idempotent startup migrations in
# server/routes.ts that run on every app boot (the workflow restarts after a
# merge). `drizzle-kit push` is interactive and, because several tables
# (e.g. user_sessions for connect-pg-simple, employee_otp_codes) and columns
# are created via raw SQL rather than the Drizzle schema, push reports them as
# "data loss" drift and either hangs waiting for input (stdin is closed in
# post-merge) or, if forced, would DROP those tables and break authentication.
# Schema additions are handled by the startup migrations instead.
