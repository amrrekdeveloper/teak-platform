import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/components/language-provider";

/** Uses the existing employee document archive, not a parallel document store. */
export function HrDocumentArchive({ employeeId }: { employeeId: number }) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return <div className="rounded-lg border p-3 space-y-2">
    <p className="text-sm">{t("لأرشفة تقرير مطبوع: احفظه PDF ثم ارفعه هنا. لا تعني الأرشفة اعتماد المستند أو توقيعه.", "To archive a printed report, save as PDF and upload here. Archiving does not approve or sign the document.")}</p>
    <Label htmlFor={`archive-name-${employeeId}`}>{t("اسم المستند", "Document name")}</Label>
    <Input id={`archive-name-${employeeId}`} value={name} onChange={e => setName(e.target.value)} />
    <input ref={input} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = "";
      if (!file) return;
      if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type) || file.size > 10 * 1024 * 1024) { setMessage(t("اختر PDF أو JPG أو PNG بحجم أقصى 10 ميجابايت.", "Choose PDF, JPG or PNG up to 10 MB.")); return; }
      setBusy(true); setMessage("");
      try {
        const form = new FormData(); form.append("file", file); form.append("name", name.trim() || file.name);
        const response = await fetch(`/api/employees/${employeeId}/documents`, { method: "POST", credentials: "include", body: form });
        if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message || t("تعذرت الأرشفة", "Archiving failed")); }
        await queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
        setName(""); setMessage(t("تمت أرشفة المستند في ملف هذا الموظف.", "Document archived in this employee's file."));
      } catch (error) { setMessage((error as Error).message); }
      finally { setBusy(false); }
    }} />
    <Button disabled={busy} variant="outline" onClick={() => input.current?.click()}>{busy ? t("جارٍ الرفع…", "Uploading…") : t("رفع إلى أرشيف الموظف", "Upload to employee archive")}</Button>
    {message && <p role="status" className="text-sm">{message}</p>}
  </div>;
}
