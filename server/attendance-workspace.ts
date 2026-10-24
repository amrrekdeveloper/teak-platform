import type { Express, RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "./db";
import { insertLocationZoneSchema } from "../shared/schema";
import { bootstrapDepartmentCatalog, withDepartmentCatalogWrite } from "./department-catalog";

export function validateAttendanceZone(input:unknown) {
  const zone=insertLocationZoneSchema.parse(input);
  if(!zone.nameAr.trim()||!zone.nameEn.trim()||!Number.isFinite(Number(zone.centerLat))||
    !Number.isFinite(Number(zone.centerLng))||zone.centerLat==null||zone.centerLng==null||
    Math.abs(Number(zone.centerLat))>90||Math.abs(Number(zone.centerLng))>180)
    throw Object.assign(new Error("أدخل اسم الموقع وحدد مركزه على الخريطة."),{status:400});
  if(!(Array.isArray(zone.polygonCoords)&&zone.polygonCoords.length===4&&!zone.radiusMeters) &&
    (!Number.isInteger(zone.radiusMeters??200)||Number(zone.radiusMeters??200)<1||Number(zone.radiusMeters??200)>50000))
    throw Object.assign(new Error("النطاق يجب أن يكون من 1 إلى 50000 متر."),{status:400});
  return zone;
}

export async function initAttendanceWorkspace() {
  await pool.query(`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS attendance_zone_id integer REFERENCES location_zones(id);
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS attendance_schedule_id integer REFERENCES work_schedule_settings(id);
    ALTER TABLE work_schedule_settings ADD COLUMN IF NOT EXISTS location_zone_id integer REFERENCES location_zones(id);
    ALTER TABLE work_schedule_settings ADD COLUMN IF NOT EXISTS label_ar text;
    CREATE UNIQUE INDEX IF NOT EXISTS attendance_location_schedule_label
      ON work_schedule_settings(location_zone_id,label_ar) WHERE scope_type='location';
    CREATE TABLE IF NOT EXISTS attendance_corrections(
      id serial PRIMARY KEY,employee_id integer NOT NULL REFERENCES employees(id),
      business_day text NOT NULL,shift_key text NOT NULL,reason text NOT NULL,
      status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),
      review_note text,reviewed_by integer REFERENCES users(id),reviewed_at timestamptz,
      object_key text,mime_type text,created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS attendance_correction_open_once
      ON attendance_corrections(employee_id,business_day,shift_key) WHERE status IN('pending','approved');
    CREATE TABLE IF NOT EXISTS attendance_correction_history(
      id serial PRIMARY KEY,correction_id integer NOT NULL REFERENCES attendance_corrections(id),
      actor_id integer REFERENCES users(id),decision text NOT NULL,note text,created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  // Schema changes belong to Publish. Backfill only referenced codes, never deleted unused departments.
  await bootstrapDepartmentCatalog();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(51804)");
    // The database guard also protects concurrent delete/assignment races, including legacy APIs.
    await client.query(`CREATE OR REPLACE FUNCTION teak_attendance_assignment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.attendance_schedule_id IS NOT NULL AND NOT EXISTS(
          SELECT 1 FROM work_schedule_settings WHERE id=NEW.attendance_schedule_id
            AND location_zone_id=NEW.attendance_zone_id AND scope_type='location'
        ) THEN RAISE EXCEPTION 'Attendance schedule does not belong to assigned zone' USING ERRCODE='23514'; END IF;
        RETURN NEW;
      END $$;
      DROP TRIGGER IF EXISTS teak_attendance_assignment ON employees;
      CREATE TRIGGER teak_attendance_assignment BEFORE INSERT OR UPDATE OF attendance_zone_id,attendance_schedule_id
        ON employees FOR EACH ROW EXECUTE FUNCTION teak_attendance_assignment_guard()`);
    await client.query("COMMIT");
  } catch(error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export function registerDepartmentCatalog(app: Express, authorize: RequestHandler) {
  app.get("/api/hr/departments",authorize,async (_req,res)=>{
    try { res.json((await pool.query('SELECT id,code,name_ar AS "nameAr" FROM hr_departments ORDER BY id')).rows); }
    catch { res.status(500).json({message:"تعذّر تحميل الأقسام."}); }
  });
  app.post("/api/hr/departments",authorize,async (req,res)=>{
    const parsed=z.object({nameAr:z.string().trim().min(2).max(80)}).safeParse(req.body);
    if(!parsed.success)return res.status(400).json({message:"أدخل اسم قسم صحيحًا."});
    try {
      // Generated identifier only; no user input is interpolated into ALTER TYPE.
      const row = await withDepartmentCatalogWrite(async client => {
        const code=`dept_${randomUUID().replaceAll("-","")}`;
        await client.query(`ALTER TYPE department ADD VALUE IF NOT EXISTS '${code}'`);
        const {rows:[created]}=await client.query('INSERT INTO hr_departments(code,name_ar) VALUES($1,$2) RETURNING id,code,name_ar AS "nameAr"',[code,parsed.data.nameAr]);
        return created;
      });
      res.status(201).json(row);
    } catch(error:any) { res.status(error.status===503?503:error.code==="23505"?409:500).json({message:error.status===503?error.message:error.code==="23505"?"القسم موجود مسبقًا.":"تعذّرت إضافة القسم."}); }
  });
  app.delete("/api/hr/departments/:id",authorize,async (req,res)=>{
    try {
      const result=await withDepartmentCatalogWrite(client =>
        client.query("DELETE FROM hr_departments WHERE id=$1 RETURNING id",[Number(req.params.id)]));
      if(!result.rowCount)return res.status(404).json({message:"القسم غير موجود."});
      res.json({success:true});
    } catch(error:any) { res.status(error.status===503?503:error.code==="23503"?409:500).json({message:error.status===503?error.message:error.code==="23503"?"انقل جميع الموظفين من القسم قبل حذفه، بمن فيهم غير النشطين.":"تعذّر حذف القسم."}); }
  });
}

export async function validateEmployeeAttendanceAssignment(input: Record<string,unknown>, id?: number, connection: Pick<typeof pool, "query"> = pool) {
  if(input.department!==undefined&&!(await connection.query("SELECT 1 FROM hr_departments WHERE code::text=$1",[input.department])).rowCount)
    throw Object.assign(new Error("القسم غير موجود. اختر قسمًا من القائمة."),{status:400});
  const current=id?(await connection.query("SELECT attendance_zone_id,attendance_schedule_id FROM employees WHERE id=$1",[id])).rows[0]:undefined;
  const zone=input.attendanceZoneId===undefined?current?.attendance_zone_id:input.attendanceZoneId;
  const schedule=input.attendanceScheduleId===undefined?current?.attendance_schedule_id:input.attendanceScheduleId;
  for(const value of [zone,schedule])if(value!=null&&(!Number.isSafeInteger(value)||Number(value)<=0))
    throw Object.assign(new Error("اختر موقع بصمة وجدول دوام صحيحين."),{status:400});
  if(zone!=null&&!(await connection.query("SELECT 1 FROM location_zones WHERE id=$1 AND is_active=true",[zone])).rowCount)
    throw Object.assign(new Error("موقع البصمة غير موجود أو غير نشط."),{status:400});
  if(schedule!=null&&!(await connection.query("SELECT 1 FROM work_schedule_settings WHERE id=$1 AND location_zone_id=$2 AND scope_type='location'",[schedule,zone])).rowCount)
    throw Object.assign(new Error("جدول الدوام لا ينتمي لموقع بصمة الموظف."),{status:400});
}
