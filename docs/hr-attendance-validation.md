# HR attendance implementation and validation

## Scope and evidence

Read assignment sections 5, 10, 11, 12 and attendance acceptance cases, and `.agents/memory/attendance-location-model.md`. Existing employee home-location text, recorded geofence name, and zone definitions remain distinct; the monitor retains its dynamic union and client-side location filtering.

No workflows were restarted, no production publish was performed, no SMS was sent, and no real employee data was edited by this worker. Browser/visual acceptance belongs to the main agent.

### Implemented

- Session-owned employee portal attendance uses server timestamps and strict GPS checks, including freshness, finite coordinates, accuracy ≤50m, and the entire GPS uncertainty circle inside the active circle/polygon. Rejected events never insert attendance records.
- Duplicate transitions are rejected under the existing employee advisory lock. Rejected checkout without entry records `missing_checkin`; completed checkout retries do not create that violation. Out-of-zone attempts persist separately.
- Configurable one/two shifts use employee → department → default precedence. Separate shift keys are persisted on existing attendance records. Legacy unassigned records are **not guessed** into split shifts. No default end time is invented.
- `shiftAttendanceStatus` detects missing checkout only strictly after configured end; the morning and evening are evaluated separately. Overnight configuration is explicitly rejected pending owner policy.
- Durable violation uniqueness is employee/day/shift/type; insertion and employee/manager/HR/owner notifications share one transaction. `reconcileAttendance(day)` is safe to retry.
- Individual bounded-date report API isolates the requested employee, shows shift, entry/exit, late minutes, early departure, correction flag, and legacy/configuration warnings. The monitor includes responsive shift cards and print/save-PDF for that employee only.
- Added shift editor to existing work settings, expanded-workspace toggle, actual RTL XLSX export (ExcelJS), Riyadh date presets/boundaries/time edits and formatting.
- Monthly risk calculation uses independent shifts, excludes dates before contract commencement, weekends, approved leave and corrected records, and accounts for missing-entry attempts without manufacturing checkout. Scores persist separately by employee/month; no payroll/performance side effect.
- Corrections allow only explicit time/notes fields. Employee lock, update, full before/after audit, and nonduplicated emergency/medical leave creation are transactional. Medical approval requires a linked protected attachment.
- Medical upload/download are HR-authorized, limited to 5MB PDF/PNG/JPEG, validate magic bytes and MIME, store content outside public static paths (database bytea), force download, disable caching/sniffing, and expose no public URL.

## Integration required at startup

After the existing attendance tables exist and **before accepting portal requests**, call:

```ts
await ensureAttendanceExtensions();
```

Export: `server/attendance-support.ts`. This is additive SQL; `shared/schema.ts` is unchanged. Columns: work settings `work_end_time`, `shifts`; records `shift_key`; violations `business_day`, `shift_key`. New support tables: `attendance_medical_attachments`, `attendance_monthly_risk`.

`registerAttendanceSupport` is already registered inside the attendance route block with existing HR authorization.

Host scheduler must invoke `reconcileAttendance()` every five minutes, and invoke yesterday plus a bounded missed-date catch-up at startup. An end time must first be explicitly configured by HR. Worker does not silently start a timer or invent a closing hour.

Employee-file integration may mount `AttendanceShiftReview` from `client/src/components/attendance-shift-review.tsx` with `employeeId` and `employees={[]}`, or consume `GET /api/attendance/employees/:employeeId/report?from=YYYY-MM-DD&to=YYYY-MM-DD`. Monitor already mounts the component.

## Regression evidence

Executed:

`npx vitest run shared/attendance.test.ts server/attendance-support.test.ts server/employee-portal/security.test.ts`

Result: **3 test files, 22 tests passed**. Tests cover Riyadh midnight, grace boundary, schedule precedence, no invented end time, exact shift end, absence before end, independent evening shift, missing entry, overlaps/overnight rejection, risk bands, unreliable/out-of-zone GPS, durable notification transaction retry contract and rollback.

The transaction tests use an isolated mocked DB adapter; they do **not** prove PostgreSQL concurrency. Existing portal integration fixture now initializes the additive attendance migration and cleans its added violation/risk notifications. Stale GPS validation was moved before any schedule DB access to return the expected 400 even before querying extensions.

TypeScript check produced no diagnostics in the new attendance modules, monitor, shared attendance or portal services. Repository-wide typecheck still has unrelated/pre-existing errors; this is not a claim of a clean global build.

## Explicit remaining gaps / acceptance gates

- Main agent must initialize migrations, connect the scheduler/catch-up, rerun real fixture integration and verify PostgreSQL concurrent retries and secure attachment authorization. This worker did not run migrations against production.
- Legacy attendance identity endpoints are a separate security integration dependency: disable/bind old shared-password/browser-ID paths. The new portal path must not be bypassable through old routes.
- Current shift assignment is not effective-dated; changing a shift schedule can change historical report interpretation. Stored monthly values preserve separate months but recalculation is not an immutable historical policy snapshot.
- The new default collective monitor tab uses independent employee/day/shift rows with interactive counts, employee/department/shift and existing location/date filters, late/early minutes, protected corrections, rejected out-of-zone indicators, genuine XLSX and print/PDF. Approved leave, weekends and pre-commencement dates are not marked absent. The old daily aggregate is explicitly relegated to a collapsed historical-review section; its exports are labeled legacy.
- Split-shift portal submission automatically selects the currently configured period. `/summary` now returns `shifts: [{id,label,start,end,graceMinutes}]`; the static-portal owner should render this selector and submit `shiftId` with GPS events. Early/late attendance outside split windows is rejected for HR correction, not silently assigned to another shift.
- Overnight workday rules, holiday calendar, retention policy, antivirus scanning, original unavailable forms, and automatic financial deductions are not invented or claimed complete.
- Secure attachments are accessible to authorized HR/owner/IT; employee-submitted medical attachments through the self-service leave workflow require additional integration.
- No mobile/desktop screenshots or end-to-end browser testing were performed by this worker. Validate 360/390/430 and 1366/1920 viewports, print pagination, Excel RTL and keyboard/upload dialogs before acceptance.

## Follow-up integration fixes

- Diagnosed actual PostgreSQL error with nonmutating EXPLAIN: SQLSTATE `42804`, notifications `type` expected enum while `SELECT DISTINCT` resolved the warning literal to text. Added explicit `::notification_type` and integer related-ID cast; no data/trigger bypass.
- Duplicate-phone fixture now asserts SQLSTATE `23505`, then changes its own fixture employee phone and checks revocation of the previous session, restoring the fixture phone for later OTP tests.
- Re-ran portal integration + attendance support + shared attendance: **3 files, 22 tests passed**, including real isolated portal fixtures with mocked SMS. Only existing storage duplicate-member build warning appeared. Focused typecheck remains clear for owned attendance files.
