import {describe,it,expect,vi,beforeEach} from "vitest";
const fixture=vi.hoisted(()=>({query:vi.fn(),release:vi.fn(),reconcile:vi.fn()}));
vi.mock("./db",()=>({pool:{connect:async()=>({query:fixture.query,release:fixture.release})}}));
vi.mock("./attendance-support",()=>({reconcileAttendance:fixture.reconcile}));
import {runAttendanceCatchup} from "./attendance-scheduler";
import {riyadhDateKey} from "../shared/attendance";
describe("attendance worker concurrency and restart",()=>{
  beforeEach(()=>{
    fixture.query.mockReset();fixture.release.mockReset();fixture.reconcile.mockReset();
    fixture.query.mockImplementation(async(sql:string)=>({
      rows:sql.includes("pg_try")?[{locked:true}]:sql.startsWith("SELECT last_day")?[{last_day:riyadhDateKey(new Date())}]:[],
    }));
  });
  it("runs today's reconciliation and checkpoints only after success",async()=>{
    await runAttendanceCatchup();
    expect(fixture.reconcile).toHaveBeenCalledWith(riyadhDateKey(new Date()));
    expect(fixture.query.mock.calls.some(([s])=>s.startsWith("INSERT INTO attendance_job_state"))).toBe(true);
    expect(fixture.query.mock.calls.at(-1)?.[0]).toContain("pg_advisory_unlock");
    expect(fixture.release).toHaveBeenCalledOnce();
  });
  it("does not overlap another deployment instance",async()=>{
    fixture.query.mockResolvedValue({rows:[{locked:false}]});
    await runAttendanceCatchup();
    expect(fixture.reconcile).not.toHaveBeenCalled();
    expect(fixture.query).toHaveBeenCalledOnce();
  });
  it("releases its lock without advancing the cursor after a failure",async()=>{
    fixture.reconcile.mockRejectedValueOnce(new Error("fixture"));
    await expect(runAttendanceCatchup()).rejects.toThrow("fixture");
    expect(fixture.query.mock.calls.some(([s])=>s.startsWith("INSERT INTO attendance_job_state"))).toBe(false);
    expect(fixture.query.mock.calls.at(-1)?.[0]).toContain("pg_advisory_unlock");
  });
});
