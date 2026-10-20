---
name: HR startup data safety
description: Preserve live HR decisions when applying additive startup migrations.
---

Do not reapply hardcoded account roles, activation, employee/user linkage, salaries, or locations on startup. Separate schema migration from identity/data repair.

**Why:** Browser acceptance found an old startup routine updating existing accounts on every restart and a legacy employee reconciliation overwriting current HR decisions. The owner explicitly requires preserving real records and testing only isolated fixtures.

**How to apply:** Existing populated databases must skip baseline account seeding. A historical data repair needs an explicit reviewed operation, not reactivation because it was once described as idempotent. Repeatable SQL can still overwrite valid current business data.

Never use the absence of a historical default username as proof that an installation is empty.

**Why:** A second bootstrap path used that assumption even when the main baseline seeder skipped populated databases; legitimate owner-selected account names could therefore trigger destructive setup.

**How to apply:** Audit every startup entry point, not just the main seed guard. Production startup must not seed default credentials or clean business records. First-owner provisioning is a separate, narrowly authorized operation.
