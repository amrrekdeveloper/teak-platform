#!/bin/bash
set -e
npm install
# Run schema migrations
node -e "
const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = fs.readFileSync('scripts/migrations/task13_site_survey_spaces.sql', 'utf8');
pool.query(sql).then(() => { console.log('Migration applied'); pool.end(); }).catch(e => { console.error('Migration error:', e.message); pool.end(); process.exit(1); });
"
npm run db:push
