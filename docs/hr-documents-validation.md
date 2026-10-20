# HR documents and reporting validation

## Follow-up implementation correction (supersedes initial persistence blockers below)

Missing persisted HR-001 fields were **implementation gaps**, not missing company policy. The follow-up implements them:

- `shared/hr-leave-form.ts`: strict public input contract and versioned snapshot type.
- `server/hr-leave-form.ts`: exported `initHrLeaveForm()` adds nullable `leave_requests.leave_form_data JSONB` without rewriting legacy records; wired after `initHrWorkflowSupport()` in the existing initialization sequence.
- `shared/schema.ts`: additive `leaveFormData` property.
- Existing HR POST `/api/leaves` and existing ESS POST `/leaves` now call `captureLeaveForm(...)` **before the same existing insert**, using authenticated actor identity. The server snapshots employee/selected substitute identity, annual entitlement/usage/balance/year/calculation time and previous leave/recorded return. Neither endpoint trusts submitted balances, identities or approvals.
- HR create form captures passport, destination, reported departure/return, substitute selection, leave address/phone, ticket/visa details, notes, HR entitlement date and previously unrecorded actual return date. Snapshots are consumed by the existing full-field print mapping.
- ESS backend supports the same additional capture fields. **ESS HTML integration remains pending with its owning worker**. Optional `employeeAcknowledged:true` records ordinary electronic acknowledgment with session employee ID and server timestamp. HR cannot submit acknowledgment for an employee. Employee cannot submit `hrReview`.
- `hrReview` supports HR-only `entitlementDate`, `lastReturnDate`, `lastLeaveType`. Leave balance is always calculated server-side, never accepted from browser.
- Legacy records keep NULL snapshots; their unknown fields remain honestly unrecorded, not externally blocked. No backfilled approval/signature or retrospectively fabricated balances.
- Available commencement DOCX now has a **16-field print mapping**, wired in `HrActionCard` for WF-03 through `HrCommencementDocument`. Uses actual employee, linked offer and timeline evidence. Department-manager signature and separate payroll-effective date print as unrecorded when absent; existing WF-03 has no department-manager step. This is a remaining workflow/data capture gap, **not a missing-original blocker**.

ESS owner integration contract: extend the existing leave request JSON with optional `leaveFormData: {passportNumber?,destination?,actualDepartureDate?,actualReturnDate?,substituteEmployeeId?,leaveAddress?,leavePhone?,ticketDetails?,visaDetails?,notes?,employeeAcknowledged?}`. Dates ISO YYYY-MM-DD; substitute ID positive integer; no employee ID, balances, approval fields, signature strings or HR review data. Exact acknowledgment is exported as `LEAVE_ACKNOWLEDGMENT`. Request-level employee identity remains from session. No new endpoint or parallel workflow is needed.

Remaining completion gaps (not external blockers): ESS HTML field capture; authenticated integration/print/archive verification; collection/linkage of substitute-signature evidence; missing department-manager and payroll-effective-date values on legacy/current WF-03 records; exact paper-style layout parity. Missing original official legal wording remains an external blocker only for the specific other documents listed below.

## Evidence inspected

- `attached_assets/وثيقة_التشغيل_الموحّدة_لنظام_الموارد_البشرية_والحضور_والانصراف_1784811973039.pdf`: 19 pages, cover dated **23 July 2026**. Rendered using PyMuPDF; cover visually checked. Text reviewed for employee-file structure, workflows, payroll, advances, and change appendix. Page 19 describes the future-change register; it is not a filled 24 August appendix.
- `attached_assets/HR_Module_Requirements_1775466026332.docx`: extracted original document XML, reviewed employee PDF/export, archive, custody and onboarding fields.
- `attached_assets/HR_System_Update_Report_v3_1781419308980.docx`: extracted original document XML, reviewed attendance, leave, commencement and financial integration requirements.
- `attached_assets/تيك-المواصفة-الموحّدة-HR-والحضور_1784739293353.docx`: extracted as supplementary historical reference.
- `attached_assets/نموذج_طلب_اجازه_جديد-1_1781419263295.pdf`: rendered and **visually reviewed**; one-page bilingual **HR-001 V01** official leave form.
- `attached_assets/نموذج_المباشرة_للموظف_بعد_حصوله_على_اجازة_1781419263295.pdf`: rendered and **visually reviewed**. Despite its filename, its actual content is an **Inter Office Memo**, subject “موظف جديد”, addressed to chief accountant from general manager, dated November 4, 2024. It is not evidence of the complete official return-from-leave notice.
- `attached_assets/مباشرة_جديد_1781419263295.docx`: actual XML contains “Effective Date Notice / اشعار مباشرة عمل”, employee information, department-manager confirmation and HR recommendation.
- The August 24 amendment requirements are reproduced in `Pasted--TEAK-COMPLETE-HR-ATTENDANCE-DEVELOPMENT-INTEGRATION-AN_1792484771347.txt`; a separately named original dated August 24 was not located among the PDF/DOCX assets. Do not claim the original appendix was compared visually.

Reproducible renderer/extractor: `.agents/scripts/render_hr_forms.py`; local evidence under `.agents/outputs/hr-forms/`. These renderings are review artifacts, not production documents.

## HR-001 V01 actual field-by-field mapping

Implementation: `client/src/lib/hr-official-forms.ts`, opened from the selected employee's leave entries in `employee-detail.tsx`. Print output is a full-field RTL data review, **not a claim of exact pixel/layout compliance or a signed official PDF**. Missing stored fields are printed explicitly as “غير مسجل — يُستكمل من الجهة المختصة”.

| Actual paper field | Source / result |
|---|---|
| File No. / رقم الملف | employee.employeeNumber; internal request ID also shown |
| Request date | leave.createdAt, Asia/Riyadh |
| Name | fullNameAr / fullNameEn |
| Employee No. | employeeNumber |
| Dept. | department |
| Position | position |
| Passport No. | Captured in leaveFormData.submitted.passportNumber; legacy missing values remain unrecorded |
| Nationality | nationality |
| ID No. | iqamaNumber |
| Mobile No. | phone |
| Accrued / unpaid / other leave | leaveType, with reason; not fabricated checked paper boxes |
| “Other — specify” | reason |
| Leave duration | days |
| Leave starting day | startDate |
| Leave ending day | endDate |
| Destination | leaveFormData.submitted.destination |
| Actual departure date | submitted.actualDepartureDate, requester-reported, not travel verification |
| Actual return date | submitted.actualReturnDate, requester-reported, not travel verification |
| Substitute name | Server-resolved substitute.name snapshot |
| Substitute employee number | Server-resolved substitute.employeeNumber snapshot |
| Substitute signature | IMPLEMENTATION GAP: separate substitute acknowledgment evidence not collected yet |
| Employee acknowledgment | Verbatim visually transcribed: “أتعهد أنا الموقع أدناه بالالتزام بمواعيد عودتي من الإجازة المعتمدة.” |
| Address and telephone during leave | submitted.leaveAddress + submitted.leavePhone |
| Employee signature | Ordinary ESS acknowledgment with server actor/time when opted in; no HR impersonation; ESS HTML control pending owner integration |
| Annual entitlement date | HR-only hrReview.entitlementDate captured; no guessed policy date |
| Leave balance | Server-owned immutable request-time balance/year/calculation-time snapshot; no browser supplied balance |
| Date of return from last vacation | Latest completed WF-04 returnDate or explicitly recorded HR-only value |
| Last leave type | Server snapshot from latest prior approved leave, with supported explicit HR-only correction |
| Head of department approval | managerApprovedBy and managerApprovedDate, explicitly ordinary electronic decision, not signature |
| HR approval | approvedBy, approvedDate, status, explicitly not signature |
| Director general approval | IMPLEMENTATION GAP: no separate evidence in existing leave approval workflow; no fabricated signature |
| Notes | notes |
| Form code | HR-001 V01 |
| Black-ink signature invalidation footer | Original wording reproduced as paper-only rule; no invented digital equivalent |
| Ticket / visa fields requested by amendment | **Not present on this actual attached HR-001 page**; captured as supplementary ticketDetails / visaDetails without inventing official wording |

Existing category codes and department codes are retained as authentic values; translation/paper-box layout parity remains a presentation follow-up.

## Other official documents: exact blockers

| Document | Evidence / status |
|---|---|
| WF-08 confidentiality agreement | **BLOCKED**: operating spec describes workflow but not full approved agreement clauses. No authoritative agreement text located in inspected named HR originals. Do not generate invented legal text. Automatic generation/archive not implemented. |
| Loan Request Form | **BLOCKED**: no original named paper form located. Existing schema lacks loan type (ordinary/furnishing/emergency), manager recommendation/signature, previous-loan snapshot, finance-approved amount/terms/first installment, and management signature evidence. Advance screen opens/prints existing actual financial record, explicitly labeled **not official form**. |
| HR-002 V01 permission | **BLOCKED**: requirement lists fields but original wording/layout was not located in inspected named originals. Current history shows actual employee-specific stored date/type/time/hours/reason/status. Complete period/purpose/approvals/signatures are not fabricated. |
| HR-004 V01 entitlement receipt | **BLOCKED**: approved receipt acknowledgment text and original form not located. Financial summary cannot substitute legal acknowledgment. |
| Warning / violation notice | **BLOCKED**: approved original not located in inspected named originals. Existing workflow remains intact. |
| Return-from-leave notice | **BLOCKED**: misleadingly named PDF is actually new-employee accounting memo (see evidence above), not an approved return notice. |
| Probation termination notice | **BLOCKED**: approved wording not located. |
| HR-APP-0015.01 commencement | **PARTIAL / IMPLEMENTED PRINT MAPPING**: full available DOCX fields printed from WF-03, employee/offer and timeline. Extracted content does not establish this specific form code. Department-manager signature and payroll-effective date still require capture when absent, not a missing-original blocker. |
| HR-006 V01 job offer | **BLOCKED**: approved complete wording/form not located. Existing offer workflow is not replaced. |
| Leave settlement | **BLOCKED**: financial calculation policy and approved original settlement wording are not fully established by available originals. |

Commencement DOCX fields requiring workflow integration: name, employee ID, position, hiring/commencement date, employee signature, nationality, employee name in personnel notification, department manager name/signature/date, actual payroll-effective date, HR recommendation, approved/rejected selection, HR director signature.

Accounting memo PDF fields requiring separate mapping: addressee (chief accountant), sender (general manager), date, subject, name, employee number, specialty, location, salary, ticket, other allowances, leave, actual commencement date, deductions, general-manager approval, HR-manager approval. The historic fixed date is reference content, never a default for new documents.

## Reporting, archive, permissions and responsive implementation

- Genuine XLSX uses existing ExcelJS. Full export has master sheet `المصنع` containing **all employees**, then each actual department. Department selection exports only that department. Names are sanitized and deduplicated within Excel's 31-character limit. RTL, frozen headings, filters, numeric salary formatting, print setup and counts are included. No CSV renamed `.xlsx`.
- Employee list search/status/department filters also drive print preview. The all-employee workbook intentionally ignores search/status filters to meet the required all-employees master; button wording distinguishes workbook from filtered print.
- Individual attendance lives inside selected employee file → leaves/attendance. API query includes employee ID and date bounds; client filters returned records by exact employee ID again. Shared Riyadh/shift functions are used. Unassigned split-shift historical events remain separate and explicitly unclassified, never silently collapsed into morning/evening.
- Individual report currently covers **recorded events**, not a complete absence calendar. Days without events are not fabricated absences. Shift configuration changes have no historical snapshot in this UI; retrospective policy classification needs review.
- Permission history in the same section filters exact employee ID, including historical statuses and recorded hours.
- Finalized and draft evaluations can be opened and printed with all five dimensions, average, full strengths and improvements. Drafts clearly labeled; no risk-driven finalization.
- Payroll bulk sends `{ids, action}` to the main agent's endpoint and lists **every returned result**. Owner/accountant-only payment controls; HR/owner preparation controls. Separate select-all controls for draft approval and approved payment; mixed ineligible selections cannot execute. Dirty/paid records cannot be selected; approved records cannot be edited. Financial confirmation before payment. No payments executed during this work.
- Advance approval currently disburses; therefore its button is owner/accountant-only. HR rejection remains available. **Server role alignment must be verified by main agent**.
- Shared expanded workspace supports full-height mobile view, close button and Escape; payroll, employee list and advances use mobile card-style table presentation.
- Existing employee archive endpoint is reused in the employee file. User can save report as PDF then upload PDF/JPG/PNG, max 10MB, into that employee's existing archive. **Automatic generated-PDF archival is not implemented**; browser print cannot return a PDF binary. Requires approved document renderer/storage integration, linkage/version metadata, access checks and signature evidence. This is not concealed behind a false archive-success button.
- Employee deletion now requires typing exact employee number and sends `{confirmEmployeeNumber}`; protected-history rules remain server-authoritative.
- **Missing birth date**: no birth-date field found in inspected employee schema/form. Backend additive field + validation required before honest UI persistence can be implemented.
- Training records are not present in owned screens; no parallel training subsystem invented.

## Validation

Focused tests: `client/src/lib/hr-documents.test.ts` and `server/hr-leave-form.test.ts`: **10 tests passed**. Cover real XLSX signature, master/department counts, RTL, numeric salary, formula-like strings remaining literal strings, safe sheet names, leave/commencement field mapping, additive migration, snapshots, session identity boundaries, HR impersonation rejection, strict payloads and valid dates.

TypeScript check run against current workspace; no diagnostics in owned pages/components/helpers at last check. Existing unrelated workspace errors may remain; this is not a full project compile claim.

No app/workflow restarted, no browser tester invoked, no production SMS/payments/journals modified. Main agent owns final integrated tests, desktop/mobile visual checks and authenticated print/archival validation. Signed-in UI and actual printed page breaks are **not visually verified**.
