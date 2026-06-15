---
name: Toast lifetime & central error translation
description: How notifications and API errors surface to the user (Arabic RTL ERP)
---

# Toast visible lifetime is the Radix `duration` prop, NOT TOAST_REMOVE_DELAY

In the shadcn/Radix toast setup, `TOAST_REMOVE_DELAY` in `use-toast.ts` only controls how long a toast stays in React state *after* it is dismissed (post-close cleanup). It is NOT the on-screen lifetime.

**Why:** A bug had `TOAST_REMOVE_DELAY = 1000000` (~16 min) and people assumed that was the display time; in reality the visible auto-dismiss comes from Radix `Toast.Root`'s `duration` prop. Fix is to set `duration` explicitly per toast in `toast()` (shorter for info/success, longer for destructive) and keep `TOAST_REMOVE_DELAY` small.

**How to apply:** To change how long a toast is shown, set `duration` on the dispatched toast (or pass it per call). Don't touch `TOAST_REMOVE_DELAY` expecting visual changes. Changing the root variant string also means any `group-[.destructive]:` child selectors stop matching — keep child styles variant-agnostic unless the root re-adds the marker class.

# All API errors flow through one Arabic translator

`queryClient.throwIfResNotOk` parses the JSON `message`/`error` field and throws an `ApiError(status, friendlyArabicError(...))` — never the raw `${status}: ${text}`. `client/src/lib/errors.ts` maps technical/DB/English errors + HTTP status codes to friendly Arabic and **passes through** messages that already contain Arabic.

**Why:** Raw `400: {"message":"invalid input syntax for type numeric"}` was leaking into toasts, rendering scrambled in RTL.

**How to apply:** Backend endpoints should return Arabic `message` strings — they are trusted and shown verbatim. Error handlers should just read `e.message` (already clean). Add new technical-pattern mappings in `errors.ts`, not in individual components.
