import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { correctAttendanceRecord } from "./attendance-support";
import { canReviewMedicalDocuments } from "./employee-portal/medical-documents";

const inputSchema=z.object({
  excuseType:z.enum(["forgot_fingerprint","technical_issue","emergency_leave","medical_excuse"]),
  note:z.string().trim().min(3).max(1000),
  newCheckTime:z.preprocess(value=>value===""?undefined:value,z.string().datetime({offset:true}).optional()),
});

/** Register this exact handler in production and protocol integration tests. */
export function registerAttendanceOverride(app:Express,authorize:RequestHandler) {
  app.post("/api/attendance/record/:id/override",authorize,async(req,res)=>{
    const id=Number(req.params.id);
    const parsed=inputSchema.safeParse(req.body);
    if(!Number.isSafeInteger(id)||id<=0||!parsed.success)
      return res.status(400).json({message:"اختر نوع العذر واكتب سببًا صحيحًا ووقتًا صالحًا."});
    const user=(req as any).user;
    if(parsed.data.excuseType==="medical_excuse"&&!canReviewMedicalDocuments(user?.role))
      return res.status(403).json({message:"اعتماد العذر الطبي من صلاحيات المالك والموارد البشرية فقط."});
    try {
      // One authoritative, locked check accepts BOTH protected attachment stores.
      res.json(await correctAttendanceRecord(id,user.id,{
        checkTime:parsed.data.newCheckTime,notes:parsed.data.note,reason:parsed.data.note,excuse:parsed.data.excuseType,
      }));
    } catch(error:any) {
      const status=[400,404,409].includes(error.status)?error.status:500;
      if(status===500) console.error("[attendance-override]", {recordId:id,code:error.code,message:error.message});
      res.status(status).json({message:status===500?"تعذر حفظ التصحيح.":error.message});
    }
  });
}
