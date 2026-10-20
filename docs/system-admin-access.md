# System administrator access during maintenance

- Owner entry: `/system-admin`; HR entry: `/hr/login`. These are separate scopes.
- Setup uses `TEAK_SYSTEM_ADMIN_USERNAME` and `TEAK_SYSTEM_ADMIN_PASSWORD` at runtime. Values are never rendered, returned by an API, or written to logs.
- First-time setup creates an owner only when the username is unused. An existing active owner may be designated only when its supplied password matches. Existing accounts are never reset or promoted.
- The binding is durable and singleton per database. Changing the two setup secrets after binding does **not** reset the account password.
- Runtime sessions are checked against the current active, non-archived, designated owner. This scope can only list/create/update/reset/disable HR accounts; unrelated ERP routes remain blocked.
- HR password reset or disabling revokes the target's existing administrative sessions. Employee OTP sessions and employee records are not repurposed.
- Account mutations and audit inserts commit together. No password or PIN is returned in list/create/update responses.

## Production preparation

No production database was accessed or changed. Before manual republishing, configure both keys in deployment secrets. On the first production startup the same safe one-time initializer runs against that environment's database. A conflicting existing username fails closed rather than replacing its credentials.

## Verification

- Development startup reported `System administrator setup: configured`.
- Existing 162-test suite passed before adding five focused HTTP cases. Expanded run: 166 passed and one unrelated XLSX test timed out under load; retry of that test file passed all five cases. All eleven system-admin unit/HTTP cases passed in the expanded run.
- Production bundle built successfully; targeted TypeScript output has no system-admin/scope/auth/maintenance diagnostics. Repository-wide pre-existing type errors remain.
- Browser: login layout at 390×844 and 1366×900; synthetic invalid login rejected; unauthenticated HR account API 401; general user mutation and dashboard still 503. No actual owner secrets were read or used for browser login; authenticated UI is not browser-certified.
- Owner account creation tests are mocked database HTTP fixtures, not production operations. Owner protection, strict HR role, password hashing, session revocation and one-time provisioning were checked without altering existing owner accounts.
