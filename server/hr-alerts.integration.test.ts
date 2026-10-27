import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { pool } from "./db";
import { employeeComplianceAlerts, listHrAlerts, updateAlertState } from "./hr-alerts";
const tag="ALERT-TEST-"+randomUUID().slice(0,12);
const users:number[]=[];let employeeId:number;
beforeAll(async()=>{
  if(process.env.NODE_ENV==="production"||process.env.REPLIT_DEPLOYMENT==="1")throw new Error("Development only");
  for(let i=0;i<2;i++){
    const {rows:[u]}=await pool.query(`INSERT INTO users(username,password,role,full_name_ar,full_name_en,active)
      VALUES($1,'unusable-test-hash','hr',$1,$1,false) RETURNING id`,[tag+i]);users.push(u.id);
  }
  const {rows:[d]}=await pool.query("SELECT code FROM hr_departments ORDER BY id LIMIT 1");
  const {rows:[e]}=await pool.query(`INSERT INTO employees(employee_number,full_name_ar,nationality,position,department,
    monthly_salary,contract_start,status,iqama_expiry,insurance_expiry,contract_end,contract_type)
    VALUES($1,$1,'resident','Test',$2,1,'2020-01-01','active',current_date-1,current_date+7,current_date+30,'fixed') RETURNING id`,[tag,d.code]);
  employeeId=e.id;
});
afterAll(async()=>{
  if(employeeId)await pool.query("DELETE FROM employees WHERE id=$1 AND employee_number=$2",[employeeId,tag]);
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    await client.query("SELECT id FROM users WHERE id=ANY($1::int[]) FOR UPDATE",[users]);
    await client.query("DELETE FROM notifications WHERE user_id=ANY($1::int[])",[users]);
    await client.query("DELETE FROM hr_alert_states WHERE user_id=ANY($1::int[])",[users]);
    await client.query("DELETE FROM hr_audit_log WHERE performed_by=ANY($1::int[])",[users]);
    await client.query("DELETE FROM users WHERE id=ANY($1::int[])",[users]);
    await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
  await pool.end();
});
it("reads all real source queries and only exposes the employee's own compliance alerts",async()=>{
  const hr=await listHrAlerts(users[0]),mine=await employeeComplianceAlerts(employeeId);
  expect(hr.items.some(a=>a.employeeId===employeeId&&a.kind==="iqama_expiry")).toBe(true);
  expect(mine.items).toHaveLength(3);
  expect(mine.items.every(a=>a.employeeId===employeeId&&a.category==="compliance"&&a.href==="")).toBe(true);
  expect((await employeeComplianceAlerts(-1)).items).toHaveLength(0);
});
it("persists read and snooze personally without hiding the alert for other HR users",async()=>{
  const alert=(await listHrAlerts(users[0])).items.find(a=>a.employeeId===employeeId&&a.kind==="iqama_expiry")!;
  await updateAlertState(users[0],{key:alert.key,action:"read"});
  await updateAlertState(users[0],{key:alert.key,action:"snooze",days:3,note:"Review uploaded renewal"});
  const own=(await listHrAlerts(users[0])).items.find(a=>a.key===alert.key)!;
  const other=(await listHrAlerts(users[1])).items.find(a=>a.key===alert.key)!;
  expect(own.readAt).not.toBeNull();expect(Date.parse(own.snoozedUntil!)).toBeGreaterThan(Date.now());
  expect(other.readAt).toBeNull();expect(other.snoozedUntil).toBeNull();
  await updateAlertState(users[0],{key:alert.key,action:"unsnooze"});
  await updateAlertState(users[0],{key:alert.key,action:"unread"});
  const reset=(await listHrAlerts(users[0])).items.find(a=>a.key===alert.key)!;
  expect(reset.snoozedUntil).toBeNull();expect(reset.readAt).toBeNull();
  await pool.query("UPDATE hr_alert_states SET snoozed_until=now()-interval '1 minute' WHERE user_id=$1 AND alert_key=$2",[users[0],alert.key]);
  expect((await listHrAlerts(users[0])).items.find(a=>a.key===alert.key)!.snoozedUntil).toBeNull();
});
it("rejects obsolete keys and audits state changes without modifying document dates",async()=>{
  await expect(updateAlertState(users[0],{key:"iqama_expiry:999:obsolete",action:"read"})).rejects.toMatchObject({status:409});
  const {rows:[count]}=await pool.query("SELECT count(*)::int AS total FROM hr_audit_log WHERE performed_by=$1 AND action='alert_state_changed'",[users[0]]);
  expect(count.total).toBe(4);
  const {rows:[e]}=await pool.query("SELECT iqama_expiry<current_date AS expired FROM employees WHERE id=$1",[employeeId]);
  expect(e.expired).toBe(true);
});
