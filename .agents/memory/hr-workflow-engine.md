---
name: HR workflow engine invariants
description: Rules for the generic hr_actions multi-step approval engine (wf02..wf10) and its auto-chains.
---

Rule: step advancement must be a conditional UPDATE (`WHERE id AND current_step = expected AND status IN (pending,in_progress)`) returning the row; 0 rows → 409. Auto-chained follow-up actions are deduped by a partial unique index on `(linked_action_id, workflow)` plus a lookup-before-create.

**Why:** the naive read-then-write flow let two concurrent "complete" calls both finalize the last step, double-creating chained actions and duplicate employees (wf03 auto-creates an employee record).

**How to apply:** any new workflow chain or state machine over `hr_actions` (or similar) must go through `storage.advanceHrAction` and check `getHrActionByLink` before creating chained actions. Final-step completion also revalidates required `formData` fields server-side (client sends fill-in values in the step body, merged before validation).
