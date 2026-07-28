---
name: Kitchen designer door finish system
description: How V1 studio resolves cabinet door materials after the MR-chipboard redesign
---

The V1 kitchen tool has one real material (moisture-resistant chipboard). Per placed cabinet, `doorPattern` ("wood" | "solid") + `finishColor` (hex from ADEKO_DOOR_COLORS) fully determine the door/front finish and **override** the legacy `finishWoodTypeId` mapping (kept only for pricing grade). The carcass is always matte off-white (`CARCASS_OFFWHITE`) regardless of finish. Countertop `stainless` top finish uses a `metal` flag on AdekoTopFinish — texture maps still load (unconditional useTexture hook) but material props are overridden to plain brushed steel.

**Why:** the factory only manufactures MR chipboard in two surface patterns; showing other "materials" misled customers.

**How to apply:** any new finish option must be expressible as pattern+color; never re-tint the carcass; keep the useTexture hook unconditional when adding metal/plain finishes.

Ready-made templates (`templates.ts`) build kitchens exclusively through `findSlotForCabinet`/`findCornerSlot` so they can never produce colliding layouts — extend templates by adding desired-unit sequences, not coordinates. Static catalog additions must use ids starting with `adeko-` (studio purges other ids on load).
