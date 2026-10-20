# Manager integration contract

- Serve `client/public/manager-portal.html` at `/manager-portal` using existing administrative session authentication (not employee OTP).
- Permit authenticated managers through maintenance/domain middleware ONLY for `/manager-portal`, `GET /api/manager/workspace`, `POST /api/manager/warnings`, `POST /api/leaves/:id/decision`, `POST /api/attendance/permission/:id/decision`, and `POST /api/hr-actions/:id/step`. Each handler must verify the actual employee → manager employee → admin user relationship; do not grant broad HR permission.
- Existing `/api/pending-requests` remains available under existing policy.
- Employee acknowledgments use `/api/employee-portal/acknowledgments` and `/:id` under the existing ESS authenticated router, never admin impersonation.
- Startup: `server/routes.ts` now calls exported `initHrWorkflowSupport()` after the existing HR migration block. It adds request history/acknowledgment evidence tables, employee-origin creator support, and permission form details; failures stop registration instead of silently exposing broken handlers.
- This worker registers manager routes in the HR block of `server/routes.ts` and ESS routes from the employee router. Main agent owns maintenance/auth integration and static route registration.
- Candidate actions without an employee identity remain explicitly blocked from ESS acknowledgment; no matching by unverified candidate phone or HR proxy signing.
- HR may explicitly link an existing employee when creating a prehire action (`employeeId`). This permits authenticated employee acceptance without provisioning an admin account. New candidate OTP identity provisioning remains outside this module.
- ESS also exposes `POST /workflow-requests` for WF-04 and WF-06B initiation. These rows use `created_by_employee_id`, with nullable administrative `created_by`; the additive migration must run before using it.
- Add manager/HR scoped `GET /api/hr-permissions/:id/document` to the domain gate. ESS uses `/permissions/:id/document`. The printout labels itself a reconstructed field record, not an approved facsimile of an unavailable original.
- ESS permissions now require `returnDate`, `period` (morning/evening), `purpose` (work/personal/emergency), and `acknowledged:true` in addition to existing fields. The compact portal UI sends these. Old API tests must supply these genuine user choices, not bypass acknowledgment validation.
- Due termination review uses existing HR-only `GET /api/hr-actions?due=true` (no additional middleware path needed) and existing `POST /api/hr-actions/:id/step`. It is rendered in the leaves workspace. Due-date checks never approve owner steps automatically.
- Administrative completion and all employee-creation/chain side effects now share one database transaction; the old post-CAS block was removed. ESS shift selector consumes `summary.shifts` and passes explicit `shiftId`, or omits it for server auto-selection.
