/** Ephemeral browser-test data only. Never run against a deployment. */
import { randomUUID, randomBytes } from "node:crypto";
import { pool } from "../server/db";
import { hashPassword } from "../server/auth";
import { riyadhDateKey } from "../shared/attendance";
import { tokenHash } from "../server/employee-portal/security";
if(process.env.NODE_ENV!=="development"||process.env.REPLIT_DEPLOYMENT==="1")throw new Error("Development only");
const action=process.argv[2],tag=process.argv[3]||randomUUID().slice(0,8);
if(!/^[a-z0-9-]{3,40}$/.test(tag))throw new Error("Invalid fixture tag");
const marker=`ATT-UI-${tag}`;
try {
  if(action==="create") {
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const username=`att_ui_${tag}`,password=`Fixture-${randomUUID()}!`;
      const {rows:[hr]}=await client.query(`INSERT INTO users(username,password,role,full_name_ar,full_name_en,active,archived)
        VALUES($1,$2,'hr',$3,'Attendance test only',true,false) RETURNING id`,[username,await hashPassword(password),marker]);
      const {rows:[zone]}=await client.query(`INSERT INTO location_zones(name_ar,name_en,type,center_lat,center_lng,radius_meters,is_active)
        VALUES($1,$1,'other',24.7136,46.6753,100,true) RETURNING id`,[marker]);
      const shifts=[{id:"single",label:"دوام الاختبار",start:"00:00",end:"23:59",graceMinutes:0}];
      const {rows:[schedule]}=await client.query(`INSERT INTO work_schedule_settings
        (scope_type,location_zone_id,label_ar,work_start_time,work_end_time,grace_minutes,shifts)
        VALUES('location',$1,$2,'00:00','23:59',0,$3) RETURNING id`,[zone.id,marker,JSON.stringify(shifts)]);
      let phone="";
      for(let i=0;i<20;i++){
        phone=`050${String(Math.floor(Math.random()*10000000)).padStart(7,"0")}`;
        if(!(await client.query("SELECT 1 FROM employees WHERE teak_hr_phone(phone)=teak_hr_phone($1)",[phone])).rowCount)break;
        phone="";
      }
      if(!phone)throw new Error("Fixture phone allocation failed");
      const {rows:[employee]}=await client.query(`INSERT INTO employees(employee_number,full_name_ar,nationality,position,department,
        monthly_salary,contract_start,status,phone,attendance_enabled,attendance_zone_id,attendance_schedule_id)
        VALUES($1,$1,'saudi','اختبار واجهة','hr',1,$2,'active',$3,true,$4,$5) RETURNING id`,
      [marker,riyadhDateKey(new Date(Date.now()-15*86400000)),phone,zone.id,schedule.id]);
      const day=riyadhDateKey(new Date(Date.now()-86400000));
      await client.query("INSERT INTO attendance_day_schedules(employee_id,business_day,shifts) VALUES($1,$2,$3)",[employee.id,day,JSON.stringify(shifts)]);
      for(const [type,time]of[["check_in","08:30"],["check_out","14:00"]])await client.query(`INSERT INTO attendance_records
        (employee_id,type,check_time,shift_key,location_name) VALUES($1,$2,$3::timestamptz AT TIME ZONE 'UTC','single',$4)`,
      [employee.id,type,`${day}T${time}:00+03:00`,marker]);
      let movementFixture = {};
      if(process.argv[4] === "movements") {
        const today=riyadhDateKey(new Date()), portalToken=randomBytes(32).toString("hex");
        await client.query("INSERT INTO attendance_day_schedules(employee_id,business_day,shifts) VALUES($1,$2,$3)",[employee.id,today,JSON.stringify(shifts)]);
        const punchIds: number[]=[];
        for(const [type,minutes]of[["check_in",16],["check_out",2]] as const) {
          const {rows:[punch]}=await client.query(`INSERT INTO attendance_records
            (employee_id,employee_name_ar,type,check_time,shift_key,location_name)
            VALUES($1,$2,$3,$4::timestamptz AT TIME ZONE 'UTC','single',$2) RETURNING id`,
          [employee.id,marker,type,new Date(Date.now()-minutes*60000).toISOString()]);
          punchIds.push(punch.id);
        }
        await client.query(`INSERT INTO employee_portal_devices
          (id,employee_id,phone,token_hash,device_name,expires_at,auth_mode)
          VALUES($1,$2,teak_hr_phone($3),$4,'Isolated browser test',now()+interval '1 hour','sms')`,
        [randomUUID(),employee.id,phone,tokenHash(portalToken)]);
        movementFixture={today,punchIds,portalToken};
      }
      await client.query("COMMIT");
      console.log(JSON.stringify({tag,marker,username,password,phone,employeeId:employee.id,hrId:hr.id,zoneId:zone.id,scheduleId:schedule.id,day,...movementFixture}));
    }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  }else if(action==="cleanup"){
    const {rows}=await pool.query("SELECT id FROM employees WHERE employee_number=$1",[marker]);
    for(const {id}of rows){
      await pool.query("DELETE FROM notifications WHERE related_entity='employee' AND related_id=$1",[id]);
      const files=(await pool.query("SELECT object_key FROM attendance_corrections WHERE employee_id=$1 AND object_key IS NOT NULL",[id])).rows;
      if(files.length){const{deleteObjectFile}=await import("../server/objectFileStore");for(const file of files)await deleteObjectFile("hr-medical-private",file.object_key);}
      await pool.query("DELETE FROM attendance_correction_history WHERE correction_id IN(SELECT id FROM attendance_corrections WHERE employee_id=$1)",[id]);
      await pool.query("DELETE FROM notifications WHERE related_entity='attendance_correction' AND related_id IN(SELECT id FROM attendance_corrections WHERE employee_id=$1)",[id]);
      await pool.query("DELETE FROM attendance_corrections WHERE employee_id=$1",[id]);
      for(const table of ["employee_portal_otps","employee_portal_devices","attendance_audit_log","attendance_records","attendance_day_schedules","attendance_calendar_reviews","attendance_day_calendars","attendance_violations","attendance_monthly_risk","risk_alerts"])
        await pool.query(`DELETE FROM ${table} WHERE employee_id=$1`,[id]);
      await pool.query("DELETE FROM attendance_week_policies WHERE employee_id=$1",[id]);
      await pool.query("DELETE FROM hr_audit_log WHERE employee_id=$1",[id]);
      await pool.query("DELETE FROM employees WHERE id=$1",[id]);
    }
    await pool.query("DELETE FROM work_schedule_settings WHERE label_ar=$1",[marker]);
    await pool.query("DELETE FROM location_zones WHERE name_ar=$1",[marker]);
    await pool.query("DELETE FROM notifications WHERE user_id IN(SELECT id FROM users WHERE username=$1)",[`att_ui_${tag}`]);
    await pool.query("DELETE FROM user_sessions WHERE sess->>'userId' IN(SELECT id::text FROM users WHERE username=$1)",[`att_ui_${tag}`]);
    await pool.query("DELETE FROM hr_audit_log WHERE performed_by IN(SELECT id FROM users WHERE username=$1)",[`att_ui_${tag}`]);
    await pool.query("DELETE FROM users WHERE username=$1 AND full_name_ar=$2",[`att_ui_${tag}`,marker]);
    console.log("Fixture removed");
  }else throw new Error("Use create|cleanup");
}finally{await pool.end();}
