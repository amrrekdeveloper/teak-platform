import type { PoolClient } from "pg";
import { pool } from "./db";
import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";

export class PayrollError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

// Explicit roles: deliberately does not inherit permission overrides or IT bypass.
export function payrollRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.session.userId ? await storage.getUser(req.session.userId) : undefined;
      if (!user || !user.active || user.archived || !roles.includes(user.role)) {
        return res.status(user ? 403 : 401).json({ message: "غير مصرح بهذه العملية" });
      }
      next();
    } catch { res.status(500).json({ message: "تعذر التحقق من الصلاحية" }); }
  };
}

// Call after the existing payroll/advance tables have been initialized.
export async function initPayrollSafety() {
  await pool.query(`ALTER TYPE payroll_status ADD VALUE IF NOT EXISTS 'approved'`);
  await pool.query(`
    ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS approved_by integer REFERENCES users(id);
    ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS approved_at timestamptz;
    ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS advance_id integer REFERENCES employee_advances(id);
    CREATE TABLE IF NOT EXISTS payroll_advance_repayments (
      id serial PRIMARY KEY,
      payroll_id integer NOT NULL UNIQUE REFERENCES payroll_records(id),
      advance_id integer NOT NULL REFERENCES employee_advances(id),
      amount numeric(12,2) NOT NULL CHECK (amount > 0),
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

export function cents(value: unknown): number {
  if (!/^\d+(\.\d{1,2})?$/.test(String(value))) throw new PayrollError("قيمة مالية غير صالحة", 400);
  const result = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(result) || result > 999999999999) throw new PayrollError("قيمة مالية خارج النطاق", 400);
  return result;
}
const money = (value: number) => (value / 100).toFixed(2);
export async function nextAdvanceInstallment(advance: { id: number; amount: string; remainingAmount: string; monthlyDeduction: string; installments: number }) {
  const remaining = cents(advance.remainingAmount), monthly = cents(advance.monthlyDeduction);
  const paid = cents(advance.amount) - remaining;
  // Include historical recoveries made before the repayment ledger was introduced.
  const recoveredInstallments = monthly > 0 ? Math.floor(paid / monthly) : 0;
  return money(recoveredInstallments >= advance.installments - 1 ? remaining : Math.min(monthly, remaining));
}
export function payrollAmounts(row: any) {
  const basic = cents(row.basic_salary), allowances = cents(row.allowances);
  const deductions = cents(row.deductions), advance = cents(row.advance_deduction);
  const net = basic + allowances - deductions - advance;
  if (net < 0 || net !== cents(row.net_salary)) throw new PayrollError("صافي الراتب غير متوازن؛ يرجى تصحيح المسير", 400);
  return { net, advance, expense: net + advance };
}
const camel = (row: any) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));

export async function payrollTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

async function account(client: PoolClient, type: string, names: string[]) {
  // Resolve actual active leaf accounts; fail closed if missing or ambiguous.
  const { rows } = await client.query(`SELECT a.* FROM chart_of_accounts a
    WHERE a.is_active AND a.type=$1 AND (a.name_en=ANY($2::text[]) OR a.name_ar=ANY($2::text[]))
    AND NOT EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.parent_code=a.code)`, [type, names]);
  if (rows.length !== 1) throw new PayrollError("حساب محاسبي مفقود أو ملتبس؛ يلزم ضبط دليل الحسابات");
  return rows[0];
}

async function journal(client: PoolClient, kind: string, id: number, userId: number, description: string,
  lines: { account: any; debit: number; credit: number }[]) {
  // Legacy partially-posted records require reconciliation, never automatic reposting.
  const prior = await client.query("SELECT id FROM journal_entries WHERE reference_type=$1 AND reference_id=$2", [kind, id]);
  if (prior.rowCount) throw new PayrollError("يوجد قيد سابق لهذا السجل؛ يلزم مراجعته قبل إعادة المعالجة");
  const total = lines.reduce((sum, line) => sum + line.debit, 0);
  if (total !== lines.reduce((sum, line) => sum + line.credit, 0)) throw new PayrollError("القيد غير متوازن");
  const { rows } = await client.query(`INSERT INTO journal_entries
    (date,description,reference,reference_type,reference_id,status,total_debit,total_credit,created_by)
    VALUES ((now() AT TIME ZONE 'Asia/Riyadh')::date,$1,$2,$3,$4,'posted',$5,$5,$6) RETURNING id`,
  [description, `${kind === "payroll" ? "PAY" : "ADV"}-${id}`, kind, id, money(total), userId]);
  for (const line of lines) {
    await client.query(`INSERT INTO journal_entry_lines (entry_id,account_code,account_name_ar,debit,credit)
      VALUES ($1,$2,$3,$4,$5)`, [rows[0].id, line.account.code, line.account.name_ar, money(line.debit), money(line.credit)]);
  }
}

export async function payrollAction(id: number, action: "approve" | "pay", userId: number) {
  if (!Number.isSafeInteger(id) || id < 1) throw new PayrollError("رقم السجل غير صالح", 400);
  return payrollTransaction(async client => {
    const { rows } = await client.query("SELECT * FROM payroll_records WHERE id=$1 FOR UPDATE", [id]);
    const row = rows[0];
    if (!row) throw new PayrollError("السجل غير موجود", 404);
    if (row.status !== (action === "approve" ? "draft" : "approved")) {
      throw new PayrollError(action === "pay" ? "لا يمكن صرف إلا راتب معتمد وغير مدفوع" : "السجل ليس مسودة");
    }
    const amounts = payrollAmounts(row);
    // Lock the employee to serialize advance disbursement against payroll recovery.
    await client.query("SELECT id FROM employees WHERE id=$1 FOR UPDATE", [row.employee_id]);
    const active = await client.query("SELECT * FROM employee_advances WHERE employee_id=$1 AND status='approved' FOR UPDATE", [row.employee_id]);
    const advance = active.rows[0];
    if (amounts.advance > 0 && (!advance || amounts.advance > cents(advance.remaining_amount) ||
      (row.advance_id && row.advance_id !== advance.id))) throw new PayrollError("قسط السلفة تغير؛ يلزم مراجعة المسير");
    if (action === "approve") {
      const result = await client.query(`UPDATE payroll_records SET status='approved',approved_by=$2,approved_at=now(),advance_id=$3 WHERE id=$1 RETURNING *`,
        [id, userId, amounts.advance ? advance.id : null]);
      return camel(result.rows[0]);
    }
    if (amounts.advance && !row.advance_id) throw new PayrollError("السلفة غير مرتبطة بالاعتماد؛ يلزم مراجعة المسير");
    const lines = [];
    if (amounts.expense > 0) lines.push({ account: await account(client, "expense", ["Salaries & Wages", "رواتب وأجور"]), debit: amounts.expense, credit: 0 });
    if (amounts.net > 0) lines.push({ account: await account(client, "asset", ["Cash in Hand", "الصندوق"]), debit: 0, credit: amounts.net });
    if (amounts.advance > 0) lines.push({ account: await account(client, "asset", ["Employee Advances", "سلف وعهد الموظفين"]), debit: 0, credit: amounts.advance });
    await journal(client, "payroll", id, userId, `صرف راتب الموظف #${row.employee_id} عن ${row.period}`, lines);
    if (amounts.advance > 0) {
      const remaining = cents(advance.remaining_amount) - amounts.advance;
      await client.query("INSERT INTO payroll_advance_repayments (payroll_id,advance_id,amount) VALUES ($1,$2,$3)", [id, advance.id, money(amounts.advance)]);
      await client.query("UPDATE employee_advances SET remaining_amount=$2,status=$3 WHERE id=$1", [advance.id, money(remaining), remaining === 0 ? "settled" : "approved"]);
    }
    const result = await client.query(`UPDATE payroll_records SET status='paid',paid_date=(now() AT TIME ZONE 'Asia/Riyadh')::date WHERE id=$1 RETURNING *`, [id]);
    return camel(result.rows[0]);
  });
}

export async function approveAdvance(id: number, userId: number) {
  if (!Number.isSafeInteger(id) || id < 1) throw new PayrollError("رقم السلفة غير صالح", 400);
  return payrollTransaction(async client => {
    // Employee first for consistent lock ordering across different advances.
    const found = await client.query("SELECT employee_id FROM employee_advances WHERE id=$1", [id]);
    if (!found.rows[0]) throw new PayrollError("السلفة غير موجودة", 404);
    await client.query("SELECT id FROM employees WHERE id=$1 FOR UPDATE", [found.rows[0].employee_id]);
    const { rows } = await client.query("SELECT * FROM employee_advances WHERE id=$1 FOR UPDATE", [id]);
    const row = rows[0];
    if (row.status !== "pending") throw new PayrollError("تمت معالجة السلفة مسبقاً");
    const active = await client.query("SELECT id FROM employee_advances WHERE employee_id=$1 AND status='approved'", [row.employee_id]);
    if (active.rowCount) throw new PayrollError("يوجد سلفة نشطة لهذا الموظف بالفعل");
    const amount = cents(row.amount);
    if (!amount || !cents(row.monthly_deduction)) throw new PayrollError("مبلغ أو قسط السلفة غير صالح", 400);
    await journal(client, "advance", id, userId, `صرف سلفة للموظف #${row.employee_id}`, [
      { account: await account(client, "asset", ["Employee Advances", "سلف وعهد الموظفين"]), debit: amount, credit: 0 },
      { account: await account(client, "asset", ["Cash in Hand", "الصندوق"]), debit: 0, credit: amount },
    ]);
    const result = await client.query(`UPDATE employee_advances SET status='approved',approved_by=$2,
      approved_date=(now() AT TIME ZONE 'Asia/Riyadh')::date WHERE id=$1 RETURNING *`, [id, userId]);
    return camel(result.rows[0]);
  });
}

export function payrollFailure(error: unknown) {
  return error instanceof PayrollError ? error.message : "تعذرت العملية؛ لم يتم اعتماد أي تغيير لهذا السجل";
}
