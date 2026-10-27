---
name: Historical attendance evidence
description: Preserve observed daily schedules without inventing missing historical policy.
---

Treat an observed period's saved schedule as immutable. Explicit HR configuration edits may update today's unused periods, but must retain periods with punches, earlier days, and an audit of before/after schedules. Reading a report must never refresh evidence.

**Why:** The owner requires accurate historical attendance when HR changes schedules. Legacy records do not contain enough information to reconstruct every original schedule.

**How to apply:** Use captured daily schedules for reporting and reconciliation. Clearly mark older days lacking schedule evidence for HR review rather than fabricating a history or generating automatic penalties from current settings. Never describe this as a reconstruction of missing past policy.

Do not delete attendance or leave data from the most recent four Riyadh calendar days, including today, in either environment.

**Why:** On 2026-10-27 the owner authorized discarding older attendance/leave history if truly needed, but explicitly prohibited deleting the most recent four days. This is permission, not an instruction to erase older history unnecessarily.

**How to apply:** Prefer non-destructive repairs. Any proposed cleanup must preserve recent records and their dependent evidence/audits; never treat development data as automatically disposable. Isolated synthetic test fixtures can be cleaned up without touching real employees.

Unknown schedule-dependent metrics must be unavailable at their source, not merely hidden behind an “unverified” status. Every risk calculation, alert and export must explicitly require verified schedule evidence.

**Why:** Labelling a row unverified alone leaves numeric lateness actionable to other consumers, creating false monthly scores and HR alerts. A zero or green badge also falsely implies that an entirely undocumented period was assessed.

**How to apply:** Return null for unknown lateness/early departure, render “غير متاح”, exclude unknown days from scoring and alerts, disclose excluded-day coverage, and never recalculate exports against current settings.

An old shift snapshot does not prove which weekdays were working days. Weekly calendars require their own evidence; the former Friday/Saturday default is only an uncertain legacy display, never proof for penalties.

**Why:** Production had captured shift hours but no recorded workweek policy. Applying the newly confirmed Saturday–Thursday week retroactively would invent absence and lateness.

**How to apply:** Schedule normal policy changes for a future date. Correct today or a past day only through explicit, reasoned HR review that preserves original punches and previous classification. Even an approved working-day review cannot establish absence when the original daily shift/end time is missing.

HR must be able to exclude an erroneous checkout while retaining the valid check-in and the original evidence.

**Why:** The owner reported accidental checkout punches that ended employees' shifts and could not be corrected through the existing excuse dialog. Both movements must remain inspectable; an excuse alone does not reverse a checkout.

**How to apply:** Separate movement correction from absence excuses. Preserve an audit trail and require an explicit HR decision rather than automatically deleting closely spaced punches.
