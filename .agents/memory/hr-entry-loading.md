---
name: HR entry loading
description: Keep the operational HR workspace independent of unrelated application entry points.
---

HR navigation must use its own application entry, not load the entire public/ERP application first.

**Why:** The owner reported white-screen entry from the public footer. Browser testing observed delayed rendering through the general entry even while direct login eventually worked. The dedicated entry preserves access without depending on unrelated marketing and 3D modules.

**How to apply:** Preserve both development and production entry routing and an explicit loading/error state. Select the entry using the original navigation URL: Vite middleware can rewrite the working request URL before the application fallback runs. Confirm the served HTML, not just whether the eventual React page looks correct.

A successful in-app HR navigation does not prove that its URL is valid for a fresh request.

**Why:** While sharing the login entry, HR content once rendered at an unprefixed URL that the maintenance gate would reject after refresh. The correct-looking screen concealed a broken deep link.

**How to apply:** After shared-entry or router changes, verify that HR navigation retains its `/hr/` prefix and survives a full reload; keep the shared staff entry and system selector outside that base.

Normal sign-in startup must not display the unstyled HR loading/reload screen before the actual form.

**Why:** The owner explicitly rejected its brief appearance after pressing the public shield; it looked like a broken page even when loading succeeded.

**How to apply:** Keep normal startup visually quiet and consistent with the page background. Show recovery instructions only for an actual loading failure, not as initial HTML content.

Do not rely on attributes on the source module-script tag for production loading-error recovery.

**Why:** Vite rewrites that tag and drops its inline `onerror` attribute in the published HTML, even though it works during development.

**How to apply:** Install error recovery independently of the rewritten tag and verify the built HTML, not just the source template. Do not show a startup failure after React has already mounted.
