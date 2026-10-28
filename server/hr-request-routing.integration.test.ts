import {describe,it,expect} from "vitest";
import { randomUUID } from "node:crypto";
import { pool } from "./db";
import { captureRequestRouting,saveRequestSettings,effectiveRequestManager } from "./hr-request-routing";
if(process.env.NODE_ENV==="production"||process.env.REPLIT_DEPLOYMENT==="1")throw new Error("Development-only tests");

describe("request routing with PostgreSQL (all configuration writes rolled back)",()=>{
  it("uses optimistic versions, captures new routing, strips client metadata and never reroutes a snapshot",async()=>{
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const {rows:[old]}=await client.query("SELECT version FROM hr_request_settings WHERE kind='permission'");
      const current=old?.version||0;
      const saved=await saveRequestSettings("permission",{managerReview:false,requireManager:false,version:current},null,client);
      expect(saved.version).toBe(current+1);
      await expect(saveRequestSettings("permission",{managerReview:true,requireManager:false,version:current},null,client))
        .rejects.toMatchObject({status:409});
      // Own fixture, inside the rollback: never depend on a real employee or
      // another suite temporarily populating this otherwise empty schema.
      await client.query("INSERT INTO hr_departments(code,name_ar) VALUES('hr','Synthetic HR') ON CONFLICT(code) DO NOTHING");
      const marker=`ROUTING-${randomUUID()}`;
      const {rows:[employee]}=await client.query(`INSERT INTO employees
        (employee_number,full_name_ar,nationality,position,department,monthly_salary,contract_start,status)
        VALUES($1,$1,'saudi','Synthetic routing','hr',1,'2026-01-01','active') RETURNING id`,[marker]);
      const captured=await captureRequestRouting("permission",employee.id,{purpose:"personal",
        _approval:{managerReview:true,managerUserId:99999},_attachments:[{key:"forged"}]},client);
      expect(captured.purpose).toBe("personal");expect(captured).not.toHaveProperty("_attachments");
      expect(captured._approval.managerReview).toBe(false);
      expect(effectiveRequestManager(captured,{manager_id:99999,manager_user_id:88888})).toEqual({manager_id:null,manager_user_id:null});
      expect(effectiveRequestManager(null,{manager_id:17,manager_user_id:18})).toEqual({manager_id:17,manager_user_id:18});
    }finally{await client.query("ROLLBACK");client.release();}
  });
  it("blocks an invalid HR-only configuration before any database change",async()=>{
    await expect(saveRequestSettings("leave",{managerReview:false,requireManager:true,version:0},null))
      .rejects.toMatchObject({status:400});
  });
});
