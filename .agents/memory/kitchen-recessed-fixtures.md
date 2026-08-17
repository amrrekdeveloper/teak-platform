---
name: Recessed fixtures & elevated drag planes
description: Kitchen 3D tool — sinks/ceiling items need real cutouts and drag planes at their own elevation
---

- A basin/fixture rendered "inside" a solid box slab stays hidden: the slab must become a THREE.Shape-with-holes ExtrudeGeometry (holes slightly smaller than the fixture so its rim covers cut edges; dispose the geometry in effect cleanup). Share one bowl-layout memo between the cutout and the fixture meshes so they never diverge.
- The invisible pointer drag plane must sit at the dragged item's elevation. Ceiling-mounted items dragged against a y≈0 plane get perspective-offset placement; use `ceilingM - item.height`.
- Island fit tests: per-wall inset = max(cabinet run, in-swing door envelope, wall) + walkway clearance — never a priority ternary; and single-wall (I) rooms have no measured depth (getFloorBounds fakes 120cm), so freestanding-fit features must reject them explicitly.

**Why:** all three were caught as FAIL findings in architect review of the island/sink work — cheap to prevent, expensive to debug visually (headless has no WebGL).
**How to apply:** any new countertop fixture, ceiling/elevated decor drag, or freestanding-footprint feature in the kitchen tool.
