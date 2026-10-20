import { pool } from "./db";

const escape = (value: unknown) => String(value ?? "غير مسجل").replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;",
}[c]!));

export async function permissionDocument(id: number, employeeId?: number) {
  const row = (await pool.query(`SELECT p.*,e.full_name_ar,e.employee_number,e.position,e.department
    FROM attendance_permissions p LEFT JOIN employees e ON e.id=p.employee_id
    WHERE p.id=$1 AND ($2::int IS NULL OR p.employee_id=$2)`, [id,employeeId ?? null])).rows[0];
  if (!row) return null;
  const decisions = (await pool.query(`SELECT h.*,u.full_name_ar AS actor_name FROM hr_request_history h
    LEFT JOIN users u ON u.id=h.actor_user_id WHERE kind='permission' AND request_id=$1 ORDER BY h.id`, [id])).rows;
  const form = row.form_details || {};
  const fields: [string,unknown][] = [
    ["رقم الملف / المرجع",`HR-002-${row.id}`],["تاريخ الطلب",row.created_at],
    ["اسم الموظف",form.employeeName || row.full_name_ar],["رقم الموظف",form.employeeNumber || row.employee_number],
    ["المسمى الوظيفي",form.position || row.position],["القسم",form.department || row.department],
    ["الفترة صباحية / مسائية",form.period],["الغرض عمل / شخصي / طارئ",form.purpose],
    ["المبرر المكتوب",row.reason],["تاريخ ووقت المغادرة",`${form.departureDate || String(row.date).slice(0,10)} ${row.start_time || ""}`],
    ["تاريخ ووقت العودة",`${form.returnDate || String(row.date).slice(0,10)} ${row.end_time || ""}`],
    ["عدد الساعات",row.hours_requested],["إقرار الموظف",form.acknowledgedAt ? `إقرار إلكتروني عادي ${form.acknowledgedAt}` : "لا يوجد دليل إقرار محفوظ"],
    ["جلسة الإقرار",form.sessionId],["ملاحظات",form.notes],["الحالة",row.status],
  ];
  return `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>HR-002 V01</title>
    <style>body{font-family:Arial,sans-serif;margin:30px;color:#173e33}table{border-collapse:collapse;width:100%}td,th{border:1px solid #aaa;padding:10px;text-align:right}h1{text-align:center}@media print{button{display:none}}</style>
    <h1>TEAK · طلب استئذان · HR-002 V01</h1>
    <p>نسخة إلكترونية للحقول المسجلة؛ ليست نسخة معتمدة من أصل النموذج الورقي ولا توقيعاً رقمياً مؤهلاً.</p>
    <table>${fields.map(([label,value])=>`<tr><th>${escape(label)}</th><td>${escape(value)}</td></tr>`).join("")}</table>
    <h2>قرارات المدير المباشر والموارد البشرية</h2><table><tr><th>المرحلة والقرار</th><th>المراجع</th><th>التوقيت</th><th>الملاحظة</th></tr>
    ${decisions.map(d=>`<tr><td>${escape(d.previous_status)} → ${escape(d.next_status)} (${escape(d.decision)})</td><td>${escape(d.actor_name || d.actor_user_id || "الموظف")}</td><td>${escape(d.created_at)}</td><td>${escape(d.note)}</td></tr>`).join("")}</table>
    <p>قرارات الحسابات الموثقة أعلاه أدلة مراجعة إلكترونية وليست توقيعات رقمية مؤهلة. أي توقيع ورقي مستقل يتطلب الإجراء المعتمد.</p>
    <button onclick="window.print()">طباعة / حفظ PDF</button></html>`;
}
