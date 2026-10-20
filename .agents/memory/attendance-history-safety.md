---
name: Historical attendance evidence
description: Preserve observed daily schedules without inventing missing historical policy.
---

Treat the schedule attached to an observed business day as immutable. Configuration edits must not silently reinterpret that day; explicit attendance corrections remain audited.

**Why:** The owner requires accurate historical attendance when HR changes schedules. Legacy records do not contain enough information to reconstruct every original schedule.

**How to apply:** Use captured daily schedules for reporting and reconciliation. Clearly mark older days lacking schedule evidence for HR review rather than fabricating a history or generating automatic penalties from current settings. Never describe this as a reconstruction of missing past policy.

Unknown schedule-dependent metrics must be unavailable at their source, not merely hidden behind an “unverified” status. Every risk calculation, alert and export must explicitly require verified schedule evidence.

**Why:** Labelling a row unverified alone leaves numeric lateness actionable to other consumers, creating false monthly scores and HR alerts. A zero or green badge also falsely implies that an entirely undocumented period was assessed.

**How to apply:** Return null for unknown lateness/early departure, render “غير متاح”, exclude unknown days from scoring and alerts, disclose excluded-day coverage, and never recalculate exports against current settings.
