---
name: Three.js runtime transparency toggle
description: Why mutating material.transparent at runtime silently does nothing without needsUpdate
---
Toggling `material.transparent` on an already-rendered material (e.g. fade effects driven from useFrame) has no visible effect unless you also set `material.needsUpdate = true` — modern three.js compiles opaque materials with an OPAQUE define that forces alpha to 1, so `opacity` writes are ignored until the shader variant is swapped.

**Why:** hit this with camera-relative wall fading in the kitchen studio — the lerp ran fine but walls never faded.

**How to apply:** set needsUpdate only when the transparent flag actually flips (not every frame); also flip `depthWrite` off while transparent. Program cache makes recompiles after the first one cheap.
