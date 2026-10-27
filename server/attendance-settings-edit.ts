import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { pool } from "./db";
import { workScheduleSettings, hrAuditLog, type InsertWorkScheduleSetting } from "../shared/schema";
import { freezeCurrentAttendanceSchedules, refreshUnobservedTodaySchedules } from "./attendance-schedule-history";

/** Keep the settings edit and changes to unobserved periods atomic and auditable. */
export async function saveAttendanceSchedule(id: number, data: Partial<InsertWorkScheduleSetting>, actorId: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE employees IN SHARE MODE");
    const tx = drizzle(client);
    const [before] = await tx.select().from(workScheduleSettings).where(eq(workScheduleSettings.id, id)).for("update");
    if (!before) { await client.query("ROLLBACK"); return undefined; }
    await freezeCurrentAttendanceSchedules(client);
    const [after] = await tx.update(workScheduleSettings).set(data).where(eq(workScheduleSettings.id, id)).returning();
    await refreshUnobservedTodaySchedules(client, actorId, undefined, id);
    await tx.insert(hrAuditLog).values({
      performedBy: actorId, action: "attendance_schedule_changed",
      details: JSON.stringify({ before, after, effect: "Only unobserved periods today; earlier days and punched periods unchanged" }),
    });
    await client.query("COMMIT");
    return after;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
