---
name: Persistent file storage policy
description: Uploaded files must live in Object Storage, never the local disk
---

# Persistent file uploads

**Rule:** All user-uploaded files (employee docs, survey files, delivery photos, and
any future uploads) MUST be persisted in Replit Object Storage, never on the local
filesystem.

**Why:** The Replit production filesystem is ephemeral — wiped on every redeploy/restart
and not shared across Autoscale instances. DB metadata persisted but the files vanished,
causing 404s. This was a confirmed production data-loss incident.

**How to apply:**
- Use the shared server-side helper for save/stream/delete; configure multer with
  in-memory storage so the buffer is handed to the helper (no disk writes).
- Keep DB URL shapes stable for backward compat; serve routes resolve the stored name
  and stream from Object Storage.
- Preserve each route's existing RBAC/auth guard — private files are only as protected
  as the route serving them. For sensitive/personnel files, `requireAuth` (any logged-in
  user) is NOT enough; match the serve route's role guard to the data (e.g. HR document
  serve route must be `requireRole("owner","assistant","hr")`, same roles as the data API).
- On upload, roll back the stored object if the follow-up DB write fails (avoid orphans).
- Files uploaded to production BEFORE this fix are permanently lost and must be re-uploaded.
