---
name: HR operational authority and safe amendments
description: Owner-approved HR flexibility, retained leave evidence, and no automatic financial consequences.
---

HR needs authority to resolve requests blocked by a missing or unavailable manager, but exceptions must be explicit and reasoned, not a silent replacement of the normal approval chain.

**Why:** The owner requested an operational system for real employee rights and full practical HR flexibility, while retaining existing records and account boundaries.

**How to apply:** Preserve the usual manager/HR stages; administrative overrides require an authorized HR identity and a recorded reason. Do not promote employee sessions into administrative sessions or move owner-managed HR password resets into an employee portal.

After an approved leave period changes, retain the original and its decisions. Prefer a documented cancellation and replacement request rather than overwriting the approved evidence.

**Why:** Leave changes affect attendance and balances, but must not silently rewrite already-paid wages or accounting entries.

**How to apply:** No physical leave deletion as an ordinary workflow. Warn that cancellation changes leave usage/attendance interpretation but does not automatically amend paid payroll. Keep legacy ERP access usable when reorganizing the independent HR workspace.

Missing hire dates, duplicate mobiles, and unusable manager-account links require real HR input, not invented values or automatic identity merging.

**Why:** Existing production identities and employment terms may differ from the old system's administrative account links. A guessed repair can assign the wrong person or alter service entitlement.

**How to apply:** Surface actionable exceptions, preserve current links until deliberately changed, and fall back to the established service-date reference only when a verified hire date has not been entered. Never invent opening leave balances or carryovers.

New HR API namespaces must retain response-body log redaction.

**Why:** Captured request forms can contain identity numbers, contact details, and employment terms; generic API response logging can expose them even when endpoint authorization is correct.

**How to apply:** Check the HTTP logging exclusion whenever introducing a new HR namespace. Log method, path, status and timing, not employee/form payloads.

Expiry alerts describe recorded evidence, not a legal determination. Missing dates mean unknown, not expired. Reading or snoozing is personal to a reviewer and must not conceal the issue from other HR reviewers.

**Why:** The factory's existing files include missing and potentially stale expiry dates. Treating a warning as verified misconduct, or a shared dismissal as renewal, could affect employee rights unfairly.

**How to apply:** No automatic suspension, payroll deduction, guessed document date, or absence finding from a document alert. Expired snoozes become visible again; renewing a source document produces a fresh alert. External SMS/email sending requires an explicit notification scope rather than being implied by an in-app alert center.

## Preserve the permission-request experience
Keep the existing employee permission form and printed document intact. Changes inside that experience are limited to approval routing and attachments unless the user explicitly authorizes a redesign.

**Why:** On 2026-10-27 the HR manager explicitly praised its usability and printing and requested these two additions only. ZenHR screenshots and the attached proposal are references, not a mandate to copy every menu or replace TEAK's architecture.

**How to apply:** Improve navigation and operational entry points around the form, without reordering its fields or changing the print layout. Reuse the canonical requests and decision engine.

## Approval responsibility and unavailable managers
Changes to request-routing settings apply to new submissions, not to requests already in progress. Existing decisions and approval responsibility must not be rewritten automatically after employee reassignment.

**Why:** Changing who approves an ongoing request can invalidate an HR decision or strand the employee. Production contains manager assignments whose associated accounts cannot approve; guessing account links is unsafe.

**How to apply:** For new requests, make the choice explicit: require an active manager account, or send unavailable-manager cases to HR for review, never auto-approve. Requests whose captured manager later becomes unavailable require a reasoned administrative intervention.
