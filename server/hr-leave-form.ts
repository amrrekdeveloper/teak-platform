import { pool } from "./db";
import { storage } from "./storage";
import { annualEntitlementAt, annualUsage } from "./hr-workflow-support";
import { riyadhDateKey } from "../shared/attendance";
import { LEAVE_ACKNOWLEDGMENT, leaveFormInputSchema, type LeaveFormSnapshot } from "../shared/hr-leave-form";

/** Call after the existing leave_requests table exists, before serving HR/ESS routes. */
export async function initHrLeaveForm() {
  await pool.query("ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS leave_form_data jsonb");
}

/**
 * Invoke BEFORE storage.createLeaveRequest and assign its result as leaveFormData
 * in the SAME insert. actor MUST be derived from admin/ESS session, never body.
 * Public payload: { ...existing leave fields, leaveFormData: LeaveFormInput }.
 * Legacy requests without leaveFormData remain accepted and receive a snapshot.
 */
export async function captureLeaveForm(
  employeeId: number,
  input: unknown,
  actor: LeaveFormSnapshot["capturedBy"],
  startDate: string,
): Promise<LeaveFormSnapshot> {
  const submitted = leaveFormInputSchema.parse(input ?? {});
  if (actor.kind === "employee" && actor.employeeId !== employeeId)
    throw Object.assign(new Error("هوية إقرار الموظف غير مطابقة"), { status: 403 });
  if (actor.kind === "employee" && submitted.hrReview)
    throw Object.assign(new Error("بيانات مراجعة الموارد البشرية ليست من صلاحيات الموظف"), { status: 403 });
  if (actor.kind === "admin" && submitted.employeeAcknowledged)
    throw Object.assign(new Error("لا يمكن للموارد البشرية الإقرار نيابة عن الموظف"), { status: 403 });
  const employee = await storage.getEmployee(employeeId);
  if (!employee) throw Object.assign(new Error("الموظف غير موجود"), { status: 404 });
  const substitute = submitted.substituteEmployeeId ? await storage.getEmployee(submitted.substituteEmployeeId) : null;
  if (submitted.substituteEmployeeId && (!substitute || substitute.status !== "active" || substitute.id === employeeId))
    throw Object.assign(new Error("اختر موظفاً بديلاً نشطاً مختلفاً عن مقدم الطلب"), { status: 400 });
  const year = Number(startDate.slice(0, 4));
  if (!Number.isInteger(year) || year < 1900 || year > 2200)
    throw Object.assign(new Error("سنة الإجازة غير صالحة"), { status: 400 });
  const now = new Date();
  const today = riyadhDateKey(now);
  const existing = await storage.getLeaveRequests(employeeId);
  const prior = existing.filter(l => l.status === "approved" && l.endDate < startDate).sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
  const returns = await pool.query(
    `SELECT form_data->>'returnDate' AS date FROM hr_actions
     WHERE employee_id=$1 AND workflow='wf04' AND status='completed'
       AND form_data->>'returnDate' < $2
     ORDER BY form_data->>'returnDate' DESC LIMIT 1`, [employeeId, startDate],
  );
  const entitlement = annualEntitlementAt(employee.hireDate || employee.contractStart, year === Number(today.slice(0, 4)) ? today : `${year}-12-31`);
  const used = annualUsage(existing, year);
  return {
    version: 1, capturedAt: now.toISOString(), capturedBy: actor,
    employee: { id: employee.id, employeeNumber: employee.employeeNumber, name: employee.fullNameAr || employee.fullNameEn || employee.employeeNumber, department: employee.department, position: employee.position, nationality: employee.nationality, idNumber: employee.nationality === "saudi" ? employee.nationalId : employee.iqamaNumber, phone: employee.phone },
    submitted,
    substitute: substitute ? { id: substitute.id, employeeNumber: substitute.employeeNumber, name: substitute.fullNameAr || substitute.fullNameEn || substitute.employeeNumber } : null,
    hr: { year, annualEntitlement: entitlement, usedDays: used, leaveBalance: Math.max(0, entitlement - used), calculatedAt: now.toISOString(), lastLeaveType: submitted.hrReview?.lastLeaveType || prior?.leaveType || null, lastReturnDate: submitted.hrReview?.lastReturnDate || returns.rows[0]?.date || null, entitlementDate: submitted.hrReview?.entitlementDate || null },
    acknowledgment: actor.kind === "employee" && submitted.employeeAcknowledged
      ? { text: LEAVE_ACKNOWLEDGMENT, kind: "ordinary_electronic_acknowledgment", employeeId, acknowledgedAt: now.toISOString() } : null,
  };
}
