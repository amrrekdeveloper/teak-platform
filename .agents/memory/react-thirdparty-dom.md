---
name: React + third-party DOM library crashes
description: Why maps/charts/editors that mutate their own DOM crash React with "removeChild ... not a child"
---

# Third-party DOM libraries inside React

**Rule:** A DOM node that a non-React library takes over (Google Maps, charting
libs, rich-text editors, anything that injects/replaces its own children) must be
a dedicated, always-empty container from React's point of view. Never render
React-managed conditional children (loading placeholders, overlays) *inside* that
same node. Put overlays as sibling elements in a `relative` wrapper instead.

**Why:** The library restructures the DOM under that node. When React later tries
to remove a child it thinks it still owns (e.g. a `{!loaded && <div>loading…</div>}`
placeholder once `loaded` flips true), the node is no longer a direct child →
`NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be removed
is not a child of this node` → the whole subtree crashes. React's error overlay
often mislabels the cascade as "Invalid hook call" — don't chase the hook message,
fix the DOM ownership.

**How to apply:**
- Wrapper: `<div class="relative …">` → inside it an empty `<div ref={mapRef} class="absolute inset-0"/>` for the library, plus any loading/overlay UI as *siblings* (also absolutely positioned), never as children of the ref div.
- This was the fix for the attendance zones Google Map crash in
  `client/src/components/attendance-zones-map.tsx`.
