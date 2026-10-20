# HR workflow / manager / ESS validation

## Executed checks

- **PASS**: `npx vitest run server/hr-workflow-support.test.ts server/hr-request-decisions.test.ts server/hr-finalization.test.ts`: 19 tests across 3 files. Covers cross-year clipping, overlapping-day deduplication, exact five-year boundary, actual manager authorization, HR non-bypass, no administrative employee-signing, owner protection, clarification routing, historical auto-approved immutability, version/hash binding, injected employee/chain insertion failures with rollback, employee linkage commit, existing-chain deduplication and due-date guards. Transaction-failure tests use an injected transaction adapter, not a live database.
- **PASS**: both standalone portal scripts parse using `new Function` (syntax check only).
- **PASS (targeted)**: TypeScript output contains no diagnostics for the new support/manager/permission-document/acknowledgment modules, ESS services, HR action panel, or leaves page.
- **FAIL (repository baseline)**: full `tsc` is not clean; many existing Express parameter `string | string[]` and downlevel collection diagnostics remain throughout `server/routes.ts` and other existing files. No claim of a clean repository typecheck.
- **PASS (visual, limited)**: screenshot of already-running `/manager-portal` at 402×874 shows a readable RTL login form without horizontal overflow. An unauthenticated/scoped-session rejection is displayed. Signed-in manager/employee screens were **not** visually verified.
- **BLOCKED / not run**: authenticated browser flows, real PostgreSQL concurrency/load tests, real OTP/SMS, production operations. No workflow was started/restarted by this worker; no SMS was sent.

## Implementation evidence

- Existing `leave_requests`, `attendance_permissions`, and `hr_actions` remain the request/workflow systems. No parallel request engine.
- Leave/permission decisions lock their existing row, verify current direct-manager relationship or HR stage, update status and append history in one transaction. Existing `auto_approved` data is rejected as terminal and not rewritten.
- ESS acknowledgment locks the HR action, verifies the employee session owns it and that the displayed SHA-256 version is current, records document snapshot/session/time/step, advances the same action and creates applicable linked action in the same transaction.
- Administrative actions cannot execute employee steps, cannot change documents after preparation, and use a CAS including both form and timeline to avoid overwriting concurrent clarification or document changes.
- Administrative CAS, WF-03 employee creation, source/action employee linkage, and automatic child creation now execute in one Drizzle transaction on the existing tables. Insert failures propagate and roll back finalization (the old swallowed employee-creation error and post-CAS side-effect block were removed). Employee number is deterministic per onboarding action; the existing database phone guard remains active.
- Scheduled WF-05 due list is available through the existing HR-only `/api/hr-actions?due=true` endpoint and visible in the leaves workspace. It uses the completed source contract-end date. Explicit HR preparation still invokes the existing step endpoint, followed by protected owner/authorized-management approval and employee acknowledgment. Future scheduled actions cannot advance through admin or ESS completion. No scheduled job auto-approves or mutates employee employment state.
- ESS displays the returned shift schedule in a compact selector and sends the chosen `shiftId` with attendance requests; leaving it automatic omits that field for server selection.
- Employee-created WF-04/WF-06B records have their actual employee creator recorded; no invented administrative identity. WF-03 commencement date can be recorded by its linked employee before reviewing and acknowledging the new version.
- Employee-visible request decision history and clarification replies are persisted; separate admin notifications remain best-effort. No outbound SMS notifications were introduced.
- Manager workspace exposes direct reports only, review history, pending/completed records, warnings, return confirmation, non-renewal review, and clarification. Administrative login uses `/api/manager-access/login`; ESS remains independent.
- Annual leave usage counts distinct approved dates clipped to each calendar year. Current-year entitlement uses actual five-year anniversary; historical/future year requests use year-end entitlement (no proration policy invented).
- Permission creation records the five existing categories, departure/return dates/times, duration, period/purpose, justification/notes, employee snapshot and ordinary acknowledgment evidence. Overlapping creations serialize per employee. Printable field record includes reference/date, employee fields and reviewer history.
- Startup migration is exported and wired after existing HR migrations; includes evidence/history tables, permission `form_details`, widened hours precision, nullable admin creator plus employee creator on HR actions.

## Outstanding / release limitations (do not report as completed)

- **BLOCKED**: prehire candidates without an existing eligible employee/session cannot acknowledge WF-02/WF-03. Deliberately no HR proxy signing or unverified phone matching. HR can explicitly link an existing employee when creating a prehire action. A verified candidate identity provisioning design is still required for independent prehire completion.
- **BLOCKED**: official HR-002 paper facsimile/wording not located as a standalone original. Reviewed the supplied consolidated HR specification and HR module requirements. The print renderer labels itself a reconstructed electronic field record, not an approved paper-form facsimile.
- **BLOCKED**: acknowledgment currently covers the displayed HR record only, not unseen PDF attachments or official NDA wording. It is explicitly **not** a legally qualified digital signature.
- **NOT RUN**: live PostgreSQL process-crash/concurrent-session injection. The implementation now has a single transactional commit boundary for administrative completion and side effects, tested with failure injection at the transaction adapter.
- **INTENTIONAL**: due actions require explicit authorized human workflow steps rather than automatic termination. No background task bypasses owner approval.
- **POLICY NOTE**: older consolidated specification describes manager-only permission approval; this implementation follows the delegated current instruction for manager-first then HR review and the current request's HR review fields. Confirm that intentional override at release.
