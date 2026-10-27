import { describe, it, expect } from "vitest";
import { buildWeekPreview, parseWeekInput } from "./attendance-workweek";
import { riyadhDateKey } from "../shared/attendance";
describe("initial workweek activation", () => {
  const input = () => parseWeekInput({mode:"bootstrap",scope:"all",workingDays:[0,1,2,3,4,6],
    effectiveFrom:riyadhDateKey(new Date()),reason:"اعتماد أسبوع السبت إلى الخميس"});
  it("requires today's date and explicit complete scope", () => {
    expect(input().mode).toBe("bootstrap");
    expect(()=>parseWeekInput({...input(),effectiveFrom:"2020-01-01"})).toThrow();
    expect(()=>parseWeekInput({...input(),scope:"employees",employeeIds:[1]})).toThrow();
    expect(()=>parseWeekInput({...input(),workingDays:[]})).toThrow();
  });
  it("previews initial policy without writing and refuses repeated bootstrap", async () => {
    const statements:string[]=[];
    const executor={query:async(sql:string)=>{
      statements.push(sql);
      return {rows:sql.includes("FROM attendance_week_policies")?[]:
        [{id:100,employeeNumber:"TEST",name:"اختبار",status:"active",contractStart:"2025-01-01"}]};
    }};
    const preview=await buildWeekPreview(input(),executor as any);
    expect(preview.affectedCount).toBe(1);
    expect(preview.rows[0].after.workingDays).toEqual([0,1,2,3,4,6]);
    expect(statements.every(sql=>sql.includes("SELECT"))).toBe(true);
    await expect(buildWeekPreview(input(),{query:async()=>({rows:[{id:1}]})} as any)).rejects.toMatchObject({status:409});
  });
});
