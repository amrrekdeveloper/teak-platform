import { afterAll,beforeAll,beforeEach,describe,expect,it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { randomBytes,randomUUID } from "node:crypto";
import { pool } from "./db";
import { hashPassword,setupAuth } from "./auth";
import { initializeEmployeePortal } from "./employee-portal/database";
import { tokenHash } from "./employee-portal/security";
import { REMEMBERED_LOGIN_MS } from "./login-session";

const username=`remember_fixture_${randomUUID().replaceAll("-","")}`;
const legacyUsername=`legacy_fixture_${randomUUID().replaceAll("-","")}`;
const ip=`198.19.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;
const ids:number[]=[];
let server:Server,base:string;
const cookie=(r:Response)=>r.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ");
async function login(rememberMe?:unknown,name=username,password="Aa1!xx"){
  return fetch(base+"/api/hr-access/login",{method:"POST",headers:{"Content-Type":"application/json","X-Forwarded-For":ip},
    body:JSON.stringify({username:name,password,...(rememberMe===undefined?{}:{rememberMe})})});
}
beforeAll(async()=>{
  if(process.env.NODE_ENV==="production"||process.env.REPLIT_DEPLOYMENT==="1")throw Error("Development-only fixtures");
  process.env.SESSION_SECRET||=randomBytes(32).toString("hex");
  await initializeEmployeePortal();
  for(const [name,password]of[[username,"Aa1!xx"],[legacyUsername,"legacy-existing-password"]]){
    const {rows:[r]}=await pool.query(`INSERT INTO users(username,password,role,full_name_ar,full_name_en,active,archived)
      VALUES($1,$2,'hr','اختبار جلسة مؤقت','Session fixture',true,false) RETURNING id`,[name,await hashPassword(password)]);
    ids.push(r.id);
  }
  const app=express();app.set("trust proxy",1);app.use(express.json());setupAuth(app);
  await new Promise<void>(resolve=>{server=app.listen(0,"127.0.0.1",resolve)});
  base=`http://127.0.0.1:${(server.address() as any).port}`;
});
beforeEach(async()=>{await pool.query("DELETE FROM user_sessions WHERE sess->>'userId'=ANY($1::text[])",[ids.map(String)])});
afterAll(async()=>{
  if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));
  await pool.query("UPDATE users SET active=false,archived=true WHERE id=ANY($1::int[])",[ids]);
  await pool.query("DELETE FROM user_sessions WHERE sess->>'userId'=ANY($1::text[])",[ids.map(String)]);
  await pool.query("DELETE FROM notifications WHERE user_id=ANY($1::int[])",[ids]);
  await pool.query("DELETE FROM users WHERE id=ANY($1::int[])",[ids]);
  await pool.query("DELETE FROM employee_portal_limits WHERE key=ANY($1::text[])",
    [[`hr-login-ip:${tokenHash(ip)}`,`hr-login-user:${tokenHash(username)}`,`hr-login-user:${tokenHash(legacyUsername)}`]]);
});
describe("real administrative session persistence",()=>{
  it("accepts a six-character password and persists opt-in as an HttpOnly thirty-day session",async()=>{
    const r=await login(true);expect(r.status).toBe(200);
    const header=r.headers.getSetCookie().join(";");
    expect(header).toMatch(/HttpOnly/i);expect(header).toMatch(/SameSite=Lax/i);expect(header).toMatch(/Expires=/i);
    const {rows:[stored]}=await pool.query("SELECT sess FROM user_sessions WHERE sess->>'userId'=$1",[String(ids[0])]);
    expect(stored.sess.rememberMe).toBe(true);expect(stored.sess.cookie.originalMaxAge).toBe(REMEMBERED_LOGIN_MS);
    const me=await fetch(base+"/api/auth/me",{headers:{Cookie:cookie(r)}});
    expect(me.status).toBe(200);expect(await me.json()).toMatchObject({role:"hr",maintenanceScope:"hr"});
    expect((await fetch(base+"/api/system-admin/hr-accounts",{headers:{Cookie:cookie(r)}})).status).toBe(401);
  });
  it("uses a browser-session cookie when remember-me is unchecked",async()=>{
    const r=await login(false);expect(r.status).toBe(200);
    expect(r.headers.getSetCookie().join(";")).not.toMatch(/Expires=|Max-Age=/i);
    const {rows:[stored]}=await pool.query("SELECT sess FROM user_sessions WHERE sess->>'userId'=$1",[String(ids[0])]);
    expect(stored.sess.rememberMe).toBe(false);expect(stored.sess.cookie.expires).toBeNull();
  });
  it("does not opt in silently when the option is absent",async()=>{
    const r=await login();expect(r.status).toBe(200);
    expect(r.headers.getSetCookie().join(";")).not.toMatch(/Expires=|Max-Age=/i);
  });
  it("keeps existing passwords valid even when they do not match the new creation policy",async()=>{
    expect((await login(false,legacyUsername,"legacy-existing-password")).status).toBe(200);
  });
  it("rejects malformed remember-me values rather than treating strings as consent",async()=>{
    expect((await login("true")).status).toBe(400);
  });
  it("logout destroys a remembered session",async()=>{
    const r=await login(true),headers={Cookie:cookie(r)};
    expect((await fetch(base+"/api/auth/logout",{method:"POST",headers})).status).toBe(200);
    expect((await fetch(base+"/api/auth/me",{headers})).status).toBe(401);
    expect((await pool.query("SELECT 1 FROM user_sessions WHERE sess->>'userId'=$1",[String(ids[0])])).rowCount).toBe(0);
  });
});
