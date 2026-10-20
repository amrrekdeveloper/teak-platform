# Payroll and advance validation

## Scope and authorization
- HR/owner prepare and approve payroll; only owner/accountant disburse approved payroll.
- Explicit active, nonarchived role checks do not inherit IT bypasses or permission grants.
- Advance approval includes disbursement and therefore requires owner/accountant. HR can prepare/reject pending requests.
- Bulk POST `/api/payroll/bulk` accepts 1–200 numeric IDs and `approve|pay`; every input gets `{id,ok,message}`. Duplicate IDs and unauthorized or ineligible records receive explicit failures. Each eligible record has its own transaction.

## Integrity
- Payroll row lock covers approval/payment. Employee and advance locks serialize installment recovery/disbursement.
- Journal header, lines, repayment history, remaining balance and paid status commit or roll back together.
- Historical journals attached to an unpaid record block retries pending reconciliation; no guessing whether an old partial posting is safe.
- Active leaf accounts are looked up from the current chart by their existing semantic names and account type, never assumed numeric codes. Missing/ambiguous accounts block posting.
- Draft-only edits recompute net under a row lock. Approved and paid records cannot be edited.
- No attendance deductions. Existing manual deduction formula is retained; negative/inconsistent totals are rejected.
- Approval binds the installment to its advance; insufficient balance or a changed advance blocks payment.

## Additive migration
`initPayrollSafety()` in `server/hr-payroll.ts` is invoked after advance table initialization in routes. It adds the approved enum state, approval metadata, advance binding and an immutable-per-payroll repayment table. It does not rewrite historical payroll, advances or journals. Shared schema is intentionally untouched; database rows expose the additional state/metadata at runtime.

## Tests
`server/hr-payroll.test.ts` uses mocked pool/client and storage only; it never connects to a database, pays real employees, posts production journals or changes balances.
Coverage: exact cents/formula, invalid amounts, invalid net, transaction commit/rollback/release, paid/draft refusal, rollback after journal writes when repayment insert fails, single-active-advance guard, and strict role isolation.

Run: `npx vitest run server/hr-payroll.test.ts`.

Execution evidence: all 20 mocked tests passed, including final-installment rounding (Vitest, development workspace). TypeScript reported existing routes-wide Express parameter typing errors; no errors were reported in the new payroll service, tests or modified storage methods.

Real PostgreSQL concurrency, migration execution, and signed-in UI journeys must be verified by the owning integration agent using an isolated disposable database. Mock tests do not establish live database concurrency behavior or chart configuration readiness.
