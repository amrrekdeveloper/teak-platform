import type { Employee } from "@shared/schema";
import type { LeaveFormInput } from "@shared/hr-leave-form";
import { LEAVE_ACKNOWLEDGMENT } from "@shared/hr-leave-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function HrLeaveFormFields({ value, onChange, employees, employeeId }: {
  value: LeaveFormInput; onChange: (value: LeaveFormInput) => void; employees: Employee[]; employeeId: number;
}) {
  const set = (key: keyof LeaveFormInput, next: string) => onChange({ ...value, [key]: next || undefined });
  const fields = [
    ["passportNumber", "رقم الجواز", "text"], ["destination", "الوجهة", "text"],
    ["actualDepartureDate", "تاريخ المغادرة المبلغ عنه", "date"], ["actualReturnDate", "تاريخ العودة المبلغ عنه", "date"],
    ["leaveAddress", "العنوان أثناء الإجازة", "text"], ["leavePhone", "هاتف التواصل أثناء الإجازة", "tel"],
    ["ticketDetails", "بيانات التذاكر (إن وجدت)", "text"], ["visaDetails", "بيانات التأشيرة (إن وجدت)", "text"],
  ] as const;
  return <fieldset className="border rounded-lg p-3 space-y-4">
    <legend className="px-2 font-semibold">البيانات الكاملة — HR-001 V01</legend>
    <div className="grid sm:grid-cols-2 gap-3">
      {fields.map(([key, label, type]) => <div key={key} className="space-y-1"><Label htmlFor={`leave-form-${key}`}>{label}</Label><Input id={`leave-form-${key}`} type={type} maxLength={key === "passportNumber" ? 50 : key === "leavePhone" ? 40 : key === "destination" ? 200 : 500} value={value[key] || ""} onChange={e => set(key, e.target.value)} /></div>)}
    </div>
    <div className="space-y-1"><Label>الموظف البديل</Label>
      <Select value={String(value.substituteEmployeeId || "none")} onValueChange={v => onChange({ ...value, substituteEmployeeId: v === "none" ? undefined : Number(v) })}>
        <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">لم يُحدد</SelectItem>{employees.filter(e => e.status === "active" && e.id !== employeeId).map(e => <SelectItem key={e.id} value={String(e.id)}>{e.fullNameAr || e.fullNameEn} — {e.employeeNumber}</SelectItem>)}</SelectContent>
      </Select>
    </div>
    <div className="grid sm:grid-cols-2 gap-3">
      <div><Label htmlFor="hr-entitlement-date">تاريخ الاستحقاق (مراجعة HR)</Label><Input id="hr-entitlement-date" type="date" value={value.hrReview?.entitlementDate || ""} onChange={e => onChange({ ...value, hrReview: { ...value.hrReview, entitlementDate: e.target.value || undefined } })} /></div>
      <div><Label htmlFor="hr-last-return">تاريخ العودة الفعلي من آخر إجازة (إن لم يسجل في المسار)</Label><Input id="hr-last-return" type="date" value={value.hrReview?.lastReturnDate || ""} onChange={e => onChange({ ...value, hrReview: { ...value.hrReview, lastReturnDate: e.target.value || undefined } })} /></div>
    </div>
    <Label htmlFor="leave-form-notes">ملاحظات النموذج</Label><Textarea id="leave-form-notes" maxLength={2000} value={value.notes || ""} onChange={e => set("notes", e.target.value)} />
    <p className="text-sm border-s-2 ps-3">{LEAVE_ACKNOWLEDGMENT}</p>
    <p className="text-xs text-muted-foreground">الإقرار والتوقيعات من أصحابها فقط؛ لا يقر HR نيابة عن الموظف. تحفظ بيانات الموظف والبديل ورصيد الإجازة وقت إنشاء الطلب من الخادم. التواريخ المبلغ عنها ليست إثباتاً لحركة السفر الفعلية.</p>
  </fieldset>;
}
