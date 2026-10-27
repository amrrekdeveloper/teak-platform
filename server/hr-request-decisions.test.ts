import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  row: {} as any, employee: {} as any, role:"hr", approved:false,
  statements:[] as string[], status:"", release:vi.fn(),
}));
vi.mock("./db",()=>({
  db:{},
  pool:{connect:async()=>({
    release:state.release,
    query:async(text:string,values:any[]=[])=>{
      state.statements.push(text);
      if(text.startsWith("SELECT * FROM leave_requests") || text.startsWith("SELECT * FROM attendance_permissions"))
        return {rows:[state.row]};
      if(text.includes("SELECT e.manager_id"))return {rows:[state.employee]};
      if(text.startsWith("SELECT role"))return {rows:[{role:state.role}]};
      if(text.includes("SELECT 1 FROM hr_request_history"))return {rows:[],rowCount:state.approved?1:0};
      if(text.startsWith("SELECT id FROM leave_requests WHERE employee_id"))return {rows:[],rowCount:0};
      if(text.startsWith("UPDATE "))state.status=values[1];
      return {rows:[],rowCount:1};
    },
  })},
}));
import { decideHrRequest } from "./hr-workflow-support";

beforeEach(()=>{
  state.row={id:2,employee_id:7,status:"pending"};
  state.employee={manager_id:10,manager_user_id:12};
  state.role="hr";state.approved=false;state.statements=[];state.status="";state.release.mockClear();
});
describe("request decision authorization (mocked database)",()=>{
  it("denies HR bypass and rolls back without mutation",async()=>{
    await expect(decideHrRequest("leave",2,9,"approve")).rejects.toMatchObject({status:403});
    expect(state.status).toBe("");
    expect(state.statements.at(-1)).toBe("ROLLBACK");
  });
  it("moves actual manager approval to manager_approved, not final",async()=>{
    await decideHrRequest("permission",2,12,"approve");
    expect(state.status).toBe("manager_approved");
    expect(state.statements.some(s=>s.includes("FOR UPDATE"))).toBe(true);
    expect(state.statements.some(s=>s.startsWith("INSERT INTO hr_request_history"))).toBe(true);
    expect(state.statements.at(-1)).toBe("COMMIT");
  });
  it("allows HR final only after manager approval",async()=>{
    state.row.status="manager_approved";
    await decideHrRequest("leave",2,9,"approve");
    expect(state.status).toBe("approved");
  });
  it("denies unrelated and non-HR final reviewers",async()=>{
    state.role="sales";state.row.status="manager_approved";
    await expect(decideHrRequest("permission",2,12,"approve")).rejects.toMatchObject({status:403});
  });
  it("uses HR directly when no manager exists",async()=>{
    state.employee={manager_id:null};
    await decideHrRequest("permission",2,9,"approve");
    expect(state.status).toBe("approved");
  });
  it("preserves historical auto approval without mutation",async()=>{
    state.row.status="auto_approved";
    await expect(decideHrRequest("permission",2,9,"reject","reason")).rejects.toMatchObject({status:409});
    expect(state.status).toBe("");
  });
  it("requires clarification/rejection reasons",async()=>{
    await expect(decideHrRequest("leave",2,12,"clarify")).rejects.toMatchObject({status:400});
    await expect(decideHrRequest("leave",2,12,"reject")).rejects.toMatchObject({status:400});
  });
  it("allows a reasoned explicit HR override and refuses an unreasoned bypass",async()=>{
    await expect(decideHrRequest("leave",2,9,"approve",null,{overrideManager:true})).rejects.toMatchObject({status:400});
    await decideHrRequest("leave",2,9,"approve","تعذر وصول المدير؛ اعتماد الموارد البشرية",{overrideManager:true});
    expect(state.status).toBe("approved");
  });
  it("never permits an unrelated role to use the administrative override",async()=>{
    state.role="sales";
    await expect(decideHrRequest("leave",2,9,"approve","سبب واضح",{overrideManager:true})).rejects.toMatchObject({status:403});
  });
  it("retains HR stage after HR requests clarification",async()=>{
    state.row.status="clarification_requested";state.approved=true;
    await decideHrRequest("permission",2,9,"approve");
    expect(state.status).toBe("approved");
  });
});
