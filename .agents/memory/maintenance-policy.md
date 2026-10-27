---
name: Maintenance reopening policy
description: Owner-controlled maintenance expiry and publishing health constraints.
---

The maintenance countdown is informational, not authorization to reopen. Reopen the platform only on an explicit owner request, even after the deadline.

**Why:** The owner explicitly requested that expiry keep the platform closed rather than restoring access automatically. Later employee-facing copy changes do not authorize reopening.

**How to apply:** Keep deadline handling separate from enabling/disabling maintenance. Disabling maintenance must be a deliberate change followed by republishing.

The current maintenance page, not the hidden original application homepage, is the approved public entry page. The owner additionally authorized narrowly scoped HR management and direct-manager workspaces during maintenance; this does not authorize the general administrative platform.

**Why:** The owner expanded the scope to complete HR/attendance while preserving the approved homepage and keeping unrelated administration closed.

**How to apply:** Preserve the public page except the approved footer shield beside teak. HR uses an active HR administrative account; managers require actual employee-manager relationships. Enforce narrow server-side scopes. Employee OTP never authorizes administration, and HR preparation never authorizes financial disbursement or owner-only decisions.

The owner separately authorized a system-administrator entry to provision HR administrative accounts during maintenance, using owner-selected secrets.

**Why:** The owner needs to create production HR credentials without reopening the general administrative platform.

**How to apply:** Restrict this entry to the explicitly designated owner and HR account management only. Bootstrap once per database; never overwrite existing accounts or passwords on restart or silently promote a conflicting username. Development account rows do not imply production provisioning.

Maintenance must remain compatible with Replit's root-path deployment health check.

**Why:** Replit checks `/` when publishing; rejecting every request as unavailable can interfere with deployment health.

**How to apply:** Keep the root page healthy while returning only maintenance content, and block protected APIs separately. Do not interpret the healthy root response as permission to bypass maintenance.

Verify new HR pages and APIs through the real maintenance gate, including direct refresh of nested pages, not only an isolated route handler.

**Why:** A new authenticated HR route can pass its isolated integration tests while the live application's maintenance allowlist rejects it with 503 before its handler runs.

**How to apply:** Add only the exact required HTML paths and HTTP-method/API patterns to the existing HR scope. Cover both permitted requests and denied neighboring/manager/system-admin routes; never solve this by reopening the general platform.