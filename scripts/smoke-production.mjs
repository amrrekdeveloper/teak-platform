// Run only against the development DB, in an empty disposable schema.
// No production connection, real credentials, records or outgoing SMS are used.
import pg from "pg";
import { randomUUID, randomBytes, scryptSync, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { writeFile, rm } from "node:fs/promises";
import { createIsolatedHrSchema, dropIsolatedHrSchema } from "./lib/isolated-hr-schema.mjs";
import { runHrFixtureJourneys } from "./lib/hr-fixture-journeys.mjs";
if (process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production") throw new Error("Development only");
const db = new pg.Client({connectionString:process.env.DATABASE_URL});
const guard = `/tmp/hr-smoke-${randomUUID()}.cjs`;
const recoveryTest=process.argv.includes("--owner-recovery");
const hrTest=process.argv.includes("--hr-readiness");
const hrWrites=process.argv.includes("--hr-fixture-writes");
const serveHr=process.argv.includes("--serve-hr");
let fixture;
let child;
try {
  await db.connect();
  fixture = await createIsolatedHrSchema(db);
  await writeFile(guard, `
const http=require("http"),https=require("https");
function blocked(){throw new Error("External network disabled in production smoke");}
http.request=blocked;https.request=blocked;http.get=blocked;https.get=blocked;global.fetch=blocked;
console.error=(...args)=>{
 const error=args.find(value=>value&&typeof value==="object");
 const chain=[];let current=error;
 for(let depth=0;current&&depth<5;depth++,current=current.cause){
   const message=String(current.message||"");
   // Classify failures and redact SQL/configuration from synthetic error summaries.
   const category=message.includes("no schema")?"schema-metadata-missing":
     message.includes("Failed query")?"query-failed":
     message.includes("not a function")?"function-missing":
     message.includes("Cannot read properties")?"undefined-property":
     message.includes("External network")?"outbound-blocked":"unclassified";
   let summary=message.split("\\n")[0];
   if(/query|params|select |insert |update |delete |postgres|password|secret|token|connection/i.test(summary))summary="[details withheld]";
   for(const [key,value] of Object.entries(process.env))
     if(value&&/KEY|PASSWORD|SECRET|TOKEN|DATABASE|PGHOST|PGUSER/i.test(key))summary=summary.split(value).join("[redacted]");
   chain.push({name:current.name||"Error",code:current.code||"none",category,summary:summary.slice(0,180)});
 }
 process.stderr.write("HR_FIXTURE_DIAGNOSTIC "+JSON.stringify(chain)+"\\n");
};
`);
  const env = {...process.env, NODE_ENV:"production", REPLIT_DEPLOYMENT:recoveryTest?"1":"0", PORT:"5099",
    DATABASE_URL:fixture.connectionString, SESSION_SECRET:randomUUID()+randomUUID(), NODE_OPTIONS:`--require=${guard}`};
  for (const key of ["TAQNYAT_API_KEY","HR_READINESS_PASSWORD","TEAK_SYSTEM_ADMIN_USERNAME","TEAK_SYSTEM_ADMIN_PASSWORD","TEAK_SYSTEM_ADMIN_RECOVERY_PASSWORD","TEAK_SYSTEM_ADMIN_RECOVERY_ID","FIREBASE_SERVICE_ACCOUNT_KEY","OPENAI_API_KEY","EMPLOYEE_PORTAL_DEV_OTP"])
    delete env[key];
  const hash=value=>{const salt=randomBytes(16).toString("hex");return`${scryptSync(value,salt,64).toString("hex")}.${salt}`;};
  const oldPassword="synthetic-old-owner-password",newPassword="synthetic-new-owner-password",laterPassword="synthetic-later-owner-password";
  let owner;
  if(hrTest || serveHr || hrWrites) {
    await db.query(`INSERT INTO users(username,password,role,full_name_ar,full_name_en,active,archived)
      VALUES('synthetic_hr_readiness',$1,'hr','اختبار موارد بشرية','Synthetic HR',true,false)`,
      [hash("SyntheticHR6!")]);
    await db.query(`INSERT INTO employees(employee_number,full_name_ar,nationality,position,department,monthly_salary,contract_start,status)
      VALUES('SYNTHETIC-HR-001','موظف اصطناعي','saudi','Synthetic role','hr',1000,'2026-01-01','active')`);
  }
  if(recoveryTest){
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
    child.stderr.on("data",data=>{
      // Print only the guard's redacted class/SQLSTATE, never raw DB errors.
      for(const line of String(data).split("\n"))
        if(line.startsWith("HR_FIXTURE_DIAGNOSTIC "))console.error(line);
    });
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
  if(hrTest || serveHr || hrWrites) {
    const base="http://127.0.0.1:5099";
    const login=async()=>fetch(base+"/api/hr-access/login",{method:"POST",
      headers:{"Content-Type":"application/json","X-Forwarded-Proto":"https"},
      body:JSON.stringify({username:"synthetic_hr_readiness",password:"SyntheticHR6!"})});
    const signedIn=await login();
    if(signedIn.status!==200)throw new Error(`HR fixture login failed: ${signedIn.status}`);
    const identity=await signedIn.json();
    if(identity.role!=="hr" || identity.maintenanceScope!=="hr" || identity.permissions.length!==16)
      throw new Error("Unexpected scoped HR identity");
    const cookie=signedIn.headers.getSetCookie().map(v=>v.split(";")[0]).join("; ");
    const headers={Cookie:cookie,"X-Forwarded-Proto":"https"};
    const day=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Riyadh"});
    const employee=(await db.query("SELECT id FROM employees WHERE employee_number='SYNTHETIC-HR-001'")).rows[0].id;
    const paths=["/api/auth/me","/api/hr/overview","/api/hr/requests","/api/hr/request-settings",
      "/api/hr/departments","/api/employees",`/api/employees/${employee}`,`/api/employees/${employee}/assets`,
      "/api/hr/access","/api/hr/alerts","/api/attendance/approvals","/api/attendance/corrections",
      "/api/attendance/zones","/api/attendance/work-settings","/api/attendance/shift-settings",
      `/api/attendance/workweek/settings?day=${day}`,`/api/attendance/shift-monitor?from=${day}&to=${day}`,
      "/api/attendance/risk-scores","/api/leaves","/api/attendance/permissions",
      `/api/hr/reports?type=employees&from=${day}&to=${day}`,
      "/api/hr-actions","/api/evaluations","/api/payroll","/api/advances","/api/users","/api/hr-audit-log"];
    const counts=async()=>(await db.query(`SELECT
      (SELECT count(*) FROM attendance_day_schedules)::int AS schedules,
      (SELECT count(*) FROM attendance_day_calendars)::int AS calendars,
      (SELECT count(*) FROM attendance_monthly_risk)::int AS risk,
      (SELECT count(*) FROM risk_alerts)::int AS alerts,
      (SELECT count(*) FROM notifications)::int AS notifications`)).rows[0];
    const before=await counts();
    for(const path of paths) {
      const response=await fetch(base+path,{headers});
      if(response.status!==200)throw new Error(`HR fixture GET ${path.split("?")[0]}: ${response.status}`);
      console.log(`PASS HR read: ${path.split("?")[0]}`);
    }
    if(JSON.stringify(before)!==JSON.stringify(await counts()))throw new Error("HR reads changed attendance evidence, risk or notifications");
    for(const [path,expected] of [["/api/payroll/1/pay",403],["/api/advances/1/approve",403],["/api/users",503]]) {
      const response=await fetch(base+path,{method:"POST",headers});
      if(response.status!==expected)throw new Error(`HR financial/owner boundary ${path}: ${response.status}`);
    }
    if((await fetch(base+"/api/employees",{method:"POST",headers:{...headers,Origin:"https://untrusted.invalid"}})).status!==403)
      throw new Error("Cross-origin HR write accepted");
    if(hrWrites) await runHrFixtureJourneys({db,base,headers,day});
    if((await fetch(base+"/api/auth/logout",{method:"POST",headers})).status!==200 ||
      (await fetch(base+"/api/auth/me",{headers})).status!==401)throw new Error("HR logout did not revoke session");
    const expiring=await login();
    const expiredCookie=expiring.headers.getSetCookie().map(v=>v.split(";")[0]).join("; ");
    await db.query(`UPDATE user_sessions SET expire=now()-interval '1 minute'
      WHERE sess->>'userId'=(SELECT id::text FROM users WHERE username='synthetic_hr_readiness')`);
    if((await fetch(base+"/api/auth/me",{headers:{Cookie:expiredCookie,"X-Forwarded-Proto":"https"}})).status!==401)
      throw new Error("Expired HR session accepted");
    console.log("PASS: real scoped HR login, PostgreSQL-backed session, 27 read endpoints, no attendance side effects, financial/owner and origin boundaries, logout.");
    if(serveHr) {
      console.log("Synthetic HR preview on port 5099; sign in with synthetic_hr_readiness / SyntheticHR6! (disposable fixture, never a real account).");
      await new Promise(resolve=>{process.once("SIGTERM",resolve);process.once("SIGINT",resolve);});
    }
  }
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
  if(fixture) await dropIsolatedHrSchema(db,fixture.schema);
  await db.end();
  await rm(guard,{force:true});
}
