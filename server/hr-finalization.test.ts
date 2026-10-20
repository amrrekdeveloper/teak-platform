import { beforeEach,describe,expect,it,vi } from "vitest";
const state=vi.hoisted(()=>({
  row:{} as any,selects:[] as any[][],failInsert:false,commits:0,rollbacks:0,inserts:0,
}));
vi.mock("./db",()=>({
  pool:{},
  db:{transaction:async(fn:any)=>{
    const before=structuredClone(state.row),beforeInserts=state.inserts;
    const tx={
      update:()=>({set:(values:any)=>({where:()=>{
        Object.assign(state.row,values);
        return {returning:async()=>[{...state.row}],then:(resolve:any)=>Promise.resolve(resolve(undefined))};
      }})}),
      select:()=>({from:()=>({where:()=>{
        const rows=state.selects.shift() ?? [{...state.row}];
        const result=Promise.resolve(rows) as any;result.for=()=>Promise.resolve(rows);return result;
      }})}),
      insert:()=>({values:()=>({returning:async()=>{
        state.inserts++;if(state.failInsert)throw new Error("injected insert failure");
        return [{id:88,employeeNumber:"EMP-WF-5"}];
      }})}),
    };
    try{const result=await fn(tx);state.commits++;return result;}
    catch(e){state.row=before;state.inserts=beforeInserts;state.rollbacks++;throw e;}
  }},
}));
import { advanceHrActionVersioned,assertTerminationDue } from "./hr-workflow-support";
beforeEach(()=>{state.row={id:5,employeeId:null,linkedActionId:null,workflow:"wf03",currentStep:1,status:"in_progress",timeline:[],formData:{
  candidateName:"Test",candidatePhone:"0501234567",position:"Role",department:"hr",
  nationality:"saudi",monthlySalary:"5000",startDate:"2026-01-01",
}};state.selects=[];state.failInsert=false;state.commits=0;state.rollbacks=0;state.inserts=0;});
describe("existing HR engine transactional finalization (fault-injected transaction adapter)",()=>{
  it("rolls back finalization if employee insertion fails instead of swallowing failure",async()=>{
    state.failInsert=true;
    await expect(advanceHrActionVersioned({...state.row}, {status:"completed"})).rejects.toThrow("injected insert failure");
    expect(state.row.status).toBe("in_progress");expect(state.inserts).toBe(0);
    expect(state.rollbacks).toBe(1);expect(state.commits).toBe(0);
  });
  it("commits employee creation and action employee linkage together",async()=>{
    const result=await advanceHrActionVersioned({...state.row},{status:"completed"});
    expect(state.row.status).toBe("completed");expect(state.row.employeeId).toBe(88);
    expect(result?.chained?.employeeId).toBe(88);expect(state.commits).toBe(1);
  });
  it("rolls back finalization when automatic next-action insertion fails",async()=>{
    state.row.workflow="wf06b";state.row.employeeId=7;state.row.formData={contractEnd:"2026-01-01"};
    state.selects=[[]];state.failInsert=true;
    await expect(advanceHrActionVersioned({...state.row},{status:"completed"})).rejects.toThrow();
    expect(state.row.status).toBe("in_progress");expect(state.rollbacks).toBe(1);
  });
  it("does not insert a duplicate existing chain",async()=>{
    state.row.workflow="wf06b";state.row.employeeId=7;
    state.selects=[[{id:9,workflow:"wf05",status:"pending"}]];
    const result=await advanceHrActionVersioned({...state.row},{status:"completed"});
    expect(result?.chained?.id).toBe(9);expect(state.inserts).toBe(0);
  });
  it("blocks future scheduled termination; due date grants no approval",()=>{
    expect(()=>assertTerminationDue("wf05","wf06b","2027-01-01","2026-12-31")).toThrow();
    expect(()=>assertTerminationDue("wf05","wf06b","2027-01-01","2027-01-01")).not.toThrow();
    expect(()=>assertTerminationDue("wf05",undefined,undefined,"2026-01-01")).not.toThrow();
    expect(()=>assertTerminationDue("wf05","wf06b","")).toThrow();
  });
});
