import {describe,it,expect} from "vitest";
import {attendanceMinutes,attendanceReportCells,type AttendanceReportRow} from "./attendance-report";
const row:AttendanceReportRow={
  day:"2026-01-04",shiftId:"single",shiftLabel:"الدوام",status:"unverified_schedule",
  checkIn:"2026-01-04T06:00:00Z",checkOut:"2026-01-04T12:00:00Z",
  scheduleVerified:false,late:null,lateMinutes:null,earlyDepartureMinutes:null,adminOverride:false,outOfZone:false,
};
describe("schedule evidence in screen/PDF/Excel cells",()=>{
  it("exports unknown minutes as unavailable, never zero or null text",()=>{
    expect(attendanceReportCells(row).slice(5,7)).toEqual(["غير متاح","غير متاح"]);
    expect(attendanceReportCells(row)[4]).toBe("جدول تاريخي غير موثق");
  });
  it("refuses old nonzero metrics when schedule evidence is missing",()=>{
    const stale={...row,late:true,lateMinutes:120,earlyDepartureMinutes:60};
    expect(attendanceReportCells(stale).slice(5,7)).toEqual(["غير متاح","غير متاح"]);
  });
  it("preserves verified zero and nonzero minutes",()=>{
    expect(attendanceReportCells({...row,scheduleVerified:true,lateMinutes:0,earlyDepartureMinutes:60}).slice(5,7)).toEqual([0,60]);
  });
  it("fails closed when a verified row has a missing numeric value",()=>{
    expect(attendanceMinutes({...row,scheduleVerified:true},"lateMinutes")).toBe("غير متاح");
  });
});
