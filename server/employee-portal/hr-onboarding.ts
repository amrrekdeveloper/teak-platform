import { pool } from "../db";
import { employeeDirectory, employeePhone } from "./database";
import { normalizeEmployeePhone } from "./security";

export function hrEmployeePhone(value: unknown): string {
  const phone = normalizeEmployeePhone(value);
  if (!phone) throw Object.assign(new Error("أدخل رقم جوال سعودي صحيحًا للموظف."), { status: 400 });
  return `0${phone.slice(3)}`;
}

// All HR creates/phone edits serialize on the normalized number. A legacy
// duplicate is reported, never overwritten, merged or silently reassigned.
export async function withUniqueEmployeePhone<T>(
  body: Record<string, any>, employeeId: number | undefined, write: () => Promise<T>,
) {
  if (employeeId !== undefined && !Object.hasOwn(body, "phone")) return write();
  body.phone = hrEmployeePhone(body.phone);
  const normalized = normalizeEmployeePhone(body.phone)!;
  try {
    const duplicate = (await employeeDirectory()).some(e => e.id !== employeeId && employeePhone(e) === normalized);
    if (duplicate) throw Object.assign(new Error("رقم الجوال مسجل لموظف آخر."), { status: 409 });
    const result = await write();
    return result;
  } catch (error) {
    throw error;
  }
}
