import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { employees, hrAuditLog, insertEmployeeSchema } from "../shared/schema";
import { attendanceAssignmentMatches } from "../shared/employee-edit";
import { withDepartmentCatalogWrite } from "./department-catalog";
import { validateEmployeeAttendanceAssignment } from "./attendance-workspace";
import { freezeCurrentAttendanceSchedules, refreshUnobservedTodaySchedules } from "./attendance-schedule-history";

/** Row lock + compare-and-set + audit form one atomic operation, never a full stale overwrite. */
export async function saveEmployeeEdit(id: number, input: Record<string, unknown>, actorId: number) {
  const { expectedAttendanceAssignment, expectedAttendanceLocationMode, ...raw } = input;
  const data = insertEmployeeSchema.partial().parse(raw);
  return withDepartmentCatalogWrite(async client => {
    await client.query("BEGIN");
    try {
      // Match workweek review's employees-before-evidence lock order. Acquire the
      // write lock before freezing evidence; upgrading it afterward can deadlock.
      await client.query("LOCK TABLE employees IN ROW EXCLUSIVE MODE");
      const tx = drizzle(client);
      const [before] = await tx.select().from(employees).where(eq(employees.id, id)).for("update");
      if (!before) { await client.query("ROLLBACK"); return undefined; }
      if (Object.hasOwn(data, "userId") && (data.userId ?? null) !== (before.userId ?? null))
        throw Object.assign(new Error("ربط حساب المستخدم بالموظف يتم من شاشة المستخدمين لدى المالك."), { status: 400 });
      if (Object.hasOwn(data, "attendanceLocationMode") && expectedAttendanceLocationMode !== before.attendanceLocationMode)
        throw Object.assign(new Error("تغير تصريح موقع الموظف. أعد فتح بياناته قبل تعديل التصريح."), {status:409});
      const assignmentKeys = ["attendanceZoneId", "attendanceScheduleId"] as const;
      const touchesAssignment = assignmentKeys.some(key => Object.hasOwn(data, key));
      if (touchesAssignment && !attendanceAssignmentMatches(expectedAttendanceAssignment, before)) {
        throw Object.assign(new Error("تغيّر تعيين الموظف أو أن النموذج قديم. أغلقه وافتحه مجددًا قبل حفظ الموقع والدوام."), { status: 409 });
      }
      // Unrelated profile edits preserve even legacy/inactive assignments exactly.
      if (touchesAssignment || Object.hasOwn(data, "department"))
        await validateEmployeeAttendanceAssignment(data, id, client);
      if (touchesAssignment || Object.hasOwn(data, "department"))
        await freezeCurrentAttendanceSchedules(client, id);
      if (!Object.keys(data).length) { await client.query("COMMIT"); return before; }
      const [after] = await tx.update(employees).set(data).where(eq(employees.id, id)).returning();
      if (touchesAssignment || Object.hasOwn(data, "department"))
        await refreshUnobservedTodaySchedules(client, actorId, id);
      if (Object.hasOwn(data, "attendanceLocationMode") && before.attendanceLocationMode !== after.attendanceLocationMode) {
        await tx.insert(hrAuditLog).values({
          performedBy: actorId, employeeId: id, action: "attendance_location_permission_changed",
          details: JSON.stringify({ before: before.attendanceLocationMode, after: after.attendanceLocationMode }),
        });
      }
      if (assignmentKeys.some(key => before[key] !== after[key])) {
        await tx.insert(hrAuditLog).values({
          performedBy: actorId, employeeId: id, action: "attendance_assignment_changed",
          details: JSON.stringify({
            before: { attendanceZoneId: before.attendanceZoneId, attendanceScheduleId: before.attendanceScheduleId },
            after: { attendanceZoneId: after.attendanceZoneId, attendanceScheduleId: after.attendanceScheduleId },
          }),
        });
      }
      await client.query("COMMIT");
      return after;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}
