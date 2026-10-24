import {describe,it,expect} from "vitest";
import {TEAK_WORKING_DAYS,resolveWeekPolicy,workdayFor,completeShiftEvidence} from "./attendance-workweek";
import type {WeekPolicy} from "./attendance-workweek";
const general:WeekPolicy={id:1,employeeId:null,workingDays:TEAK_WORKING_DAYS,effectiveFrom:"2026-10-25"};
describe("effective-dated workweek policy",()=>{
  it("does not reinterpret an earlier day and treats Saturday as work, Friday as rest",()=>{
    expect(resolveWeekPolicy([general],7,"2026-10-24").source).toBe("legacy");
    expect(workdayFor(resolveWeekPolicy([general],7,"2026-10-31"),"2026-10-31")).toBe(true);
    expect(workdayFor(resolveWeekPolicy([general],7,"2026-10-30"),"2026-10-30")).toBe(false);
  });
  it("retains personal exceptions across a newer general rule and supports dated inheritance reset",()=>{
    const own={id:2,employeeId:7,workingDays:[1,2],effectiveFrom:"2026-10-26"};
    const next={...general,id:3,effectiveFrom:"2026-10-27",workingDays:[0,1,2,3,4]};
    const reset={...own,id:4,workingDays:null,effectiveFrom:"2026-10-28"};
    expect(resolveWeekPolicy([general,own,next,reset],7,"2026-10-27").workingDays).toEqual([1,2]);
    expect(resolveWeekPolicy([general,own,next,reset],7,"2026-10-28").workingDays).toEqual(next.workingDays);
    expect(resolveWeekPolicy([general,own],8,"2026-10-27").source).toBe("default");
  });
  it("uses the latest audited revision for the same effective day, independent of array order",()=>{
    expect(resolveWeekPolicy([{...general,id:3,workingDays:[1]},general],8,"2026-10-26").workingDays).toEqual([1]);
  });
  it("rejects incomplete or overnight legacy shifts as evidence for automatic absence",()=>{
    expect(completeShiftEvidence([])).toBe(false);
    expect(completeShiftEvidence([{start:"08:00",end:""}])).toBe(false);
    expect(completeShiftEvidence([{start:"23:00",end:"07:00"}])).toBe(false);
    expect(completeShiftEvidence([{start:"08:00",end:"16:00"}])).toBe(true);
  });
});
