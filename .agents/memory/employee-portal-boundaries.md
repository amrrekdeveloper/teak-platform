---
name: Employee portal boundaries
description: Owner-approved employee identity, SMS provider, and separation from administrative access.
---

Employee self-service must use existing eligible HR employees and their registered, uniquely normalized mobile numbers. It must not create duplicate employees or administrative accounts, and employee authentication must never grant an administrative session.

**Why:** The owner approved an independent employee portal while keeping the original administrative application behind maintenance and preserving existing HR workflows.

**How to apply:** Keep employee sessions independently revocable and derive employee identity from the authenticated session, never browser-supplied employee IDs. Reuse HR attendance, leave, permission, and approval records.

The approved SMS provider is Taqnyat and the approved sender name is TEAKSA. Live login must fail closed when the provider cannot deliver; simulated codes are for isolated tests only.

**Why:** The owner supplied this provider and sender explicitly and prohibited activation of an incomplete or insecure login flow.

**How to apply:** Keep credentials in Secrets and avoid logging codes or tokens. Verify actual provider acceptance before claiming SMS login works; do not change provider security restrictions without the owner's decision.

Keep the provider's IP allowlist enabled; production SMS must use an approved fixed outbound address rather than removing the restriction.

**Why:** The owner explicitly chose to retain IP restrictions. Switching between Autoscale and Reserved VM does not provide a guaranteed static outbound IP.

**How to apply:** Arrange a fixed-egress gateway before claiming production delivery is ready. The owner requested development-only code `1111`; any development simulation must be visibly isolated, unavailable in production, and must not silently replace failed live SMS.
