# System administrator access during maintenance

- Owner entry: `/system-admin`; HR entry: `/hr/login`. These are separate scopes.
- Setup uses `TEAK_SYSTEM_ADMIN_USERNAME` and `TEAK_SYSTEM_ADMIN_PASSWORD` at runtime. Values are never rendered, returned by an API, or written to logs.
- First-time setup creates an owner only when the username is unused. An existing active owner may be designated only when its supplied password matches. Existing accounts are never reset or promoted.
- The binding is durable and singleton per database. Changing the two setup secrets after binding does **not** reset the account password.
- Runtime sessions are checked against the current active, non-archived, designated owner. This scope can only list/create/update/reset/disable HR accounts; unrelated ERP routes remain blocked.
- HR password reset or disabling revokes the target's existing administrative sessions. Employee OTP sessions and employee records are not repurposed.
- Account mutations and audit inserts commit together. No password or PIN is returned in list/create/update responses.

### Convenient sign-in on personal devices

- Opting into “Remember me on this device” retains the username and preference
  locally, and uses a revocable HttpOnly session lasting 30 days. Subsequent
  visits with a valid session open the owner workspace without re-entering
  credentials. Logout and password recovery/change still revoke access.
- Passwords are never stored in application local/session storage. Native
  `username`/`current-password` autocomplete remains enabled. After a successful,
  opted-in login, supported secure browsers are also offered the credentials
  through their own Credential Management storage. Browser policies and
  embedded previews may restrict this; no save prompt is guaranteed.
- Eye buttons only change visibility and accessible labels. They preserve
  native/autofilled values and retain icons after dialog reset and reopening.

## Production preparation

No production database was accessed or changed. Before manual republishing, configure both keys in deployment secrets. On the first production startup the same safe one-time initializer runs against that environment's database. A conflicting existing username fails closed rather than replacing its credentials.

## Verification

- Development startup reported `System administrator setup: configured`.
- Existing 162-test suite passed before adding five focused HTTP cases. Expanded run: 166 passed and one unrelated XLSX test timed out under load; retry of that test file passed all five cases. All eleven system-admin unit/HTTP cases passed in the expanded run.
- Production bundle built successfully; targeted TypeScript output has no system-admin/scope/auth/maintenance diagnostics. Repository-wide pre-existing type errors remain.
- Browser: login layout at 390×844 and 1366×900; synthetic invalid login rejected; unauthenticated HR account API 401; general user mutation and dashboard still 503. No actual owner secrets were read or used for browser login; authenticated UI is not browser-certified.
- Owner account creation tests are mocked database HTTP fixtures, not production operations. Owner protection, strict HR role, password hashing, session revocation and one-time provisioning were checked without altering existing owner accounts.

## Explicit one-time owner password recovery

This is an operator-authorized exception, not continuous synchronization, a
bootstrap reset, a public recovery route, or a secret-based login bypass.
Development and production databases remain independent. No maintenance rules,
owner permissions, account activation, HR accounts or employee identities change.

### Owner runbook after merging

1. Save the chosen new value **once via Secrets**, as
   `TEAK_SYSTEM_ADMIN_RECOVERY_PASSWORD`, available to both intended environments.
   If deployment secrets are maintained separately, securely configure the same
   value there too. Never paste it into chat, a command, a plan, a document or
   logs. An existing secret is not evidence that it contains the newly chosen
   value. Do not change the initial bootstrap password secret for this operation.
   New password policy: 6–256 characters with Latin uppercase, Latin lowercase,
   a digit and punctuation/symbol. Existing login passwords are not revalidated
   against that policy.
2. Confirm `TEAK_SYSTEM_ADMIN_USERNAME` is exactly `khalid90`, already bound to
   the active, non-archived owner in each environment. Do not rename, promote,
   rebind, recreate or reactivate an account to make recovery pass.
3. Authorize **development only**, using development-scoped non-secret settings:

   | Setting | Value |
   | --- | --- |
   | `TEAK_SYSTEM_ADMIN_RECOVERY_DEVELOPMENT_ID` | A new operator-generated UUID |
   | `TEAK_SYSTEM_ADMIN_RECOVERY_DEVELOPMENT_ENABLED` | `development` |

   Restart development after the merge. It must run with `NODE_ENV=development`
   and `REPLIT_DEPLOYMENT` absent or `0`. Look for
   `System administrator password recovery [development]: applied`.
   Sign in personally from `/system-admin` with the chosen value.
4. Separately authorize **production only**, using production-scoped settings:

   | Setting | Value |
   | --- | --- |
   | `TEAK_SYSTEM_ADMIN_RECOVERY_PRODUCTION_ID` | A different new UUID |
   | `TEAK_SYSTEM_ADMIN_RECOVERY_PRODUCTION_ENABLED` | `production` |

   Only the authorized owner/operator may publish the merged version. The
   deployment must run with `NODE_ENV=production` and `REPLIT_DEPLOYMENT=1`.
   Look for `System administrator password recovery [production]: applied`.
   Sign in personally at the published site's `/system-admin` with the **same**
   value. A development result, production-mode fixture test, successful build
   or existence of Secrets is not proof of real production recovery.
5. Track each environment separately. `already_applied` means that UUID was
   consumed before; it does not prove the current password still equals the
   secret. `disabled` means no authorized request ran; `invalid_configuration`,
   `account_mismatch` and `failed` mean recovery did not complete. Investigate
   without printing credentials or underlying database errors. A failed
   transaction leaves its UUID unconsumed and can be retried after fixing the
   cause. A consumed UUID must never be regenerated merely to repeat a restart.
6. After verifying each environment, remove **that environment's** enabled
   setting and request ID. Remove the recovery password Secret only after both
   succeed. Retire the old unscoped `TEAK_SYSTEM_ADMIN_RECOVERY_ID` setting;
   this code deliberately ignores it. Keep all consumption audit records
   permanently: deleting those records could allow a stale request to replay.
   Do not rotate a UUID as part of normal deployment automation.

Do not put authorization settings in the shared scope. Even if development
settings accidentally reach production, production ignores them, and vice
versa. The shared password alone never enables recovery. The existing audit
action `owner_password_recovery:<UUID>` is retained, so historical consumed
requests remain consumed. Transaction/advisory locks serialize concurrent
requests; the password, designated owner's administrative session deletion,
individual username login counter deletion and consumption audit commit
together. Shared IP counters, other users' sessions and employee OTP devices
remain untouched.

### Verification of this change

- Focused unit/HTTP and opt-in real PostgreSQL tests passed. Synthetic schemas
  verified concurrent requests, one consumption, rollback/retry after audit
  failure, scoped session/counter deletion and non-replay after later changes.
- Both development-source and production-bundle fixture runs passed real
  `/api/system-admin/login` and PostgreSQL-backed session checks: new accepted,
  old rejected, owner self-change works, revoked session rejected, and restart
  does not restore the recovery password. Only synthetic accounts were used.
- Run from development only:

  ```sh
  OWNER_RECOVERY_POSTGRES_TEST=1 npx vitest run server/system-admin-recovery.test.ts server/system-admin-recovery.postgres.test.ts server/system-admin.test.ts --no-file-parallelism
  npm run build
  node scripts/smoke-production.mjs --owner-recovery
  node scripts/smoke-production.mjs --owner-recovery --owner-recovery-development
  ```

### Actual environment status

| Environment | Real credential operation | Remaining owner action |
| --- | --- | --- |
| Development | Applied on 2026-10-28 after the owner submitted the chosen Secret and explicitly requested both environments. Startup reported `System administrator password recovery [development]: applied`; development consent and request settings were removed afterward, preserving audit consumption. The agent did not read the Secret or automate login as the real owner. | Owner may sign in personally at development `/system-admin` with the submitted value; real-owner login has not been independently verified |
| Production | Independent production consent and a fresh request ID are configured, and the retired unscoped request setting was removed. Recovery has **not** executed or been verified against production; production data was not changed. The recovery Secret is retained for this pending operation. | In the main app, ensure the chosen recovery Secret is available to the deployment, run the merged recovery code through the authorized production release process, confirm `[production]: applied`, verify own login, then clean production authorization and the recovery Secret |

Development's committed recovery result is not proof of production recovery or
of a successful personal login. The fork cannot publish or apply production
recovery; the production actions above remain required. Do not mark the overall
password unification complete on the strength of the development result.
