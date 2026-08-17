---
name: Google Maps loader & drawing
description: Shared Maps JS loader rules, DrawingManager removal, key restrictions, auth-failure detection
---
- Google removed `DrawingManager` from Maps JS API v3.65+ (weekly channel). Zone drawing uses custom editable Circle/Rectangle drawing (click modes) in `attendance-zones-map.tsx` — never re-add the `drawing` library.
- All map consumers must use the shared loader `client/src/lib/maps-loader.ts` (`initMapsLoader`/`loadMapsLibrary`); calling `setOptions` twice throws.
- Key auth failures do NOT reject `importLibrary` — hook `window.gm_authFailure` (see `onMapsAuthFailure`) or the map fails silently.
- The prod Maps key restricts referrers to teak-sa.com / www / teak2030.replit.app; dev preview needs `https://*.replit.dev/*` added or you get `RefererNotAllowedMapError`.
- When logging Maps errors, log `err?.message`, not the error object (opaque in console capture).
