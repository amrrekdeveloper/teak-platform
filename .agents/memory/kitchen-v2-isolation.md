---
name: Kitchen Designer V2 isolation
description: Rules for the experimental V2 kitchen designer track vs the production V1 tool.
---

The experimental "Design Your Kitchen 2" lives under `/kitchen-designer-v2*` with its own zustand persist key `teak-kitchen-tool-v2` and pure mm-based geometry model.

**Why:** V1 (`/kitchen-designer`, key `teak-kitchen-tool`) is production and must never be refactored, redirected, or have its storage read/migrated by V2 work. A unit test asserts the V2 store source never mentions the bare V1 key.

**How to apply:** All future V2 phases (openings, cabinets, materials, persistence) must build only on the V2 store/model, keep mm canonical (cm only at the input boundary), and keep wall IDs/order deterministic with explicit inward normals. V2 pages are gated to owner/it/designer via `V2Gate`. Project unit tests run with `npm test` (vitest, added for this track).

**R3F spotlight aiming:** attach the target as a `<primitive>` CHILD of the fixture group with a LOCAL position (e.g. `[0, -ceilingY, 0]` for straight down). Setting the target's position to world-like coords inside a translated group double-applies the offset (world = group + target). Detached targets never aim at all.

## V2 intelligent designer contract
The «الأداة المطورة» flow uses a semantic plan contract with a deterministic guard whose governing rules are: service-point fidelity is a HARD constraint (sink↔water, cooktop↔gas — infeasible design beats a relocated sink), service fidelity outranks the ergonomic sink-cooktop gap, fallback is a utility-aware planner (never fixed templates), the renderable mapping stays a replaceable adapter, customer UI never mentions AI, and the public planning endpoint stays strictly validated + rate limited because it triggers paid model calls.

## Baked lighting beats real lights for static room previews
Real-time spotlights cannot reproduce GI render quality: they leave floating mid-wall blobs and per-orientation wall tone differences. For static architectural previews, bake lighting into unlit canvas textures generated from the entered dimensions (ceiling-hugging scallops at computed fixture positions, corner shading, contact shadows) and keep real lights only for PBR floor/fixtures. For truly recessed ceiling spots, cut real holes in the ceiling shapeGeometry (Path.absarc holes) and put the cavity ABOVE the ceiling plane — a cavity below always reads as protruding.
