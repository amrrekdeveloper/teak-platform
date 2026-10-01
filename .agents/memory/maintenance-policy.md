---
name: Maintenance reopening policy
description: Owner-controlled maintenance expiry and publishing health constraints.
---

The maintenance countdown is informational, not authorization to reopen. Reopen the platform only on an explicit owner request, even after the deadline.

**Why:** The owner explicitly requested that expiry continue to show «لا زالت المنصة تحت التطوير» rather than restoring access automatically.

**How to apply:** Keep deadline handling separate from enabling/disabling maintenance. Disabling maintenance must be a deliberate change followed by republishing.

Maintenance must remain compatible with Replit's root-path deployment health check.

**Why:** Replit checks `/` when publishing; rejecting every request as unavailable can interfere with deployment health.

**How to apply:** Keep the root page healthy while returning only maintenance content, and block protected APIs separately. Do not interpret the healthy root response as permission to bypass maintenance.