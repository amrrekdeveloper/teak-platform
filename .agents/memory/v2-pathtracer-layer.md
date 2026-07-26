---
name: V2 progressive path-tracer layer
description: How the kitchen-designer-v2 live render mode + three-gpu-pathtracer layer is wired, and its invariants.
---

Rule: V2 room preview has two user-switchable pipelines — persisted `renderMode` `"baked"` (approved unlit bake, default) and `"live"` (real spotlights + PBR + N8AO/Bloom). The path tracer only ever runs on the LIVE scene; baked/unlit surfaces would break GI.

**Why:** customer approved the baked look but wanted a photoreal Stage-1/Stage-2 pipeline on top without losing the approved result; unlit materials give the tracer no light transport.

**How to apply:**
- Frame ownership: any R3F `useFrame` with priority>0 disables auto-render. Contract: EffectComposer renders when `composerActive = live && !tracing`; the tracer blits while tracing; a fallback `gl.render` covers gap frames only. Never let two of these render in the same frame.
- Accumulation must be invalidated on EVERY scene change source: controls start/change, pointer/wheel, store subscribe, canvas resize, AND async loads (poll `scene.environment` per frame — drei `<Environment>` resolves after tracing may have started).
- Device gate: WebGL2 + non-mobile + fine pointer; tracer errors must degrade to real-time only, never break the preview.
- Export: capture `gl.domElement.toDataURL()` in the same rAF as the last `renderSample()` (drawing buffer still intact without preserveDrawingBuffer).
- three-gpu-pathtracer 0.0.24 pairs with three >=0.180 (repo: 0.183.2) and three-mesh-bvh 0.9.x.
