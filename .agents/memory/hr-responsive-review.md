---
name: HR responsive verification
description: Human-use requirements and RTL scroll-container traps in HR interfaces.
---

The factory's HR workspace needs distinct usable phone and desktop presentations, short headings, and no redundant mobile navigation/header content. Keep employee identifiers and business dates readable rather than compressing wide desktop reports into fragmented text.

**Why:** The owner repeatedly required operational mobile-first interfaces for real employees, while preserving useful existing desktop layouts.

**How to apply:** Use labeled phone cards and readable desktop tables; a wide report may scroll within its labeled results region. Do not delete apparently duplicated records merely to make a screen look tidy; expose record numbers and dates so HR can distinguish them.

Verify Arabic RTL visually as well as English LTR. A normal document width does not prove the content is unclipped.

**Why:** Cross-axis overflow can create a second vertical body scroll container; this produced RTL-only right-edge clipping despite normal document/body width metrics and an acceptable LTR screenshot.

**How to apply:** Check actual scroll ancestors and overflow behavior when a mobile edge is cut. Prefer one page scroll surface; reserve local scroll surfaces for deliberate wide tables and bounded dialogs, not generic clipping wrappers.
