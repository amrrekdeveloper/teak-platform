---
name: Development verification caveats
description: Environment resets and real-session/real-PostgreSQL coverage that isolated test adapters miss.
---
When a browser run reports an environment reset followed by a development 502, check the managed workflow state and temporary files before treating it as an application crash.

**Why:** During verification on 2026-10-21, the development workflow became `not_started` and `/tmp` outputs disappeared while source files and database fixtures remained. Resuming the workflow restored the app; this alone did not imply an authentication regression.

**How to apply:** Preserve disposable fixture identifiers in durable tool state, re-create temporary inputs if needed, and resume the same test run rather than creating more fixtures or repeating completed flows. Avoid running long shell verification concurrently with a resetting browser environment.

Mocked role adapters and SQL assertions do not establish compatibility with actual administrative sessions or PostgreSQL enum-backed columns.

**Why:** Isolated tests passed while real HR requests failed authorization and configuration updates failed SQL type comparison. The real session path and actual database execution exposed these different failures.

**How to apply:** For changed guards, exercise one HTTP request after genuine session login. For multi-table configuration queries, execute against the actual development schema inside a rollback-only transaction rather than relying solely on query-string mocks.

Temporary privileged accounts can receive role-wide notifications from unrelated concurrent tests or background work, even when their own test only signs in.

**Why:** A disposable HR login fixture acquired dependent notifications during parallel attendance tests, so an apparently isolated account could not be removed directly.

**How to apply:** Retire disposable privileged accounts before cleanup and remove only their precisely scoped dependent artifacts; never clear notifications belonging to real accounts to make cleanup pass.

Forced termination of a background fixture server does not prove its database cleanup ran, even if the listening process is gone.

**Why:** Stopping a disposable server terminated the process but left its synthetic schema behind; a JavaScript `finally` block is not a cleanup guarantee under forced termination.

**How to apply:** Keep the exact fixture scope available, verify its synthetic markers after stopping, and remove only that confirmed scope. Never delete schemas or rows by a broad prefix to compensate for an interrupted cleanup.

String/wildcard route guards are not parsers for JSON identifiers or scores. Test HTTP payloads with the actual numeric types sent by HR forms, not string-only fixtures or just the workflow engine.

**Why:** A route-level integer parser rejected valid numeric JSON before the HR operation ran. Engine/database tests passed while real HTTP creation failed; silently defaulting scores also concealed localized-number errors.

**How to apply:** Keep strict path-segment validation separate from strict body-number validation. Reject malformed values explicitly, normalize localized digits before numeric conversion, and verify the controller through an authenticated synthetic session.

A single disposable SQL schema is shared state across test files, even if the test runner isolates JavaScript modules. Serialize those files or provision separate schemas; fixtures must never borrow another suite's employee.

**Why:** Parallel runs hid a routing test's dependency on an existing employee and produced attachment/protocol failures that did not recur in isolation. Serial execution exposed the missing fixture instead of relying on incidental test order.

**How to apply:** Give each scenario explicit synthetic records and scoped cleanup/rollback. Retain concurrency inside the scenarios that test races; disabling file-level parallelism must not disable those checks.
