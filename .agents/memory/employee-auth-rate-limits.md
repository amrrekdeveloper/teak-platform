---
name: Employee authentication rate limits
description: Shared workplace networks and fixture isolation must not lock legitimate employee logins.
---

Retain per-phone cooldowns and per-challenge attempt limits; do not rely on a very small shared-IP verification allowance as the main defense.

**Why:** Several employees can share a workplace NAT, and repeated local protocol tests previously filled a shared IP bucket so a fresh browser's first correct development OTP was rejected.

**How to apply:** Keep a bounded aggregate IP limit plus narrower browser/recipient/challenge limits. Send Retry-After and keep the visible resend countdown consistent. Real-database test fixtures must use their own rate-limit identity and remove only their own counters; never clear users' shared limits to make a test pass.
