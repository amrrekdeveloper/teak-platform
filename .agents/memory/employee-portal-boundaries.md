---
name: Employee portal boundaries
description: Owner-approved employee identity, SMS provider, and separation from administrative access.
---

Employee self-service must use existing eligible HR employees and their registered, uniquely normalized mobile numbers. It must not create duplicate employees or administrative accounts, and employee authentication must never grant an administrative session.

**Why:** The owner approved an independent employee portal while keeping the original administrative application behind maintenance and preserving existing HR workflows.

**How to apply:** Keep employee sessions independently revocable and derive employee identity from the authenticated session, never browser-supplied employee IDs. Reuse HR attendance, leave, permission, and approval records.

The approved SMS provider is Taqnyat and the approved sender name is TEAKSA. Production login must fail closed when the provider cannot deliver; the owner authorized fixed code `1111` in development only, without sending SMS.

**Why:** The owner supplied this provider and sender explicitly and prohibited activation of an incomplete or insecure login flow.

**How to apply:** Keep credentials in Secrets and avoid logging codes or tokens. Verify actual provider acceptance before claiming SMS login works; do not change provider security restrictions without the owner's decision.

Keep the provider's IP allowlist enabled; production SMS must use an approved fixed outbound address rather than removing the restriction.

**Why:** The owner explicitly chose to retain IP restrictions. Switching between Autoscale and Reserved VM does not provide a guaranteed static outbound IP.

**How to apply:** Do not remove provider IP restrictions. The owner later instructed that publishing stays on Replit and they will perform the real SMS test; do not block local implementation on another server setup or claim production delivery is verified. Development simulation must be visibly isolated, unavailable in production, and must not silently replace failed live SMS or grant administrative access.
