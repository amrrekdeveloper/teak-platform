import { Router,type Express,type RequestHandler } from "express";
import { z } from "zod";
import multer from "multer";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "./db";
import { requestTable,requestDataColumn,getRequestSettings,saveRequestSettings,type RequestKind } from "./hr-request-routing";
import { identity } from "./employee-portal/router";
import { medicalMime } from "./employee-portal/medical-documents";
import { saveObjectFile,deleteObjectFile,streamObjectFile } from "./objectFileStore";

function fail(status:number,message:string):never {throw Object.assign(new Error(message),{status});}
const endpoint=(fn:RequestHandler):RequestHandler=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(e=>{
  if(e instanceof z.ZodError)return res.status(400).json({message:"تحقق من الحقول والفترة المحددة."});
  if(!e.status)console.error("HR request center:",e.message);
  res.status(e.status||500).json({message:e.status?e.message:"تعذر تحميل البيانات. أعد المحاولة."});
});
const kindSchema=z.enum(["leave","permission"]);
const inputId=z.coerce.number().int().positive();
const terminal=["approved","auto_approved","rejected","cancelled"];
const fileShape=z.object({id:z.string().uuid(),name:z.string(),mime:z.string(),size:z.number(),key:z.string(),createdAt:z.string()});
type Attachment=z.infer<typeof fileShape>;
const readFiles=(data:any):Attachment[]=>{
  if(data?._attachments===undefined||data?._attachments===null)return [];
  const parsed=z.array(fileShape).safeParse(data._attachments);
  if(!parsed.success)fail(409,"تعذر قراءة سجل المرفقات؛ راجع الدعم دون استبدال المستندات.");
  return parsed.data;
};
const projection=(f:Attachment)=>({id:f.id,name:f.name,mime:f.mime,size:f.size,createdAt:f.createdAt});
const upload:RequestHandler=(req,res,next)=>multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1,fields:0}})
  .single("file")(req,res,e=>e?res.status(400).json({message:"أرفق PDF أو صورة، بحد أقصى 5 ميغابايت."}):next());

async function fileRequest(kind:RequestKind,id:number,actor:{userId?:number;employeeId?:number},client:any=pool,lock=false) {
  const {rows:[row]}=await client.query(`SELECT id,employee_id,status,${requestDataColumn(kind)} AS data
    FROM ${requestTable(kind)} WHERE id=$1 ${lock?"FOR UPDATE":""}`,[id]);
  if(!row)fail(404,"الطلب غير موجود.");
  if(actor.employeeId!==undefined) {
    if(row.employee_id!==actor.employeeId)fail(404,"الطلب غير موجود.");
  } else {
    const {rows:[user]}=await client.query("SELECT role,active,archived FROM users WHERE id=$1",[actor.userId]);
    if(!user?.active||user.archived||!["owner","hr"].includes(user.role))fail(403,"المرفقات خاصة بالموظف والموارد البشرية.");
  }
  return row;
}
function registerFiles(router:Router,prefix:string,guard:RequestHandler,employee:boolean) {
  const actor=(req:any,res:any)=>employee?{employeeId:identity(res).employee.id}:{userId:req.session.userId};
  router.get(`${prefix}/:kind/:id/attachments`,guard,endpoint(async(req,res)=>{
    const kind=kindSchema.parse(req.params.kind),id=inputId.parse(req.params.id);
    const row=await fileRequest(kind,id,actor(req,res));
    res.json({items:readFiles(row.data).map(projection),canUpload:!terminal.includes(row.status),maxBytes:5242880});
  }));
  router.post(`${prefix}/:kind/:id/attachments`,guard,upload,endpoint(async(req,res)=>{
    const kind=kindSchema.parse(req.params.kind),id=inputId.parse(req.params.id),who=actor(req,res);
    // Authorize before storing anything; ownership is rechecked under the row lock.
    const before=await fileRequest(kind,id,who);
    if(terminal.includes(before.status))fail(409,"الطلب منتهٍ؛ لا يمكن تغيير مستنداته.");
    if(readFiles(before.data).length>=5)fail(409,"الحد الأقصى خمسة مرفقات لكل طلب.");
    const file=req.file;
    const mime=file?medicalMime(file.buffer,file.mimetype):null;
    if(!file||!mime)fail(400,"الملف غير صالح. استخدم PDF أو JPEG أو PNG.");
    const decoded=Buffer.from(file.originalname,"latin1").toString("utf8");
    const filename=decoded.includes("\uFFFD")?file.originalname:decoded;
    const attachment:Attachment={id:randomUUID(),name:filename.replace(/[^\p{L}\p{N} ._()-]/gu,"_").slice(0,120),
      mime,size:file.size,key:"",createdAt:new Date().toISOString()};
    attachment.key=`${attachment.id}.${mime==="application/pdf"?"pdf":mime==="image/png"?"png":"jpg"}`;
    await saveObjectFile("hr-request-private",attachment.key,file.buffer,mime);
    let client:PoolClient|undefined,committed=false;
    try{
      client=await pool.connect();
      await client.query("BEGIN");
      const row=await fileRequest(kind,id,who,client,true),files=readFiles(row.data);
      if(terminal.includes(row.status))fail(409,"الطلب منتهٍ؛ لا يمكن تغيير مستنداته.");
      if(files.length>=5)fail(409,"الحد الأقصى خمسة مرفقات لكل طلب.");
      await client.query(`UPDATE ${requestTable(kind)} SET ${requestDataColumn(kind)}=$2::jsonb WHERE id=$1`,
        [id,JSON.stringify({...row.data,_attachments:[...files,attachment]})]);
      await client.query(`INSERT INTO hr_request_history(kind,request_id,employee_id,actor_user_id,actor_employee_id,decision,previous_status,next_status,note)
        VALUES($1,$2,$3,$4,$5,'attachment_added',$6,$6,$7)`,
        [kind,id,row.employee_id,who.userId||null,who.employeeId||null,row.status,attachment.name]);
      await client.query("COMMIT");
      committed=true;
      res.status(201).json(projection(attachment));
    }catch(e){if(!committed){await client?.query("ROLLBACK").catch(()=>{});await deleteObjectFile("hr-request-private",attachment.key).catch(()=>{});}throw e;}
    finally{client?.release();}
  }));
  router.get(`${prefix}/:kind/:id/attachments/:fileId`,guard,endpoint(async(req,res)=>{
    const kind=kindSchema.parse(req.params.kind),id=inputId.parse(req.params.id);
    const row=await fileRequest(kind,id,actor(req,res));
    const file=readFiles(row.data).find(f=>f.id===req.params.fileId);
    if(!file)fail(404,"المرفق غير موجود.");
    res.setHeader("Cache-Control","private, no-store");res.setHeader("X-Content-Type-Options","nosniff");
    res.setHeader("Content-Type",file.mime);
    res.setHeader("Content-Disposition",`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    if(!await streamObjectFile("hr-request-private",file.key,res))fail(404,"المرفق غير موجود في التخزين.");
  }));
}
export function registerEmployeeRequestAttachments(router:Router) {
  registerFiles(router,"/requests",(_req,_res,next)=>next(),true);
}
export function registerHrRequestCenter(app:Express,authorize:RequestHandler) {
  const files=Router();
  registerFiles(files,"/api/hr/requests",authorize,false);
  app.use(files);
  app.get("/api/hr/request-settings",authorize,endpoint(async(_req,res)=>res.json(await getRequestSettings())));
  app.put("/api/hr/request-settings/:kind",authorize,endpoint(async(req,res)=>{
    const kind=kindSchema.parse(req.params.kind);
    const input=z.object({managerReview:z.boolean(),requireManager:z.boolean(),version:z.number().int().nonnegative()}).strict().parse(req.body);
    res.json(await saveRequestSettings(kind,input,req.session.userId!,pool));
  }));
  app.get("/api/hr/overview",authorize,endpoint(async(_req,res)=>{
    const {rows:[data]}=await pool.query(`SELECT
      (SELECT count(*)::int FROM employees) AS total,
      (SELECT count(*)::int FROM employees WHERE status='active') AS active,
      (SELECT count(*)::int FROM employees e LEFT JOIN employees m ON m.id=e.manager_id AND m.id<>e.id AND m.status='active'
        LEFT JOIN users u ON u.id=m.user_id WHERE e.status='active' AND (m.id IS NULL OR u.active IS DISTINCT FROM true OR u.archived IS TRUE)) AS missing,
      (SELECT count(*)::int FROM leave_requests WHERE status::text IN('pending','manager_approved','clarification_requested')) AS leaves,
      (SELECT count(*)::int FROM attendance_permissions WHERE status::text IN('pending','manager_approved','clarification_requested')) AS permissions,
      (SELECT count(*)::int FROM attendance_corrections WHERE status='pending') AS corrections,
      (SELECT count(*)::int FROM hr_actions WHERE status::text IN('pending','in_progress')) AS actions`);
    res.json({employees:{total:data.total,active:data.active,missingManager:data.missing},
      pending:{leaves:data.leaves,permissions:data.permissions,corrections:data.corrections,actions:data.actions},asOf:new Date().toISOString()});
  }));
  app.get("/api/hr/requests",authorize,endpoint(async(req,res)=>{
    const input=z.object({kind:z.enum(["all","leave","permission"]).default("all"),
      status:z.enum(["all","pending","approved","rejected","clarification_requested"]).default("pending"),
      search:z.string().trim().max(120).default(""),from:z.string().date().optional(),to:z.string().date().optional(),
      page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(25)}).parse(req.query);
    if(input.from&&input.to&&input.from>input.to)fail(400,"تاريخ البداية يجب أن يسبق النهاية.");
    const base=`WITH requests AS (
      SELECT id,'leave'::text AS kind,employee_id,start_date::text AS start_date,end_date::text AS end_date,
        status::text,reason,created_at,leave_form_data AS data FROM leave_requests
      UNION ALL SELECT id,'permission',employee_id,date::text,COALESCE(form_details->>'returnDate',date::text),
        status::text,reason,created_at,form_details FROM attendance_permissions),
      filtered AS (SELECT r.*,e.full_name_ar,e.employee_number,m.full_name_ar AS manager_name,
        COALESCE((r.data->'_approval'->>'managerReview')::boolean,true) AS manager_review,
        CASE WHEN r.data ? '_approval' THEN NULLIF(r.data->'_approval'->>'managerEmployeeId','')::int ELSE e.manager_id END AS manager_id
      FROM requests r JOIN employees e ON e.id=r.employee_id LEFT JOIN employees m
        ON m.id=CASE WHEN r.data ? '_approval' THEN NULLIF(r.data->'_approval'->>'managerEmployeeId','')::int ELSE e.manager_id END
      WHERE ($1='all' OR r.kind=$1) AND ($2='' OR e.full_name_ar ILIKE '%'||$2||'%' OR e.full_name_en ILIKE '%'||$2||'%'
        OR e.employee_number ILIKE '%'||$2||'%' OR r.reason ILIKE '%'||$2||'%' OR r.id::text=$2)
        AND ($3::text IS NULL OR r.end_date>=$3) AND ($4::text IS NULL OR r.start_date<=$4))`;
    const params=[input.kind,input.search,input.from||null,input.to||null];
    const statusFilter=`($5='all' OR CASE WHEN $5='pending' THEN status IN('pending','manager_approved')
      WHEN $5='approved' THEN status IN('approved','auto_approved') ELSE status=$5 END)`;
    const [{rows:items},{rows:[counts]}]=await Promise.all([
      pool.query(`${base} SELECT id,kind,employee_id AS "employeeId",full_name_ar AS "employeeName",
        employee_number AS "employeeNumber",start_date AS "startDate",end_date AS "endDate",status,reason,
        created_at AS "createdAt",manager_name AS "managerName",
        CASE WHEN status IN('approved','auto_approved','rejected','cancelled') THEN 'closed'
          WHEN manager_review AND manager_id IS NOT NULL AND status<>'manager_approved'
            AND NOT EXISTS(SELECT 1 FROM hr_request_history h WHERE h.kind=filtered.kind AND h.request_id=filtered.id
              AND h.next_status='manager_approved') THEN 'manager' ELSE 'hr' END AS stage,
        count(*) OVER()::int AS total FROM filtered WHERE ${statusFilter} ORDER BY created_at DESC,id DESC LIMIT $6 OFFSET $7`,
        [...params,input.status,input.pageSize,(input.page-1)*input.pageSize]),
      pool.query(`${base} SELECT count(*) FILTER(WHERE status IN('pending','manager_approved'))::int AS pending,
        count(*) FILTER(WHERE status IN('approved','auto_approved'))::int AS approved,
        count(*) FILTER(WHERE status='rejected')::int AS rejected,
        count(*) FILTER(WHERE status='clarification_requested')::int AS clarification,
        count(*) FILTER(WHERE ${statusFilter})::int AS total FROM filtered`,[...params,input.status])
    ]);
    res.json({items:items.map(({total,...item})=>item),counts,total:counts.total,page:input.page,pageSize:input.pageSize});
  }));
}
