---
name: React stale dialog snapshot
description: Why dialogs that capture an entity into state don't reflect query invalidation, and how to keep them live
---

# Stale dialog snapshot

A dialog that stores a whole entity object into local state on open (e.g. `setSelected(row)`) renders a **frozen snapshot**. Mutations that `invalidateQueries` the list refetch the table, but the dialog keeps showing the old object — so newly-uploaded children (documents, line items, etc.) never appear and the feature looks broken.

**Why:** the captured object is a value copy, not a live reference to the query cache. Invalidation updates the cache/list, not the variable already passed into the dialog.

**How to apply:** inside the dialog/section, re-derive the live entity from the query by id:
`const live = (useQuery(["/api/things"]).data ?? []).find(t => t.id === snapshot.id) ?? snapshot;`
Render children from `live`, not the passed-in snapshot. Same pattern fixed HR employee document upload not showing after upload in `employees.tsx`.
