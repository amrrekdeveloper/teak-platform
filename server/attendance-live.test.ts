import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { EventEmitter } from "node:events";
import type { Server } from "node:http";
const mocks = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn() }));
vi.mock("./db", () => ({ pool: mocks }));
import { affectsAttendance, canReceiveAttendanceEvents, closeAttendanceEvents, notifyAttendanceChanges, registerAttendanceEvents } from "./attendance-live";
import { isHrWorkspaceApi, isSystemAdminApi, isManagerApi } from "../shared/hr-access";

let server: Server | undefined;
const emitter = new EventEmitter();
const client = Object.assign(emitter, { query: vi.fn(), release: vi.fn() });
beforeEach(() => {
  vi.clearAllMocks();emitter.removeAllListeners();
  mocks.connect.mockResolvedValue(client);
  mocks.query.mockResolvedValue({ rows: [{ role: "hr", active: true, archived: false }] });
  client.query.mockResolvedValue({});
});
afterEach(async () => {
  closeAttendanceEvents();vi.useRealTimers();
  if (server) { const s=server;server=undefined;await new Promise<void>(resolve=>s.close(()=>resolve())); }
});
describe("attendance invalidation scope", () => {
  it.each([
    ["POST","/api/employee-portal/attendance"],
    ["POST","/api/employee-portal/attendance/check-in"],
    ["POST","/api/employee-portal/corrections"],
    ["PATCH","/api/employees/123"],
    ["POST","/api/attendance/work-settings"],
    ["POST","/api/leaves/1/decision"],
  ])("notifies after a relevant %s operation", (method,path)=>expect(affectsAttendance(method,path)).toBe(true));
  it.each([
    ["GET","/api/attendance/events"],["GET","/api/attendance/monitor"],
    ["POST","/api/employee-portal/otp/request"],["POST","/api/system-admin/password"],
  ])("ignores unrelated %s operations",(method,path)=>expect(affectsAttendance(method,path)).toBe(false));
  it("never grants the stream to owner-panel or manager workspaces",()=>{
    expect(isHrWorkspaceApi("GET","/api/attendance/events")).toBe(true);
    expect(isSystemAdminApi("GET","/api/attendance/events")).toBe(false);
    expect(isManagerApi("GET","/api/attendance/events")).toBe(false);
    const session={userId:123,adminAuthenticated:true,hrWorkspace:true};
    const user={role:"hr",active:true};
    expect(canReceiveAttendanceEvents(session,user)).toBe(true);
    expect(canReceiveAttendanceEvents({...session,systemAdminWorkspace:true},user)).toBe(false);
    expect(canReceiveAttendanceEvents({...session,managerWorkspace:true},user)).toBe(false);
    expect(canReceiveAttendanceEvents(session,{...user,active:false})).toBe(false);
    expect(canReceiveAttendanceEvents(session,{...user,role:"sales"})).toBe(false);
    expect(canReceiveAttendanceEvents({userId:123},user)).toBe(false);
  });
  it("emits no notification for failed writes and batches successful ones",async()=>{
    vi.useFakeTimers();
    const failed=Object.assign(new EventEmitter(),{statusCode:400});
    notifyAttendanceChanges({method:"POST",originalUrl:"/api/attendance/zones"} as any,failed as any,()=>{});
    failed.emit("finish");await vi.advanceTimersByTimeAsync(100);
    expect(mocks.query).not.toHaveBeenCalled();
    const success=Object.assign(new EventEmitter(),{statusCode:201});
    notifyAttendanceChanges({method:"POST",originalUrl:"/api/attendance/zones"} as any,success as any,()=>{});
    success.emit("finish");await vi.advanceTimersByTimeAsync(100);
    expect(mocks.query).toHaveBeenCalledWith("SELECT pg_notify($1, 'refresh')",["teak_attendance_changed"]);
  });
});
it("streams only generic invalidations and closes a revoked session",async()=>{
  let revoked=false;
  const app=express();
  app.use((req,_res,next)=>{
    (req as any).session={userId:123,adminAuthenticated:true,hrWorkspace:true};
    (req as any).sessionID="synthetic-session";
    (req as any).sessionStore={get:(_id:string,callback:Function)=>callback(null,revoked?null:{userId:123,adminAuthenticated:true,hrWorkspace:true})};
    next();
  });
  registerAttendanceEvents(app,(_req,_res,next)=>next(),20);
  await new Promise<void>(resolve=>{server=app.listen(0,"127.0.0.1",resolve)});
  const response=await fetch(`http://127.0.0.1:${(server!.address() as any).port}/api/attendance/events`);
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  const reader=response.body!.getReader();
  const decoder=new TextDecoder();let body="";
  while(!body.includes("event: ready"))body+=decoder.decode((await reader.read()).value);
  emitter.emit("notification",{channel:"teak_attendance_changed",payload:"SECRET EMPLOYEE DATA"});
  while(!body.includes("event: attendance"))body+=decoder.decode((await reader.read()).value);
  expect(body).not.toContain("SECRET");
  expect(client.query).toHaveBeenCalledWith("LISTEN teak_attendance_changed");
  revoked=true;
  let done=false;
  while(!done)done=(await reader.read()).done;
  expect(done).toBe(true);
});
