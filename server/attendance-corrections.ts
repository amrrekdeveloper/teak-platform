import type { Express, RequestHandler, Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "./db";
import { identity, asyncRoute, portalError } from "./employee-portal/router";
import { validDate } from "./employee-portal/security";
import { takeLimit } from "./employee-portal/database";
import { medicalMime, medicalDocumentRole } from "./employee-portal/medical-documents";
import { employeeAttendanceReport } from "./attendance-support";
import { riyadhDateKey } from "../shared/attendance";
import { saveObjectFile, deleteObjectFile, streamObjectFile } from "./objectFileStore";

const columns=`c.id,c.employee_id AS "employeeId",c.business_day AS "businessDay",
 c.shift_key AS "shiftKey",c.reason,c.status,c.review_note AS "reviewNote",
 c.created_at AS "createdAt",(c.object_key IS NOT NULL) AS "hasAttachment"`;
export async function attendanceCorrections(employeeId: number, from?: string,to?:string) {
  return (await pool.query(`SELECT ${columns} FROM attendance_corrections c
    WHERE c.employee_id=$1 AND ($2::text IS NULL OR c.business_day>=$2)
      AND ($3::text IS NULL OR c.business_day<=$3) ORDER BY c.id DESC LIMIT 500`,
  [employeeId,from??null,to??null])).rows;
}
export function applyAttendanceCorrection<T extends {status:string;late:boolean|null;lateMinutes:number|null;
  earlyDepartureMinutes:number|null;outOfZone:boolean}>(row:T,correction?:{id:number;status:string}) {
  if(!correction)return row;
  if(correction.status!=="approved")return {...row,correctionStatus:correction.status,correctionId:correction.id,excused:false};
  return {...row,observedStatus:row.status,observedLateMinutes:row.lateMinutes,
    observedEarlyDepartureMinutes:row.earlyDepartureMinutes,observedOutOfZone:row.outOfZone,
    status:"excused",late:false,lateMinutes:0,earlyDepartureMinutes:0,outOfZone:false,
    correctionStatus:"approved",correctionId:correction.id,excused:true};
}
export function hasAttendanceDeficiency(row:{status:string;late:boolean|null;earlyDepartureMinutes:number|null;outOfZone:boolean;scheduleVerified:boolean}) {
  return row.scheduleVerified && (row.late || (row.earlyDepartureMinutes??0)>0 ||
    row.outOfZone || ["absent","missing_checkin","missing_checkout"].includes(row.status));
}
const receive:RequestHandler=(req,res,next)=>multer({storage:multer.memoryStorage(),limits:{fileSize:5242880,files:1,fields:0}})
  .single("file")(req,res,error=>error?res.status(400).json({message:"أرفق ملفًا واحدًا لا يتجاوز 5 ميغابايت."}):next());
const folder="hr-medical-private";
async function download(id:number,res:Parameters<RequestHandler>[1],employeeId?:number) {
  if(!Number.isSafeInteger(id)||id<=0)portalError(400,"معرّف طلب غير صحيح.");
  const {rows:[row]}=await pool.query(`SELECT object_key,mime_type FROM attendance_corrections
    WHERE id=$1 AND ($2::integer IS NULL OR employee_id=$2)`,[id,employeeId??null]);
  if(!row?.object_key)portalError(404,"المرفق غير موجود.");
  res.set({"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox"});
  if(!await streamObjectFile(folder,row.object_key,res,{contentType:row.mime_type,disposition:'attachment; filename="attendance-explanation"'}))
    portalError(404,"المرفق غير موجود.");
}
export function registerEmployeeCorrections(router:Router) {
  router.get("/attendance/history",asyncRoute(async(req,res)=>{
    const today=riyadhDateKey(new Date());
    const from=typeof req.query.from==="string"?req.query.from:riyadhDateKey(new Date(Date.now()-29*86400000));
    const to=typeof req.query.to==="string"?req.query.to:today;
    if(!validDate(from)||!validDate(to)||from>to||to>today||Date.parse(to)-Date.parse(from)>92*86400000)
      portalError(400,"اختر فترة صحيحة لا تتجاوز 93 يومًا.");
    const employeeId=identity(res).employee.id;
    res.json({...await employeeAttendanceReport(employeeId,from,to),corrections:await attendanceCorrections(employeeId,from,to)});
  }));
  router.post("/attendance/corrections",asyncRoute(async(req,res)=>{
    const employee=identity(res).employee;
    const input=z.object({businessDay:z.string().refine(validDate),shiftKey:z.string().min(1).max(30),
      reason:z.string().trim().min(3).max(2000)}).strict().parse(req.body);
    if(input.businessDay>riyadhDateKey(new Date()))portalError(400,"لا يمكن معالجة يوم مستقبلي.");
    const report=await employeeAttendanceReport(employee.id,input.businessDay,input.businessDay);
    const row=report.rows.find(r=>r.shiftId===input.shiftKey);
    if(!row||!hasAttendanceDeficiency(row))portalError(409,"لا يوجد تقصير موثّق قابل للمعالجة في هذه الفترة.");
    if(!await takeLimit(`correction:${employee.id}`,20,900))portalError(429,"طلبات متكررة؛ حاول لاحقًا.");
    const client=await pool.connect();
    try {
      await client.query("BEGIN");
      const inserted=await client.query(`INSERT INTO attendance_corrections(employee_id,business_day,shift_key,reason)
        VALUES($1,$2,$3,$4) ON CONFLICT(employee_id,business_day,shift_key) WHERE status IN('pending','approved')
        DO NOTHING RETURNING id,status`,[employee.id,input.businessDay,input.shiftKey,input.reason]);
      const created=inserted.rows[0]??(await client.query(`SELECT id,status FROM attendance_corrections WHERE employee_id=$1
        AND business_day=$2 AND shift_key=$3 AND status IN('pending','approved')`,
      [employee.id,input.businessDay,input.shiftKey])).rows[0];
      if(inserted.rowCount) {
        await client.query("INSERT INTO attendance_correction_history(correction_id,decision,note) VALUES($1,'submitted',$2)",[created.id,input.reason]);
        await client.query(`INSERT INTO notifications(user_id,title_ar,title_en,message_ar,message_en,type,related_entity,related_id)
          SELECT id,'طلب معالجة تقصير','Attendance correction',$2,'Employee attendance explanation','info'::notification_type,
          'attendance_correction',$1 FROM users WHERE active=true AND role IN('owner','hr')`,[created.id,`${employee.full_name_ar} · ${input.businessDay}`]);
      }
      await client.query("COMMIT");
      res.status(inserted.rowCount?201:200).json(created);
    } catch(error) {await client.query("ROLLBACK");throw error;}finally{client.release();}
  }));
  router.post("/attendance/corrections/:id/attachment",receive,asyncRoute(async(req,res)=>{
    const employeeId=identity(res).employee.id;
    const file=req.file;
    const mime=file&&medicalMime(file.buffer,file.mimetype);
    if(!file||!mime)portalError(400,"يسمح بملف PDF أو صورة PNG/JPEG أصلية فقط.");
    const client=await pool.connect();let key:string|undefined;let oldKey:string|undefined;
    try {
      await client.query("BEGIN");
      const {rows:[row]}=await client.query("SELECT * FROM attendance_corrections WHERE id=$1 AND employee_id=$2 FOR UPDATE",[Number(req.params.id),employeeId]);
      if(!row)portalError(404,"الطلب غير موجود.");
      if(row.status!=="pending")portalError(409,"لا يمكن تغيير مرفق طلب تمت مراجعته.");
      if(!await takeLimit(`correction-upload:${employeeId}`,20,900))portalError(429,"محاولات رفع متكررة.");
      key=`corrections/${randomUUID()}`;oldKey=row.object_key;
      await saveObjectFile(folder,key,file!.buffer,mime!);
      await client.query("UPDATE attendance_corrections SET object_key=$2,mime_type=$3 WHERE id=$1",[row.id,key,mime]);
      await client.query("COMMIT");
      if(oldKey)await deleteObjectFile(folder,oldKey).catch(()=>{});
      res.json({success:true});
    }catch(error){await client.query("ROLLBACK");if(key)await deleteObjectFile(folder,key).catch(()=>{});throw error;}
    finally{client.release();}
  }));
  router.get("/attendance/corrections/:id/attachment",asyncRoute(async(req,res)=>download(Number(req.params.id),res,identity(res).employee.id)));
}
export async function decideAttendanceCorrection(id:number,actorId:number,decision:"approved"|"rejected",note:string) {
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const {rows:[pending]}=await client.query("SELECT employee_id,business_day,shift_key,status FROM attendance_corrections WHERE id=$1 FOR UPDATE",[id]);
    if(!pending||pending.status!=="pending")portalError(409,"الطلب غير موجود أو تمت مراجعته سابقًا.");
    if(decision==="approved"){
      const report=await employeeAttendanceReport(pending.employee_id,pending.business_day,pending.business_day);
      const row=report.rows.find(r=>r.shiftId===pending.shift_key);
      // A day-level approval must not forgive a future missing checkout or early departure.
      if(!row?.scheduleVerified||row.ended!==true)
        portalError(409,"يمكن اعتماد المعالجة بعد نهاية الفترة؛ يبقى الطلب قيد المراجعة حتى اكتمالها.");
    }
    const result=await client.query(`UPDATE attendance_corrections SET status=$2,review_note=$3,reviewed_by=$4,reviewed_at=now()
      WHERE id=$1 AND status='pending' RETURNING id,employee_id`,[id,decision,note,actorId]);
    if(!result.rowCount)portalError(409,"الطلب غير موجود أو تمت مراجعته سابقًا.");
    await client.query(`INSERT INTO attendance_correction_history(correction_id,actor_id,decision,note) VALUES($1,$2,$3,$4)`,[id,actorId,decision,note]);
    await client.query("COMMIT");
    return {success:true};
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
export function registerHrCorrections(app:Express,authorize:RequestHandler) {
  app.get("/api/attendance/corrections",authorize,medicalDocumentRole,asyncRoute(async(_req,res)=>{
    res.json((await pool.query(`SELECT ${columns},e.full_name_ar AS "employeeName",e.employee_number AS "employeeNumber"
      FROM attendance_corrections c JOIN employees e ON e.id=c.employee_id ORDER BY c.id DESC LIMIT 500`)).rows);
  }));
  app.get("/api/attendance/corrections/:id/attachment",authorize,medicalDocumentRole,asyncRoute(async(req,res)=>download(Number(req.params.id),res)));
  app.post("/api/attendance/corrections/:id/decision",authorize,medicalDocumentRole,asyncRoute(async(req,res)=>{
    const input=z.object({decision:z.enum(["approved","rejected"]),note:z.string().trim().max(2000).default("")}).strict().parse(req.body);
    if(input.decision==="rejected"&&input.note.length<3)portalError(400,"اكتب سبب رفض المعالجة.");
    res.json(await decideAttendanceCorrection(Number(req.params.id),req.session.userId!,input.decision,input.note));
  }));
}
