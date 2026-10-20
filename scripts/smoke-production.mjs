// Run only against the development DB, in an empty disposable schema.
// No production connection, real credentials, records or outgoing SMS are used.
import pg from "pg";
import { randomUUID, randomBytes, scryptSync, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { writeFile, rm } from "node:fs/promises";
if (process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production") throw new Error("Development only");
const db = new pg.Client({connectionString:process.env.DATABASE_URL});
const schema = `smoke_${randomUUID().replaceAll("-","")}`;
const guard = `/tmp/${schema}.cjs`;
const recoveryTest=process.argv.includes("--owner-recovery");
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
  const env = {...process.env, NODE_ENV:"production", REPLIT_DEPLOYMENT:recoveryTest?"1":"0", PORT:"5099",
    DATABASE_URL:connection.href, SESSION_SECRET:randomUUID()+randomUUID(), NODE_OPTIONS:`--require=${guard}`};
  for (const key of ["TAQNYAT_API_KEY","TEAK_SYSTEM_ADMIN_USERNAME","TEAK_SYSTEM_ADMIN_PASSWORD","TEAK_SYSTEM_ADMIN_RECOVERY_PASSWORD","TEAK_SYSTEM_ADMIN_RECOVERY_ID","FIREBASE_SERVICE_ACCOUNT_KEY","OPENAI_API_KEY","EMPLOYEE_PORTAL_DEV_OTP"])
    delete env[key];
  const hash=value=>{const salt=randomBytes(16).toString("hex");return`${scryptSync(value,salt,64).toString("hex")}.${salt}`;};
  const oldPassword="synthetic-old-owner-password",newPassword="synthetic-new-owner-password",laterPassword="synthetic-later-owner-password";
  let owner;
  if(recoveryTest){
    await db.query(`SET search_path TO "${schema}",public`);
    const insert=async(name,role)=>(await db.query(`INSERT INTO users(username,password,role,full_name_ar,full_name_en,active,archived)
      VALUES($1,$2,$3,'اختبار معزول','Disposable fixture',true,false) RETURNING id`,[name,hash(oldPassword),role])).rows[0].id;
    owner=await insert("fixture_owner","owner");
    const hr=await insert("fixture_hr","hr");
    await db.query("INSERT INTO teak_system_admin(singleton,user_id) VALUES(true,$1)",[owner]);
    for(const [sid,userId] of [["owner-before-recovery",owner],["hr-session-preserved",hr]])
      await db.query("INSERT INTO user_sessions(sid,sess,expire) VALUES($1,$2::json,now()+interval '1 day')",
        [sid,JSON.stringify({userId,adminAuthenticated:true,systemAdminWorkspace:userId===owner})]);
    const key=`hr-login-user:${createHash("sha256").update("fixture_owner").digest("hex")}`;
    await db.query("INSERT INTO employee_portal_limits(key,count,resets_at) VALUES($1,10,now()+interval '15 minutes'),('fixture-shared-ip-preserved',30,now()+interval '15 minutes')",[key]);
    Object.assign(env,{TEAK_SYSTEM_ADMIN_USERNAME:"fixture_owner",TEAK_SYSTEM_ADMIN_PASSWORD:oldPassword,
      TEAK_SYSTEM_ADMIN_RECOVERY_PASSWORD:newPassword,TEAK_SYSTEM_ADMIN_RECOVERY_ID:randomUUID()});
  }
  const start=async()=>{
    let ready=false;
    child=spawn(process.execPath,["dist/index.cjs"],{env,stdio:["ignore","pipe","pipe"]});
    child.stdout.on("data",data=>{if(String(data).includes("serving on port 5099"))ready=true;});
    child.stderr.on("data",()=>{}); // Never print child configuration or DB errors.
    const deadline=Date.now()+45000;
    while(!ready&&child.exitCode===null&&Date.now()<deadline)await new Promise(r=>setTimeout(r,200));
    if(!ready)throw new Error("Production process did not become ready (details withheld to protect configuration)");
  };
  const stop=async()=>{
    if(child&&child.exitCode===null){
      const target=child;
      await new Promise(resolve=>{
        const timeout=setTimeout(()=>{target.kill("SIGKILL");resolve();},3000);
        timeout.unref();
        target.once("exit",()=>{clearTimeout(timeout);resolve();});
        target.kill("SIGTERM");
      });
    }
  };
  await start();
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
  if(recoveryTest){
    const login=async(password,expected)=>{
      const response=await fetch("http://127.0.0.1:5099/api/system-admin/login",{method:"POST",
        headers:{"Content-Type":"application/json","X-Forwarded-Proto":"https"},
        body:JSON.stringify({username:"fixture_owner",password})});
      if(response.status!==expected)throw new Error(`Synthetic owner login: ${response.status}, expected ${expected}`);
      return response;
    };
    const exists=async(sql,params=[])=>(await db.query(sql,params)).rowCount>0;
    if(await exists("SELECT 1 FROM user_sessions WHERE sid='owner-before-recovery'"))throw new Error("Owner session was not revoked");
    if(!await exists("SELECT 1 FROM user_sessions WHERE sid='hr-session-preserved'"))throw new Error("Unrelated HR session was changed");
    if(!await exists("SELECT 1 FROM employee_portal_limits WHERE key='fixture-shared-ip-preserved' AND count=30"))throw new Error("Shared IP counter changed");
    await login(oldPassword,401);
    const signedIn=await login(newPassword,200);
    const cookie=signedIn.headers.getSetCookie().map(v=>v.split(";")[0]).join("; ");
    const me=await fetch("http://127.0.0.1:5099/api/system-admin/me",{headers:{Cookie:cookie,"X-Forwarded-Proto":"https"}});
    if(me.status!==200)throw new Error("Recovered owner session was not usable");
    if(await exists("SELECT 1 FROM teak_system_admin_audit WHERE target_id=$1 HAVING count(*)<>1",[owner]))throw new Error("Recovery audit missing or duplicated");
    await stop();
    await db.query("UPDATE users SET password=$2 WHERE id=$1",[owner,hash(laterPassword)]);
    await start();
    await login(newPassword,401);
    await login(laterPassword,200);
    const audit=(await db.query("SELECT count(*)::int AS count FROM teak_system_admin_audit WHERE target_id=$1",[owner])).rows[0].count;
    if(audit!==1)throw new Error("Recovery request replayed on restart");
    console.log("PASS: isolated production-mode owner recovery, new password login/session, old password rejected, scoped session/counter revocation, audit, restart replay protection; no production data or real credentials.");
  }
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
