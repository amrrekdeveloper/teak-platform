import { z } from "zod";

const text = (max: number) => z.string().trim().max(max).optional();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "تاريخ غير صالح").optional();

/** Public capture fields only. Approval, identity and balance snapshots are server-owned. */
export const leaveFormInputSchema = z.object({
  passportNumber: text(50),
  destination: text(200),
  actualDepartureDate: date,
  actualReturnDate: date,
  substituteEmployeeId: z.number().int().positive().optional(),
  leaveAddress: text(500),
  leavePhone: text(40),
  ticketDetails: text(500),
  visaDetails: text(500),
  notes: text(2000),
  employeeAcknowledged: z.boolean().optional(),
  hrReview: z.object({
    entitlementDate: date,
    lastReturnDate: date,
    lastLeaveType: z.enum(["annual", "sick", "unpaid", "emergency", "maternity", "other"]).optional(),
  }).strict().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.actualDepartureDate && value.actualReturnDate && value.actualReturnDate < value.actualDepartureDate)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["actualReturnDate"], message: "تاريخ العودة يسبق المغادرة" });
});
export type LeaveFormInput = z.infer<typeof leaveFormInputSchema>;
export const LEAVE_ACKNOWLEDGMENT = "أتعهد أنا الموقع أدناه بالالتزام بمواعيد عودتي من الإجازة المعتمدة.";

export interface LeaveFormSnapshot {
  version: 1;
  capturedAt: string;
  capturedBy: { kind: "admin"; userId: number } | { kind: "employee"; employeeId: number };
  employee: { id: number; employeeNumber: string; name: string; department: string; position: string; nationality: string; idNumber: string | null; phone: string | null };
  submitted: LeaveFormInput;
  substitute: { id: number; employeeNumber: string; name: string } | null;
  hr: { year: number; annualEntitlement: number; usedDays: number; leaveBalance: number; calculatedAt: string; lastLeaveType: string | null; lastReturnDate: string | null; entitlementDate: string | null };
  acknowledgment: { text: string; kind: "ordinary_electronic_acknowledgment"; employeeId: number; acknowledgedAt: string } | null;
}
