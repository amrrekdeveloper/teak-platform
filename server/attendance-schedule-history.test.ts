import {beforeEach,describe,it,expect,vi} from "vitest";
const state=vi.hoisted(()=>({query:vi.fn()}));
vi.mock("./db",()=>({pool:{query:state.query}}));
vi.mock("./attendance-workweek",()=>({calendarForDay:vi.fn()}));
import {scheduledShiftsForDay} from "./attendance-schedule-history";
import {riyadhDateKey} from "../shared/attendance";
describe("immutable daily schedules",()=>{
  beforeEach(()=>state.query.mockReset());
  it("retains a captured schedule after the current settings change",async()=>{
    const saved=[{id:"single",label:"الدوام",start:"08:00",end:"16:00",graceMinutes:15}];
    state.query.mockResolvedValue({rows:[{shifts:saved}]});
    expect(await scheduledShiftsForDay([{scopeType:"default",workStartTime:"10:00",workEndTime:"18:00",graceMinutes:0}],{id:7},"2026-01-01")).toEqual(saved);
    expect(state.query).toHaveBeenCalledTimes(1);
  });
  it("serializes first-use snapshots without overwriting another device's snapshot",async()=>{
    state.query.mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{shifts:[{id:"single",start:"08:00"}]}]});
    await scheduledShiftsForDay([],{id:7},riyadhDateKey(new Date()));
    expect(state.query.mock.calls[1][0]).toContain("SET shifts=attendance_day_schedules.shifts");
  });
  it("does not fabricate historical or freeze future snapshots",async()=>{
    state.query.mockResolvedValue({rows:[]});
    await scheduledShiftsForDay([],{id:7},"2000-01-01");
    await scheduledShiftsForDay([],{id:7},"2099-01-01");
    expect(state.query.mock.calls.every(([sql])=>sql.startsWith("SELECT"))).toBe(true);
  });
});
