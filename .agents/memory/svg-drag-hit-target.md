---
name: SVG drag hit target & listeners
description: Reliable pointer-drag on SVG elements — hit target must be the painted shape, and moves belong on window
---

**Rule:** For draggable SVG elements, put `onPointerDown` and the `data-testid` on the painted shape (`<rect>`/`<path>`), never on a wrapping `<g>` that also contains labels/lines. Handle moves with window-level `pointermove`/`pointerup` listeners added at drag start (callbacks read from refs), not SVG-level handlers + `setPointerCapture`.

**Why:** A `<g>` bounding box includes its labels, so its center can land on unpainted space — SVG hit-testing only fires on painted areas, making both real clicks and Playwright center-clicks silently miss. SVG-level move handlers also break when the pointer leaves the SVG mid-drag.

**How to apply:** Any SVG drag interaction (kitchen plan openings, sketch tools): pointerdown on the shape → register window listeners → remove them on pointerup/pointercancel. Give labels `pointerEvents: "none"`.
