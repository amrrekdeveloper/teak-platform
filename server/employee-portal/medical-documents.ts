import type { Express, RequestHandler, Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { pool } from "../db";
import { deleteObjectFile, saveObjectFile, streamObjectFile } from "../objectFileStore";
import { asyncRoute, identity, portalError } from "./router";
import { takeLimit } from "./database";
import { storage } from "../storage";

const folder = "hr-medical-private";
export const canReviewMedicalDocuments = (role?: string) => role === "owner" || role === "hr";
/** Additional clinical-data boundary, even when the caller's attendance guard admits IT. */
export const medicalDocumentRole: RequestHandler = async (req,res,next) => {
  try {
    // The administrative app uses server-side sessions, not req.user.
    // Always resolve that session afresh; retain adapters for isolated tests.
    const user=req.session?.userId?await storage.getUser(req.session.userId):(req as any).user;
    if(!user)return res.status(401).json({message:"سجل الدخول أولاً."});
    if(user.active===false||user.archived||!canReviewMedicalDocuments(user.role))
      return res.status(403).json({message:"المرفقات الطبية متاحة للمالك والموارد البشرية فقط."});
    next();
  }catch{res.status(500).json({message:"تعذّر التحقق من صلاحية مراجعة المرفقات."});}
};
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5242880, files: 1, fields: 4 } });
const receive: RequestHandler = (req, res, next) => upload.single("file")(req, res, err =>
  err ? res.status(400).json({ message: "ملف واحد حتى 5 ميغابايت." }) : next());

export function medicalMime(buffer: Buffer, declared: string) {
  const mime = buffer.subarray(0, 5).toString() === "%PDF-" ? "application/pdf"
    : buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png"
    : buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 ? "image/jpeg" : "";
  return mime && mime === declared ? mime : null;
}

export async function initMedicalDocuments() {
  await pool.query(`CREATE TABLE IF NOT EXISTS hr_medical_documents (
    id serial PRIMARY KEY, employee_id integer NOT NULL REFERENCES employees(id),
    kind text NOT NULL CHECK(kind IN ('leave','attendance')),
    leave_id integer REFERENCES leave_requests(id), record_id integer REFERENCES attendance_records(id),
    object_key text NOT NULL UNIQUE, mime_type text NOT NULL, original_name text NOT NULL,
    reason text, created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((kind='leave' AND record_id IS NULL) OR (kind='attendance' AND record_id IS NOT NULL AND leave_id IS NULL))
  )`);
}

const columns = `id,kind,leave_id AS "leaveId",record_id AS "recordId",
  original_name AS name,reason,created_at AS "createdAt"`;
async function download(id: number, res: Parameters<RequestHandler>[1], employeeId?: number) {
  if(!Number.isSafeInteger(id) || id <= 0) portalError(400,"المرفق غير صالح.");
  const { rows: [file] } = await pool.query(`SELECT * FROM hr_medical_documents
    WHERE id=$1 AND ($2::integer IS NULL OR employee_id=$2)`, [id, employeeId ?? null]);
  if (!file) portalError(404, "المرفق غير موجود.");
  res.set({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox" });
  const found = await streamObjectFile(folder, file.object_key, res, {
    contentType: file.mime_type, disposition: 'attachment; filename="medical-report"',
  });
  if (!found) portalError(404, "المرفق غير موجود.");
}

export function registerEmployeeMedicalDocuments(router: Router) {
  router.post("/medical-documents", receive, asyncRoute(async (req, res) => {
    const { employee } = identity(res);
    if (!await takeLimit(`medical-upload:${employee.id}`,20,900)) portalError(429,"محاولات رفع متكررة؛ حاول لاحقًا.");
    const kind = req.body.kind;
    const file = req.file;
    if (!file || !["leave","attendance"].includes(kind)) portalError(400, "اختر التقرير ونوع الطلب.");
    const mime = medicalMime(file!.buffer, file!.mimetype);
    if (!mime) portalError(400, "يسمح فقط بملف PDF أو صورة PNG/JPEG أصلية.");
    const recordId = kind === "attendance" ? Number(req.body.recordId) : null;
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
    if (kind === "attendance" && (!Number.isSafeInteger(recordId) || recordId! <= 0 || reason.length < 3 || reason.length > 1000))
      portalError(400, "اختر حركة حضور واكتب سبب العذر.");
    const client = await pool.connect();
    const key = randomUUID();
    let saved = false;
    try {
      await client.query("BEGIN");
      if (recordId && !(await client.query("SELECT id FROM attendance_records WHERE id=$1 AND employee_id=$2 FOR UPDATE", [recordId, employee.id])).rowCount)
        portalError(404, "الحركة غير موجودة.");
      await saveObjectFile(folder, key, file!.buffer, mime!);
      saved = true;
      const { rows: [document] } = await client.query(`INSERT INTO hr_medical_documents
        (employee_id,kind,record_id,object_key,mime_type,original_name,reason) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [employee.id, kind, recordId, key, mime, file!.originalname.replace(/[\u0000-\u001f]/g, "").slice(0, 180), reason || null]);
      if (recordId) await client.query(`INSERT INTO notifications
        (user_id,title_ar,title_en,message_ar,message_en,type,related_entity,related_id)
        SELECT id,'عذر حضور طبي','Medical attendance excuse','تقرير طبي جديد للمراجعة','Medical report awaiting review',
        'info','attendance_record',$1 FROM users WHERE active=true AND role IN ('hr','owner')`, [recordId]);
      await client.query("COMMIT");
      res.status(201).json({ id: document.id });
    } catch (error) {
      await client.query("ROLLBACK");
      if (saved) await deleteObjectFile(folder, key);
      throw error;
    } finally { client.release(); }
  }));
  router.get("/medical-documents", asyncRoute(async (_req, res) => {
    res.json((await pool.query(`SELECT ${columns} FROM hr_medical_documents WHERE employee_id=$1 ORDER BY id DESC`, [identity(res).employee.id])).rows);
  }));
  router.get("/medical-documents/:id/download", asyncRoute(async (req, res) => {
    await download(Number(req.params.id), res, identity(res).employee.id);
  }));
}

export function registerHrMedicalDocuments(app: Express, authorize: RequestHandler) {
  app.get("/api/attendance/medical-documents", authorize, medicalDocumentRole, asyncRoute(async (req, res) => {
    const leave = Number(req.query.leaveId), record = Number(req.query.recordId);
    if (!(Number.isSafeInteger(leave) && leave > 0) && !(Number.isSafeInteger(record) && record > 0))
      portalError(400, "اختر الطلب أو حركة الحضور.");
    res.json((await pool.query(`SELECT ${columns} FROM hr_medical_documents
      WHERE ($1::integer IS NOT NULL AND leave_id=$1) OR ($2::integer IS NOT NULL AND record_id=$2) ORDER BY id`,
    [leave > 0 ? leave : null, record > 0 ? record : null])).rows);
  }));
  app.get("/api/attendance/medical-documents/:id/download", authorize, medicalDocumentRole, asyncRoute(async (req, res) => {
    await download(Number(req.params.id), res);
  }));
}
