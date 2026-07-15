---
name: Kitchen 3D corner-unit geometry
description: Conventions for L-corner placement, chirality, and corner collision intervals in the kitchen studio
---
- L-corner cabinets render in a local frame with origin AT the wall junction: arm A along +X (wall at z=0), arm B along +Z (wall at x=0). Because the geometry is diagonal-symmetric, chirality is solved by trying both junction walls' frames and picking the one whose +X axis points along that wall away from the junction — no mirroring/negative scale (which would break winding in three.js).
- Collision model: a corner unit blocks its width on its own wall and `cornerAcrossWidth` (width for true L, depth for blind corners) on the adjacent wall; ANY straight cabinet touching a junction blocks [0..its depth] on the adjacent wall so cabinets can't intersect in the corner square.
- **Why:** earlier diagonal-GLB corners and missing protrusion intervals let cabinets physically overlap at corners.
- **How to apply:** when adding placement rules or new corner SKUs, keep intervals asymmetric (own-wall vs across) and test both junction orientations before rejecting a slot.
