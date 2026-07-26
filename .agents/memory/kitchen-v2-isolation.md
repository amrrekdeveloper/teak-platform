---
name: Kitchen Designer V2 isolation
description: Rules for the experimental V2 kitchen designer track vs the production V1 tool.
---

The experimental "Design Your Kitchen 2" lives under `/kitchen-designer-v2*` with its own zustand persist key `teak-kitchen-tool-v2` and pure mm-based geometry model.

**Why:** V1 (`/kitchen-designer`, key `teak-kitchen-tool`) is production and must never be refactored, redirected, or have its storage read/migrated by V2 work. A unit test asserts the V2 store source never mentions the bare V1 key.

**How to apply:** All future V2 phases (openings, cabinets, materials, persistence) must build only on the V2 store/model, keep mm canonical (cm only at the input boundary), and keep wall IDs/order deterministic with explicit inward normals. V2 pages are gated to owner/it/designer via `V2Gate`. Project unit tests run with `npm test` (vitest, added for this track).

**R3F spotlight aiming:** attach the target as a `<primitive>` CHILD of the fixture group with a LOCAL position (e.g. `[0, -ceilingY, 0]` for straight down). Setting the target's position to world-like coords inside a translated group double-applies the offset (world = group + target). Detached targets never aim at all.
