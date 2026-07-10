---
name: R3F texture switching hygiene
description: Rules for swappable PBR materials in React Three Fiber scenes (kitchen studio material switcher pattern)
---

# Swappable materials in React Three Fiber

- **Rule 1:** Any texture obtained by cloning (e.g. per-surface `.clone()` to set repeat) must be disposed in a `useEffect` cleanup keyed on the prepared set, or repeated material switches leak GPU memory.
- **Rule 2:** Wrap texture-loading meshes (floor/walls) in their own `<Suspense fallback={null}>` inside the Canvas; otherwise a material switch suspends the whole scene, remounting camera/controls.
- **Rule 3:** Keep `useTexture` inside a dedicated PBR component rendered only when the option has maps, keyed by option id — avoids conditional-hook violations when toggling paint ↔ PBR.
- **Why:** Architect review caught GPU memory growth + full-scene remount in the kitchen designer material switcher (July 2026).
- **How to apply:** Any future "customer picks a finish" feature (countertops, cabinet fronts) should reuse the `SurfaceMaterial`/`PbrSurfaceMaterial` pattern in the kitchen-tool studio scene.
