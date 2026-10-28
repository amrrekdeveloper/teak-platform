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

Owner password recovery must be explicitly requested, independently authorized per environment, and durably single-use. Bootstrap-secret edits alone must not silently overwrite an existing owner's password.

**Why:** Shared credential configuration must not transfer recovery authorization between environments. Continuously applying a configured password would reintroduce startup identity repair and undo later password changes.

**How to apply:** Require an environment-specific operator consent and recovery identifier plus the pending secret, match the approved existing active designated owner, and atomically hash/update the password, revoke only their administrative sessions, clear only their per-username login limit, and audit consumption. A shared password alone must never authorize either environment; authorization for one must not authorize the other. Reusing the identifier must never reapply recovery. Preserve historical consumption records and do not add a public secret-based login fallback.
