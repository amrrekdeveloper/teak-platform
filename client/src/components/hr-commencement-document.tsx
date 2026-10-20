import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Employee, HrAction } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { ReportPreview } from "@/components/hr-report";
import { commencementReport } from "@/lib/hr-commencement-report";

export function HrCommencementDocument({ action }: { action: HrAction }) {
  const [open, setOpen] = useState(false);
  const employee = useQuery<Employee>({
    queryKey: ["/api/employees", action.employeeId],
    enabled: open && !!action.employeeId,
  });
  const offer = useQuery<HrAction[]>({
    queryKey: ["/api/hr-actions"],
    enabled: open && !!action.linkedActionId,
  });
  const waiting = (!!action.employeeId && employee.isLoading) || (!!action.linkedActionId && offer.isLoading);
  return <>
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}>نموذج المباشرة الكامل / PDF</Button>
    {open && (employee.error || offer.error) && <p role="alert" className="text-destructive">تعذر تحميل بيانات المباشرة المرتبطة. أعد المحاولة؛ لن تطبع بيانات ناقصة بسبب خطأ الاتصال.</p>}
    <ReportPreview report={open && !waiting && !employee.error && !offer.error ? commencementReport(action, employee.data, offer.data?.find(item => item.id === action.linkedActionId && item.workflow === "wf02")) : null} onClose={() => setOpen(false)} />
  </>;
}
