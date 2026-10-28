import assert from "node:assert/strict";

/** Real HTTP writes, ONLY to the disposable schema and synthetic HR login. */
export async function runHrFixtureJourneys({ db, base, headers, day }) {
  assert.equal(base, "http://127.0.0.1:5099");
  const { rows: [scope] } = await db.query("SELECT current_schema() AS name");
  assert.match(scope.name, /^hr_fixture_[a-f0-9]{32}$/);
  const call = async (method, path, body, expected = 200) => {
    const response = await fetch(base + path, {
      method, headers: { ...headers, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (response.status !== expected) console.error("Synthetic response reason:", data?.message || "none");
    assert.equal(response.status, expected, `Synthetic ${method} ${path.replace(/\/\d+/g, "/:id")}`);
    console.log(`PASS synthetic ${method}: ${path.replace(/\/\d+/g, "/:id").split("?")[0]}`);
    return data;
  };
  const me = await call("GET", "/api/auth/me");
  assert.equal(me.username, "synthetic_hr_readiness");
  const employeeData = {
    employeeNumber: "SYNTHETIC-HR-HTTP", fullNameAr: "موظف اختبار اصطناعي", phone: "0500000001",
    nationality: "saudi", position: "Synthetic HTTP role", department: "hr",
    monthlySalary: "1500.00", contractStart: "2026-01-01", status: "active",
    attendanceEnabled: true,
  };
  const employee = await call("POST", "/api/employees", employeeData, 201);
  await call("POST", "/api/employees", employeeData, 409);
  await call("PATCH", `/api/employees/${employee.id}`, { position: "Updated synthetic role" });
  assert.equal((await call("GET", `/api/employees/${employee.id}`)).position, "Updated synthetic role");
  const access = (expectedAttendanceEnabled) => ({
    attendanceEnabled: false, expectedAttendanceEnabled, reason: "اختبار اصطناعي لتعارض قرار الوصول",
  });
  await call("PATCH", `/api/hr/access/employees/${employee.id}`, access(false), 409);
  await call("PATCH", `/api/hr/access/employees/${employee.id}`, access(true));
  await call("PATCH", `/api/hr/access/employees/${employee.id}`, access(true), 409);
  const { rows: [audit] } = await db.query(`SELECT count(*)::int AS n FROM hr_audit_log
    WHERE employee_id=$1 AND action='employee_attendance_access_changed'`, [employee.id]);
  assert.equal(audit.n, 1);

  const leaveDay = `${Number(day.slice(0, 4)) + 1}-01-05`;
  const leaveInput = { employeeId: employee.id, leaveType: "annual", startDate: leaveDay,
    endDate: leaveDay, reason: "طلب إجازة اصطناعي", leaveFormData: { notes: "بيانات اختبار فقط" } };
  const leave = await call("POST", "/api/leaves", leaveInput, 201);
  assert.equal(leave.employeeId, employee.id);
  await call("POST", "/api/leaves", leaveInput, 409);
  await call("POST", "/api/leaves", { ...leaveInput, leaveFormData: { employeeAcknowledged: true } }, 403);
  await call("POST", `/api/leaves/${leave.id}/cancel`, { reason: "إلغاء اصطناعي موثق" });
  await call("POST", `/api/leaves/${leave.id}/cancel`, { reason: "لا تكرار للإلغاء" }, 409);
  const leaves = await call("GET", "/api/leaves");
  assert.equal(leaves.find(row => row.id === leave.id)?.status, "cancelled");

  const action = await call("POST", "/api/hr-actions", {
    employeeId: employee.id, workflow: "wf02", formData: {
      candidateName: "مرشح اصطناعي", candidatePhone: "0500000002", position: "Synthetic offer",
      department: "hr", nationality: "saudi", monthlySalary: "1500", offerDate: day,
    },
  }, 201);
  await call("POST", `/api/hr-actions/${action.id}/step`, { decision: "complete" });
  await call("POST", `/api/hr-actions/${action.id}/step`, { decision: "complete" }, 403);
  const actions = await call("GET", "/api/hr-actions");
  assert.equal(actions.find(row => row.id === action.id)?.currentStep, 1);
  assert.equal(actions.filter(row => row.workflow === "wf03").length, 0,
    "HR must not bypass owner approval or create the chained workflow early");

  await call("POST", "/api/advances", { employeeId: employee.id, amount: "100junk", installments: 3 }, 400);
  const advance = await call("POST", "/api/advances", {
    employeeId: employee.id, amount: "١٠٠٫٠٠", installments: "٣", reason: "طلب اصطناعي لا يصرف",
  }, 201);
  assert.equal(Number(advance.monthlyDeduction), 33.33);
  await call("POST", `/api/advances/${advance.id}/approve`, {}, 403);
  await call("POST", `/api/advances/${advance.id}/reject`, { notes: "رفض اصطناعي موثق" });
  await call("POST", `/api/advances/${advance.id}/reject`, {}, 400);

  const period = day.slice(0, 7);
  await call("POST", "/api/payroll/generate", { period }, 201);
  const again = await call("POST", "/api/payroll/generate", { period }, 201);
  assert.equal(again.created, 0, "Repeated generation must not duplicate a payroll");
  let records = await call("GET", `/api/payroll?period=${period}`);
  const payroll = records.find(record => record.employeeId === employee.id);
  assert.ok(payroll, "Attendance-disabled active employment must still be included in payroll preparation");
  await call("PATCH", `/api/payroll/${payroll.id}`, { allowances: "125junk" }, 400);
  await call("PATCH", `/api/payroll/${payroll.id}`, { allowances: "١٢٥٫٥٠", deductions: "۲۵٫۲۵" });
  records = await call("GET", `/api/payroll?period=${period}`);
  assert.equal(Number(records.find(record => record.id === payroll.id).netSalary), 1600.25);
  await call("POST", `/api/payroll/${payroll.id}/approve`, {});
  await call("PATCH", `/api/payroll/${payroll.id}`, { allowances: "999.00" }, 400);
  await call("POST", `/api/payroll/${payroll.id}/pay`, {}, 403);
  const { rows: [payment] } = await db.query("SELECT count(*)::int AS n FROM payroll_records WHERE status='paid'");
  assert.equal(payment.n, 0);

  const evaluation = await call("POST", "/api/evaluations", {
    employeeId: employee.id, period, scoreQuality: "٥", scoreProductivity: "٤",
    scoreAttendance: "٣", scoreTeamwork: "٢", scoreDiscipline: "١",
  }, 201);
  assert.deepEqual([
    evaluation.scoreQuality, evaluation.scoreProductivity, evaluation.scoreAttendance,
    evaluation.scoreTeamwork, evaluation.scoreDiscipline,
  ], [5, 4, 3, 2, 1]);
  assert.equal(Number(evaluation.overallScore), 3);
  const evaluations = await call("GET", `/api/evaluations?employeeId=${employee.id}`);
  assert.ok(evaluations.some(row => row.id === evaluation.id));
  await call("POST", "/api/evaluations", { employeeId: employee.id, period, scoreQuality: "4x" }, 400);
  const report = await call("GET", `/api/hr/reports?type=employees&from=${day}&to=${day}`);
  assert.ok(JSON.stringify(report).includes(employeeData.employeeNumber));
  console.log("PASS: scoped-session employee save/reload, duplicate and stale-decision prevention, single audit, leave capture/cancellation and no impersonated acknowledgment, HR action creation/step with owner boundary, localized advance/payroll/evaluation, draft-only edits, no financial payment, linked report.");
}
