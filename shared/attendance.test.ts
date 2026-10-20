import { describe, it, expect } from "vitest";
import { riyadhDateKey, riyadhDayBounds, isLateCheckIn, resolveAttendanceShifts, shiftAttendanceStatus, validateShifts, riskLevel, type AttendanceShift } from "./attendance";
import { permittedZone } from "../server/employee-portal/security";

const morning: AttendanceShift = { id:"morning",label:"صباحي",start:"09:00",end:"12:00",graceMinutes:15 };
const evening: AttendanceShift = { id:"evening",label:"مسائي",start:"16:00",end:"22:00",graceMinutes:15 };
const day = "2026-06-01";
const at = (time: string) => new Date(`${day}T${time}:00+03:00`);
describe("Riyadh attendance business rules", () => {
  it("crosses the Saudi day at 21:00 UTC", () => {
    expect(riyadhDateKey(new Date("2026-06-01T20:59:59Z"))).toBe(day);
    expect(riyadhDateKey(new Date("2026-06-01T21:00:00Z"))).toBe("2026-06-02");
    expect(riyadhDayBounds(day)).toEqual({from:"2026-05-31T21:00:00.000Z",to:"2026-06-01T20:59:59.999Z"});
  });
  it("is late after, never at, the 08:15 grace threshold", () => {
    const schedule = {workStartTime:"08:00",graceMinutes:15};
    expect(isLateCheckIn(at("08:15"),schedule)).toBe(false);
    expect(isLateCheckIn(at("08:16"),schedule)).toBe(true);
  });
  it("uses employee then department then default precedence", () => {
    const settings = [
      {scopeType:"default",workStartTime:"08:00",graceMinutes:15},
      {scopeType:"department",department:"sales",workStartTime:"09:00",graceMinutes:15,shifts:[morning,evening]},
      {scopeType:"employee",employeeId:7,workStartTime:"10:00",graceMinutes:0},
    ];
    expect(resolveAttendanceShifts(settings,{id:7,department:"sales"})[0].start).toBe("10:00");
    expect(resolveAttendanceShifts(settings,{id:8,department:"sales"})).toHaveLength(2);
    expect(resolveAttendanceShifts(settings,{id:9,department:"production"})).toHaveLength(1);
  });
  it("never invents an end time", () => {
    const shift = resolveAttendanceShifts([],{id:1})[0];
    expect(shift.end).toBe("");
    expect(shiftAttendanceStatus(day,shift,[{type:"check_in",checkTime:at("08:00")}],at("23:00")).status).toBe("present");
  });
  it("marks missing checkout only strictly after shift end", () => {
    const records = [{type:"check_in",checkTime:at("09:00")}];
    expect(shiftAttendanceStatus(day,morning,records,at("11:00")).status).toBe("present");
    expect(shiftAttendanceStatus(day,morning,records,at("12:00")).status).toBe("present");
    expect(shiftAttendanceStatus(day,morning,records,at("12:01")).status).toBe("missing_checkout");
  });
  it("does not count absence before closing", () => {
    expect(shiftAttendanceStatus(day,evening,[],at("18:00")).status).toBe("pending");
    expect(shiftAttendanceStatus(day,evening,[],at("22:01")).status).toBe("absent");
  });
  it("keeps missing checkin distinct", () => {
    expect(shiftAttendanceStatus(day,morning,[{type:"check_out",checkTime:at("12:00")}],at("13:00")).status).toBe("missing_checkin");
  });
  it("rejects overlap and unapproved overnight shifts", () => {
    expect(validateShifts([morning,evening])).toBe(true);
    expect(validateShifts([morning,{...evening,start:"11:00"}])).toBe(false);
    expect(validateShifts([{...evening,end:"06:00"}])).toBe(false);
    expect(validateShifts([{...morning,graceMinutes:-1}])).toBe(false);
  });
  it("keeps the evening status independent of the morning period", () => {
    expect(shiftAttendanceStatus(day,evening,[{type:"check_in",checkTime:at("16:00")}],at("17:00")).status).toBe("present");
    expect(shiftAttendanceStatus(day,morning,[{type:"check_in",checkTime:at("09:00")}],at("17:00")).status).toBe("missing_checkout");
  });
  it("uses documented risk bands", () => {
    expect([0,2,3,5,6].map(riskLevel)).toEqual(["green","green","orange","orange","red"]);
  });
});
describe("strict geofence GPS", () => {
  const zone = {id:1,nameAr:"المعرض",isActive:true,centerLat:"24",centerLng:"46",radiusMeters:100,polygonCoords:null};
  it("requires a reliable uncertainty circle inside an active zone", () => {
    expect(permittedZone([zone],{lat:24,lng:46},10)?.id).toBe(1);
    expect(permittedZone([zone],{lat:24.0008,lng:46},30)).toBeUndefined();
    expect(permittedZone([{...zone,isActive:false}],{lat:24,lng:46},10)).toBeUndefined();
  });
  it("rejects missing, non-finite and unreliable accuracy", () => {
    for (const accuracy of [NaN,Infinity,0,-1,51]) expect(permittedZone([zone],{lat:24,lng:46},accuracy)).toBeUndefined();
    expect(permittedZone([zone],{lat:NaN,lng:46},10)).toBeUndefined();
    expect(permittedZone([],{lat:24,lng:46},10)).toBeUndefined();
  });
});
