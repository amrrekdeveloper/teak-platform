---
name: Reversible attendance movement corrections
description: Keep original punches and apply explicit, audited exclusions consistently across attendance consumers.
---

Exclude mistaken punches through reversible decisions in the existing audit ledger, not physical deletion or a second attendance ledger.

**Why:** HR must remove an accidental checkout from calculations while retaining the valid entry and original evidence. Reusing the existing audit ledger also avoids a production schema migration solely for exclusion metadata.

**How to apply:** Every attendance calculation and employee transition must honor the latest exclusion/restoration decision. Administrative history still displays excluded originals. Unrelated time edits or excuse approvals must never implicitly reinstate an excluded movement. Explicit restoration and edits require the version the reviewer actually saw.

Do not infer accidental checkout solely from a short attendance interval.

**Why:** Reported mistakes included both approximately one-minute and fourteen-minute intervals; the same intervals can also represent legitimate early departures.

**How to apply:** Prevent duplicate request writes and require checkout confirmation, but leave ambiguous existing punches to explicit, reasoned HR correction. Never automatically delete production punches based on elapsed time.
