---
name: Maintenance reopening policy
description: Owner-controlled maintenance expiry and publishing health constraints.
---

The maintenance countdown is informational, not authorization to reopen. Reopen the platform only on an explicit owner request, even after the deadline.

**Why:** The owner explicitly requested that expiry keep the platform closed rather than restoring access automatically. Later employee-facing copy changes do not authorize reopening.

**How to apply:** Keep deadline handling separate from enabling/disabling maintenance. Disabling maintenance must be a deliberate change followed by republishing.

The current maintenance page, not the hidden original application homepage, is the approved public entry page. Only the isolated employee portal and the technical-support placeholder may be reachable during maintenance; this is not authorization to expose administrative routes.

**Why:** The owner explicitly approved these two entry points while requiring preservation of the current branding, welcome copy, and responsive layout, with the administrative application remaining closed.

**How to apply:** Preserve the existing public page beyond these entry points. Review maintenance exceptions narrowly; employee-service availability must never imply administrative availability.

Maintenance must remain compatible with Replit's root-path deployment health check.

**Why:** Replit checks `/` when publishing; rejecting every request as unavailable can interfere with deployment health.

**How to apply:** Keep the root page healthy while returning only maintenance content, and block protected APIs separately. Do not interpret the healthy root response as permission to bypass maintenance.