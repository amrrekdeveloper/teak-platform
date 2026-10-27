import { describe,it,expect } from "vitest";
import { applyAttendanceCorrection,hasAttendanceDeficiency } from "./attendance-corrections";
import { resolveAttendanceShifts,shiftAttendanceStatus } from "../shared/attendance";

const shift={id:"morning",label:"الصباح",start:"07:30",end:"14:30",graceMinutes:15};
const row={status:"late",late:true,lateMinutes:40,earlyDepartureMinutes:20,outOfZone:false,
  scheduleVerified:true,checkIn:"2026-10-20T05:10:00Z",checkOut:"2026-10-20T11:10:00Z"};
describe("attendance corrections preserve original evidence",()=>{
  it("keeps pending and rejected deficiencies effective",()=>{
    for(const status of ["pending","rejected"]) expect(applyAttendanceCorrection(row,{id:1,status}))
      .toMatchObject({status:"late",lateMinutes:40,earlyDepartureMinutes:20,checkIn:row.checkIn,correctionStatus:status,excused:false});
  });
  it("approval clears effective deficiencies without changing punch timestamps",()=>{
    expect(applyAttendanceCorrection(row,{id:1,status:"approved"})).toMatchObject({
      status:"excused",late:false,lateMinutes:0,earlyDepartureMinutes:0,observedStatus:"late",
      observedLateMinutes:40,observedEarlyDepartureMinutes:20,checkIn:row.checkIn,checkOut:row.checkOut,
    });
  });
  it("recognizes absent and missing-punch deficiencies even without numeric minutes",()=>{
    for(const status of ["absent","missing_checkin","missing_checkout"])
      expect(hasAttendanceDeficiency({...row,status,late:false,lateMinutes:0,earlyDepartureMinutes:0})).toBe(true);
  });
  it("never permits invented correction of an undocumented schedule",()=>{
    expect(hasAttendanceDeficiency({...row,scheduleVerified:false})).toBe(false);
  });
  it("accepts an historical explanation without converting unknown metrics to zero or excused attendance",()=>{
    const unknown={...row,status:"unverified_schedule",scheduleVerified:false,late:null,
      lateMinutes:null,earlyDepartureMinutes:null};
    expect(applyAttendanceCorrection(unknown,{id:2,status:"approved"})).toMatchObject({
      status:"unverified_schedule",lateMinutes:null,earlyDepartureMinutes:null,
      explanationAccepted:true,correctionStatus:"approved",excused:false,checkIn:row.checkIn,
    });
  });
  it("does not classify a not-yet-ended shift as absence at 09:00",()=>{
    expect(shiftAttendanceStatus("2026-10-20",shift,[],new Date("2026-10-20T09:00:00+03:00")).status).toBe("pending");
    expect(shiftAttendanceStatus("2026-10-20",shift,[],new Date("2026-10-20T14:31:00+03:00")).status).toBe("absent");
  });
  it("selects exactly the assigned zone option, not every option for that location",()=>{
    const settings=[
      {id:1,scopeType:"location",locationZoneId:10,workStartTime:"07:30",graceMinutes:15,shifts:[shift]},
      {id:2,scopeType:"location",locationZoneId:10,workStartTime:"09:00",graceMinutes:0,
        shifts:[{...shift,id:"first",start:"09:00",end:"12:00"},{...shift,id:"second",start:"16:00",end:"22:00"}]},
    ];
    expect(resolveAttendanceShifts(settings,{id:5,attendanceZoneId:10,attendanceScheduleId:2})).toHaveLength(2);
    expect(resolveAttendanceShifts(settings,{id:5,attendanceZoneId:10,attendanceScheduleId:1})).toEqual([shift]);
    expect(resolveAttendanceShifts(settings,{id:5,attendanceZoneId:99,attendanceScheduleId:2})).toHaveLength(1);
  });
});
