---
name: Per-account permission system
description: How effective permissions, protected owners, and the route-key model work for the user management feature
---

# Per-account permission system

Owner/IT can grant/revoke per-account module access without changing a user's role.

- **Permission key = route path.** Each sidebar module's key is its wouter route (e.g. `/customers`, `/finance/journal`). Nested routes resolve by longest-prefix match (`getPermissionKeyForLocation`). Base modules (`/`, `/my-profile`) carry `base: true` and are always granted, never toggleable.
- **Effective = role defaults + per-account grants − per-account revokes** (`computeEffectivePermissions`). Exceptions are stored in `user_permissions` (effect `grant`/`revoke`), reconciled against role defaults so a toggle matching the role default deletes the row instead of storing a redundant exception.
- **Protected owners always get ALL keys** and are immune to edit-role / deactivate / archive / delete and to permission edits. Detected by username OR normalized phone against a hardcoded list (`isProtectedOwner`). Enforced server-side on every mutating endpoint, not just the UI.
- **API-level enforcement:** `requireRole` alone made grants cosmetic (sidebar only) — APIs 403'd. Fixed via `API_PERMISSION_BYPASS` in server/auth.ts mapping API prefixes → module keys; on role-check failure, a module grant passes (with `readOnly` and `exclude` guards for sensitive mutations like warehouses create, supplier approval, zones/work-settings writes). New grantable modules need a mapping entry or their APIs stay role-only.
- **Prod data gotcha:** duplicate accounts for the same person (e.g. two Siwar users, hr + warehouse) make grants look "erased" — always check which account was edited vs which one logs in.
- **Effective perms are attached to the login + `/me` responses** as `permissions: string[]`. The sidebar and `PermissionGate` route guard filter by this array; when it's absent (old session) they fall back to the original role-based filter so nothing breaks.

**Why:** keeps RBAC roles stable while allowing fine exceptions; protected-owner immunity prevents an admin from locking themselves/the owners out.

**How to apply:** when adding a new page, add its route-path module to `PERMISSION_MODULES` in `shared/permissions.ts` (with `group` + role defaults) or it won't appear in the editor or be grantable. Persist schema via idempotent startup migration in routes.ts (NOT db:push).
