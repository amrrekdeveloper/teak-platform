// Run PostgreSQL integration and unit tests in a disposable development schema.
import pg from "pg";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createIsolatedHrSchema, dropIsolatedHrSchema } from "./lib/isolated-hr-schema.mjs";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
let fixture;
try {
  await db.connect();
  fixture = await createIsolatedHrSchema(db);
  const env = { ...process.env, DATABASE_URL: fixture.connectionString, NODE_ENV: "test",
    SESSION_SECRET: randomBytes(32).toString("hex") };
  for (const key of ["TAQNYAT_API_KEY", "HR_READINESS_PASSWORD", "OPENAI_API_KEY", "FIREBASE_SERVICE_ACCOUNT_KEY",
    "TEAK_SYSTEM_ADMIN_PASSWORD", "TEAK_SYSTEM_ADMIN_RECOVERY_PASSWORD", "TEAK_SYSTEM_ADMIN_USERNAME"])
    delete env[key];
  // All files share this one disposable SQL schema, not a schema per worker.
  // Serialize files so their setup/cleanup cannot affect another suite's data;
  // Promise.all concurrency scenarios inside each test still run unchanged.
  const child = spawn("npx", ["vitest", "run", ...process.argv.slice(2), "--no-file-parallelism"], { env, stdio: "inherit" });
  process.exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", code => resolve(code ?? 1));
  });
} finally {
  if (fixture) await dropIsolatedHrSchema(db, fixture.schema);
  await db.end();
}
