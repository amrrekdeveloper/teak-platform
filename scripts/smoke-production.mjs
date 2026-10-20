// Run only against the development DB, in an empty disposable schema.
// No production connection, real credentials, records or outgoing SMS are used.
import pg from "pg";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { writeFile, rm } from "node:fs/promises";
if (process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production") throw new Error("Development only");
const db = new pg.Client({connectionString:process.env.DATABASE_URL});
const schema = `smoke_${randomUUID().replaceAll("-","")}`;
const guard = `/tmp/${schema}.cjs`;
let child;
try {
  await db.connect();
  await db.query(`CREATE SCHEMA "${schema}"`);
  const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows;
  for (const {tablename:t} of tables) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t)) throw new Error("Unsupported table");
    await db.query(`CREATE TABLE "${schema}"."${t}" (LIKE public."${t}" INCLUDING ALL)`);
  }
  // LIKE copies serial defaults; replace them to avoid touching public sequences.
  const defaults = (await db.query(`SELECT table_name,column_name FROM information_schema.columns
    WHERE table_schema=$1 AND column_default LIKE 'nextval(%'`,[schema])).rows;
  for (const {table_name:t,column_name:c} of defaults) {
    const seq = `${t}_${c}_smoke`.slice(0,63);
    await db.query(`CREATE SEQUENCE "${schema}"."${seq}"`);
    await db.query(`ALTER TABLE "${schema}"."${t}" ALTER COLUMN "${c}"
      SET DEFAULT nextval('"${schema}"."${seq}"'::regclass)`);
  }
  const connection = new URL(process.env.DATABASE_URL);
  connection.searchParams.set("options", `-c search_path=${schema},public`);
  await writeFile(guard, `
const http=require("http"),https=require("https");
function blocked(){throw new Error("External network disabled in production smoke");}
http.request=blocked;https.request=blocked;http.get=blocked;https.get=blocked;global.fetch=blocked;
`);
  const env = {...process.env, NODE_ENV:"production", REPLIT_DEPLOYMENT:"0", PORT:"5099",
    DATABASE_URL:connection.href, SESSION_SECRET:randomUUID()+randomUUID(), NODE_OPTIONS:`--require=${guard}`};
  for (const key of ["TAQNYAT_API_KEY","TEAK_SYSTEM_ADMIN_USERNAME","TEAK_SYSTEM_ADMIN_PASSWORD","FIREBASE_SERVICE_ACCOUNT_KEY","OPENAI_API_KEY","EMPLOYEE_PORTAL_DEV_OTP"])
    delete env[key];
  let ready=false;
  child=spawn(process.execPath,["dist/index.cjs"],{env,stdio:["ignore","pipe","pipe"]});
  let logs="";
  child.stdout.on("data",data=>{logs+=data; if(String(data).includes("serving on port 5099"))ready=true;});
  child.stderr.on("data",data=>{logs+=data;});
  const deadline=Date.now()+45000;
  while(!ready && child.exitCode===null && Date.now()<deadline) await new Promise(r=>setTimeout(r,200));
  if(!ready) throw new Error("Production process did not become ready (details withheld to protect configuration)");
  const request=async(path,expected)=>{
    const res=await fetch(`http://127.0.0.1:5099${path}`);
    if(res.status!==expected) throw new Error(`Smoke ${path}: ${res.status} expected ${expected}`);
    return res;
  };
  await request("/",200);
  await request("/system-admin",200);
  await request("/hr/login",200);
  await request("/dashboard",503);
  const config=await (await request("/api/employee-portal/config",200)).json();
  if(config.developmentOtp)throw new Error("Development OTP exposed");
  await request("/api/employee-portal/me",401);
  const otp=await fetch("http://127.0.0.1:5099/api/employee-portal/otp/request",{
    method:"POST",headers:{"Content-Type":"application/json","X-Portal-Request":"1"},
    body:JSON.stringify({phone:"0500000000"})});
  if(otp.status!==503)throw new Error("Missing SMS configuration did not fail closed");
  console.log("PASS: production bundle startup, health, maintenance, scoped entry, production OTP disabled, missing SMS fail-closed; disposable schema; outbound network blocked.");
} finally {
  if(child && child.exitCode===null) {
    child.kill("SIGTERM");
    await new Promise(resolve=>{child.once("exit",resolve);setTimeout(()=>{child.kill("SIGKILL");resolve();},3000).unref();});
  }
  await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(()=>{});
  await db.end();
  await rm(guard,{force:true});
}
