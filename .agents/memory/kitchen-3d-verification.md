---
name: Kitchen 3D verification limits
description: How to verify changes to the WebGL kitchen designer when headless screenshots can't render it
---
The screenshot/e2e browser environment has no WebGL: every kitchen-designer page (even non-3D ones, because the app splash uses a WebGL loader) renders a "Error creating WebGL context" overlay, and console shows harmless "THREE.WebGLRenderer: Context Lost" artifacts.

**Why:** headless Chrome here cannot create a GL context, so visual acceptance of 3D scene changes is impossible in-agent.

**How to apply:** verify 3D work via `npx tsc --noEmit` (project baseline ~154 pre-existing errors — new files must add 0), clean vite HMR/console logs, and an architect code review; then ask the user to confirm the visual behavior in their real browser. Don't burn rounds on screenshots of /kitchen-designer/* pages.
