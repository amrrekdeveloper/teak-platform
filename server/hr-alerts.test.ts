import { describe, expect, it, vi } from "vitest";
import { alertSettingsInput, alertStateInput, generateHrAlerts, saveAlertSettings, type AlertEmployee } from "./hr-alerts";
import { pool } from "./db";
import { isHrWorkspaceApi, isHrWorkspacePage, isManagerApi } from "../shared/hr-access";
const day="2026-10-27",settings={leadDays:90,requestSlaDays:3,updatedAt:null};
const employee:AlertEmployee={id:7,employee_number:"TEST",full_name_ar:"تجريبي",full_name_en:"Test",status:"active",
  nationality:"resident",contract_type:"fixed",contract_end:"2027-10-27",iqama_expiry:"2027-10-27",insurance_expiry:"2027-10-27",
  national_id:null,iqama_number:"0000000000",hire_date:"2020-01-01",phone:"0501234567",manager_id:null,manager_usable:false};
describe("HR alerts are evidence-based and actionable",()=>{
  it("includes overdue documents and records the Riyadh calendar-day distance",()=>{
    const alerts=generateHrAlerts([{...employee,iqama_expiry:"2026-10-26"}],[],settings,day);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({kind:"iqama_expiry",severity:"critical",daysRemaining:-1,dueDate:"2026-10-26",employeeId:7,href:"/hr/employees/7"});
  });
  it("treats expiry today as due today, not already expired",()=>{
    expect(generateHrAlerts([{...employee,insurance_expiry:day}],[],settings,day)[0]).toMatchObject({severity:"warning",daysRemaining:0});
  });
  it("applies the configurable horizon inclusively",()=>{
    expect(generateHrAlerts([{...employee,contract_end:"2027-01-25"}],[],settings,day)).toHaveLength(1);
    expect(generateHrAlerts([{...employee,contract_end:"2027-01-26"}],[],settings,day)).toHaveLength(0);
  });
  it("groups missing data as unknown rather than inventing expiry",()=>{
    const alerts=generateHrAlerts([{...employee,iqama_expiry:null,insurance_expiry:null,hire_date:null}],[],settings,day);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({kind:"missing_employee_data",dueDate:null,severity:"info"});
    expect(alerts[0].descriptionEn).toContain("does not mean");
  });
  it("never applies iqama expiry to Saudi employees or end-date alerts to open contracts",()=>{
    const alerts=generateHrAlerts([{...employee,nationality:"saudi",national_id:"0000000000",contract_type:"open",contract_end:"2020-01-01",iqama_expiry:"2020-01-01"}],[],settings,day);
    expect(alerts).toHaveLength(0);
  });
  it("ignores inactive employee cases but catches their phone collision with active accounts",()=>{
    const alerts=generateHrAlerts([employee,{...employee,id:8,status:"terminated",iqama_expiry:"2020-01-01"}],[],settings,day);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({employeeId:7,kind:"duplicate_phone"});
  });
  it("uses source-version keys so renewing a document creates a fresh unread alert",()=>{
    const a=generateHrAlerts([{...employee,iqama_expiry:"2026-10-26"}],[],settings,day)[0];
    const b=generateHrAlerts([{...employee,iqama_expiry:"2026-11-26"}],[],settings,day)[0];
    expect(a.key).not.toBe(b.key);expect(b.readAt).toBeNull();
    expect(a.key).not.toContain(employee.iqama_number!);
  });
  it("alerts on stalled workflow activity, not on fresh or already finalized requests",()=>{
    const alerts=generateHrAlerts([employee],[
      {id:1,employee_id:7,kind:"leave",date:"2026-10-24",status:"pending"},
      {id:2,employee_id:7,kind:"permission",date:"2026-10-26",status:"pending"}],settings,day);
    expect(alerts).toHaveLength(1);expect(alerts[0]).toMatchObject({kind:"pending_leave",daysRemaining:0});
  });
  it("only reminds upcoming return dates and never fabricates an absence",()=>{
    const alerts=generateHrAlerts([employee],[
      {id:1,employee_id:7,kind:"return",date:"2026-10-26",status:"approved"},
      {id:2,employee_id:7,kind:"return",date:"2026-10-01",status:"approved"}],settings,day);
    expect(alerts).toHaveLength(1);expect(alerts[0].descriptionEn).toContain("not an absence");
  });
  it("validates personal snooze reason and bounded duration",()=>{
    expect(alertStateInput.safeParse({key:"test:key",action:"snooze",days:3,note:"no"}).success).toBe(false);
    expect(alertStateInput.safeParse({key:"test:key",action:"snooze",days:180,note:"Valid reason"}).success).toBe(false);
    expect(alertStateInput.safeParse({key:"test:key",action:"snooze",days:3,note:"Verified follow-up"}).success).toBe(true);
    expect(alertStateInput.safeParse({key:"test:key",action:"resolve"}).success).toBe(false);
  });
  it("bounds settings, requires a version, and keeps the workspace isolated",()=>{
    expect(alertSettingsInput.safeParse({leadDays:181,requestSlaDays:3,expectedUpdatedAt:null}).success).toBe(false);
    expect(alertSettingsInput.safeParse({leadDays:90,requestSlaDays:3}).success).toBe(false);
    expect(isHrWorkspacePage("/hr/alerts")).toBe(true);
    expect(isHrWorkspaceApi("PATCH","/api/hr/alerts/state")).toBe(true);
    expect(isManagerApi("PATCH","/api/hr/alerts/state")).toBe(false);
  });
  it("rolls back a stale shared-settings save without overwriting another HR decision",async()=>{
    const query=vi.fn(async(sql:string)=>({rows:sql.includes("AS version")?[{version:"current",lead_days:90,request_sla_days:3}]:[]}));
    const release=vi.fn(),connect=vi.spyOn(pool,"connect").mockResolvedValue({query,release} as any);
    try{
      await expect(saveAlertSettings(1,{leadDays:30,requestSlaDays:7,expectedUpdatedAt:"stale"})).rejects.toMatchObject({status:409});
      expect(query.mock.calls.some(([sql])=>sql==="ROLLBACK")).toBe(true);
      expect(query.mock.calls.some(([sql])=>sql.startsWith("INSERT"))).toBe(false);
      expect(release).toHaveBeenCalledOnce();
    }finally{connect.mockRestore();}
  });
});
