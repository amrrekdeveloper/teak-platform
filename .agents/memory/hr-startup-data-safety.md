---
name: HR startup data safety
description: Preserve live HR decisions when applying additive startup migrations.
---

Do not reapply hardcoded account roles, activation, employee/user linkage, salaries, or locations on startup. Separate schema migration from identity/data repair.

**Why:** Browser acceptance found an old startup routine updating existing accounts on every restart and a legacy employee reconciliation overwriting current HR decisions. The owner explicitly requires preserving real records and testing only isolated fixtures.

**How to apply:** Existing populated databases must skip baseline account seeding. A historical data repair needs an explicit reviewed operation, not reactivation because it was once described as idempotent. Repeatable SQL can still overwrite valid current business data.
