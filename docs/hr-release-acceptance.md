# TEAK HR / attendance acceptance — 20 October 2026

## Release gate

**NOT RELEASE-APPROVED yet.** Implemented functionality and passing automated checks do not establish full compliance with the supplied 16-section specification. Missing implementation is reported as FAIL, not misrepresented as an external blocker. Production was not published or tested; no real SMS or production payments were sent.

## Requirements traceability

Detailed field mappings and test evidence are in the linked domain reports. PASS below refers to the stated narrow check, not blanket end-to-end certification.

| Requirement | Existing system / changes | Result / acceptance evidence |
|---|---|---|
| 1 Preserve interrupted work; inspect references | Existing routes, employee portal, schema and HR pages reused; official July operating specification, HR requirement/update DOCX, HR-001 and commencement originals reviewed | PASS inspection; [document evidence](hr-documents-validation.md). No resets or replacement system |
| 2.1–2.2 Maintenance homepage + shield | `maintenance.html`, `maintenance.ts`, `hr-workspace.tsx` | PASS narrow routing tests; same public composition/content, footer shield added |
| 2.3–2.4 HR scope | `shared/hr-access.ts`, `server/hr-access.ts`, `auth.ts` | PASS policy tests: active HR scope, fresh DB role, no unrelated ERP APIs; payment has independent strict role check |
| 3.1 Onboarding | Existing employee form/API; optional admin linkage, Saudi phone, date of birth additive column | Implemented; browser acceptance recorded separately |
| 3.2 Unique mobile | `hr-data-integrity.ts`, `hr-onboarding.ts` | PASS integration rejects duplicate normalized phone at database level; legacy duplicates preserved and fail closed for ESS |
| 3.3–3.4 Employee file/manager | Existing employee detail + attendance/permission history; actual manager relationship | Implemented; full training/financial file completeness not certified |
| 3.5 Deletion | Explicit number confirmation; transaction + dependency checks; commenced employees cannot be permanently deleted | Implemented; no cascading removal of history |
| 4 ESS / OTP | Existing independent employee cookies and HR identity; development-only 1111 unchanged | PASS integration/security tests; live production SMS untested |
| 5.1–5.4 Attendance/GPS/time/shifts | `attendance-support.ts`, existing ESS service, `shared/attendance.ts` | PASS scoped tests, GPS rejection does not fabricate attendance; configurable separate shifts; production reconciliation after configured end |
| 5.5–5.6 Monitor/risk | Independent employee/date/shift rows, filters/cards, monthly score | Implemented and unit tested; historical effective-dated schedules remain FAIL |
| 5.7–5.8 Corrections/notifications | Transactional corrections/audit, protected medical upload, deduplicated alerts | Implemented; employee medical-attachment submission remains FAIL |
| 6 Leave/permission | Existing tables; manager then HR; clarification/history; cross-year distinct dates | PASS 14 workflow/request tests; HR-001 full persistence assessed separately |
| 6.3 HR-002 | Actual period/purpose/return/duration/acknowledgment and printable field document | Implemented structured record; original official facsimile BLOCKED pending approved original |
| 7 WF02–10 | Existing workflow engine retained; employee-only acknowledgment, version binding, owner protection; finalization/employee creation/chains now atomic | Core implemented with 19 focused tests; independent prehire candidate identity not implemented (FAIL); complete all-workflow acceptance not established |
| 7.1 Manager | `/manager-portal`; existing admin credentials + actual employee relationship | Implemented; no unrestricted HR directory/payroll access |
| 7.2 Acknowledgment | ESS session-bound immutable record snapshot/hash | Implemented; explicitly ordinary acknowledgment, not a qualified digital signature |
| 8 Official documents | Existing forms and reusable RTL print previews | See field-by-field report: missing official wording BLOCKED; available-but-unimplemented fields FAIL |
| 9 Payroll/advances | Transactional journal/payment/installment updates, strict roles, bulk per-record results | PASS 20 mocked safety tests; real financial/concurrency acceptance not certified |
| 9.4 Evaluations | Open/print/export five dimensions, draft/final labels | Implemented; no automatic risk finalization |
| 10 Individual attendance | Selected employee report, date filters, shift status, print | Implemented, ID filtering preserved; historical schedule snapshots absent |
| 11 XLSX/fullscreen | Genuine ExcelJS workbooks, المصنع + department sheets, HR expanded workspace | PASS 4 report/field tests; browser evidence separate |
| 12 Mobile/desktop | Compact RTL HR workspace/cards, existing ESS preserved | Browser results recorded separately; no blanket visual certification |
| 13 Security/regressions | Scoped API gates, no shared-password employee auth, strict payroll roles | Policy/integration coverage passes; not a full security scan |
| 14 Verification | Unit/integration suite, build, TypeScript, browser | Updated executed results below |
| 15 Boundaries | No new sales/inventory/accounting UI, no invented WF01/deductions/signature rules | Preserved |
| 16 Release/Git | Current main working tree, no configured origin/main reference | FAIL release gate until listed gaps addressed; GitHub synchronization not verified |

## Executed automated checks

- `npm test`: **155 / 155 passed**, 18 files, including real isolated-development OTP/session/summary tests, attendance validation, workflow rollback, payroll safety and report/form tests.
- `npm run build`: production bundle built successfully. This is not proof that a production deployment starts or real SMS works.
- `npx tsc --noEmit`: **FAIL**, 161 diagnostics in repository-wide output at the latest recorded check. Targeted new HR/ESS modules and touched UI had no diagnostics in the filtered output. Existing baseline errors are still release debt, not a clean typecheck.
- Browser testing exposed legacy startup seed/reconciliation rewriting existing identities. This was fixed: populated databases skip account seeding and historical identity repair is no longer executed on startup. Fresh startup logs confirmed those updates no longer run.
- A second browser run exposed summary HTTP 500 during an in-progress schema hot reload. The additive leave-form initializer was then applied and added to integration setup. Real OTP→summary integration passes after the migration.
- Verified in browser so far: maintenance shield → scoped HR login → employee creation, stored DOB/mobile/manager, `user_id = NULL`, HR logout → development OTP accepted. Temporary fixtures removed; retained manual development employee left unchanged.

### Final focused browser results

**PASS** on isolated development fixtures:
- Registered HR-mobile OTP login and ESS summary/dashboard.
- In-zone check-in/out; one correct pair persisted.
- Duplicate check-in/out rejected; missing-coordinate request returns 400.
- Out-of-zone attempt rejected, violation recorded without false attendance.
- Annual leave: employee → actual manager → HR final approval; employee balance 21 → 19 for the two-day fixture.
- Permission: pending → manager-approved; actual 1.50-hour duration stored. **HR-final permission decision was not tested**, not claimed passed.
- Manager sees only the assigned synthetic report; unauthenticated ESS 401; synthetic owner/IT accounts rejected by HR login 403; nonexistent payment attempt denied.
- ESS login: no document overflow at 360/390/430/1366/1920px. Dashboard checked at 390 and 1920. **Full HR/manager screen/viewport sweep not completed.**

The native GPS-denial dialog could not be driven reliably; its UI response remains unverified despite API missing-GPS rejection passing. All generated fixtures (accounts, employees, sessions, OTP, geofence, requests, attendance, violations and notifications) were removed. The retained user-requested development fixture was preserved.

The manager-history raw JSON disclosure was replaced with labeled fields after this pass; ESS refreshes on returning to the visible tab. These small fixes were syntax-checked, not a claim of a second full browser pass.

### Remaining implementation / acceptance gaps (FAIL, not external blockers)

- Independent pre-employment candidate acceptance without an existing eligible employee identity.
- Employee-side medical attachment submission and complete historical effective-dated schedules.
- Full WF02–10 browser acceptance, HR-final permission browser decision, no-manager/clarification browser cases, all HR screen responsive/print sweeps.
- Automatic generated-PDF archival, complete substitute-signature and commencement approval/effective-date capture, exact paper-layout parity.
- Repository-wide TypeScript errors and production-build startup smoke acceptance remain unresolved; successful bundling alone does not close this release gate.

HR-001 now has persisted server-owned identity/balance snapshots and additional HR/employee capture fields; available commencement DOCX content has a mapped WF03 print view. Missing persisted fields are not described as unavailable official originals.

### Source-change map

- Authorization/maintenance: `shared/hr-access.ts`, `server/hr-access.ts`, `server/auth.ts`, `server/maintenance.ts`, `client/src/pages/hr-workspace.tsx`, `client/src/App.tsx`, maintenance footer.
- Data safety: `server/hr-data-integrity.ts`, HR onboarding helper, existing employee routes/form/schema; retired startup identity repair and existing-database account reseeding. HR response bodies are excluded from request logging.
- Attendance: `shared/attendance.ts`, `server/attendance-support.ts`, existing attendance route/service blocks, shift monitor/review components and attendance page.
- Requests/workflows: `server/hr-workflow-support.ts`, manager workspace, permission document, ESS acknowledgments, existing action panel/leaves/portals and workflow definitions.
- Payroll: `server/hr-payroll.ts`, payroll/advance route and storage methods, existing payroll/advance pages.
- Documents/reports: shared leave form schema, `server/hr-leave-form.ts`, document/commencement/archive/expanded-workspace components, employee details, evaluations and report libraries.
- Regression tests: added attendance, scope, workflow/finalization, payroll, official field/XLSX tests and extended real development ESS integration setup.

## Reference / policy blockers

- Approved confidentiality clauses, full loan original, HR-002/HR-004 official originals, and several notice/offer/settlement originals were not located. Do not fabricate legal text or signatures.
- Overnight workday attribution requires an approved rule. Configure single/split shifts with explicit end times; do not infer overnight policy.
- Taqnyat production SMS delivery and provider IP allowlist remain explicitly untested by user instruction.

## Preview

Base: `https://11d2b925-a028-4977-b4c0-981128bc10b1-00-3ewlfqd22igm7.kirk.replit.dev`

- `/` approved maintenance homepage.
- `/hr/login` existing active HR administrative username/password; no default credential created.
- `/hr/employees`, `/hr/attendance-monitor`, `/hr/leaves`, `/hr/payroll`, `/hr/advances`, `/hr/evaluations`.
- `/employee-self-service` HR mobile identity; development 1111 only when explicitly enabled.
- `/manager-portal` existing administrative credentials linked to an active manager employee with actual reports.

## Manual acceptance sequence

1. HR login → Employees → add unique employee number/mobile, employment fields and attendance eligibility. Administrative user linkage is optional.
2. Assign an actual manager when required; configure authorized attendance zone and work schedule.
3. Log out → employee portal → registered mobile → development OTP → own dashboard.
4. Grant browser GPS, check in/out within authorized zone; confirm personal history.
5. Submit leave and permission. For assigned manager, review in manager portal first; then HR final decision. Verify employee sees status/history.
6. HR payroll: prepare/approve only. Do not use real disbursement for acceptance testing.

## Git

Changes are saved in the current workspace on `main`; the working tree is not clean. No `origin/main` tracking reference was available for comparison and no GitHub push was performed. Do not infer remote synchronization from Replit checkpoints.
