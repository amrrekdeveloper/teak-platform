---
name: HR entry loading
description: Keep the operational HR workspace independent of unrelated application entry points.
---

HR navigation must use its own application entry, not load the entire public/ERP application first.

**Why:** The owner reported white-screen entry from the public footer. Browser testing observed delayed rendering through the general entry even while direct login eventually worked. The dedicated entry preserves access without depending on unrelated marketing and 3D modules.

**How to apply:** Preserve both development and production entry routing and an explicit loading/error state. Select the entry using the original navigation URL: Vite middleware can rewrite the working request URL before the application fallback runs. Confirm the served HTML, not just whether the eventual React page looks correct.
