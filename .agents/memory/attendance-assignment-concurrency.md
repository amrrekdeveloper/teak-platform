---
name: Attendance assignment concurrency
description: Preserve HR location assignments across stale forms and concurrent calendar reviews.
---

Profile edits must submit only intentionally changed fields. Explicit attendance assignment edits require a comparison against both original location and schedule values, and must audit the before/after assignment in the same transaction.

**Why:** A full employee form can keep an old empty assignment while another session assigns a workplace; saving an unrelated profile field can then silently remove the newer assignment. Legacy free-text location descriptions do not prove that a geofence assignment previously existed.

**How to apply:** Do not reconstruct missing production assignments from text notes automatically. Reject stale assignment edits and require reopening the employee form; preserve unrelated saved fields.

Acquire the employees write-intent table lock before freezing attendance evidence.

**Why:** Calendar reviews lock employees before evidence tables. Freezing evidence first and upgrading the employees lock afterward caused a PostgreSQL deadlock during concurrent integration tests.

**How to apply:** Keep employee writes and calendar reviews in a consistent employees-before-evidence lock order; snapshot and audit changes atomically.
