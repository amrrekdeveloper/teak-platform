---
name: Financial write ordering & idempotency
description: How money-affecting endpoints in this ERP stay atomic and idempotent without DB transactions
---

When an endpoint both posts an accounting journal entry AND mutates a status/balance,
order the writes so a partial failure is recoverable, and guard against duplicates.

**Rule:**
1. Post the journal entry FIRST, status flip SECOND. If the journal throws, the source
   record stays in its pre-paid state and the action is retryable — never "paid with no ledger entry".
2. Dedup the journal with `storage.findJournalEntryByReference(referenceType, referenceId)`
   before creating it, so a retry does not double-post.
3. Make the status flip a conditional update (`WHERE id=? AND status='draft'`) returning the
   row; if it returns undefined, a concurrent call already flipped it → respond 409. This is the
   no-double-pay guard (e.g. `markPayrollPaid`).

**Why:** journal posting is best-effort try/catch elsewhere (inventory stock-out), which can
leave accounting mismatched if the swallow hides a failure after the status was already changed.
Reordering + reference-dedup + conditional update gives atomicity-like safety without wrapping
everything in a DB transaction.

**How to apply:** any new pay/confirm/settle endpoint that touches both the ledger and a record's
state (payroll pay, payment confirm, invoice issue). Reuse existing COA codes: salaries 6100,
cash 1111, inventory 1130, COGS 5100, employee advances 1140.

**Concurrency on "only one active X" business rules:** a check-then-update (read then write)
is NOT race-safe. Back it with a Postgres **partial unique index** created in the idempotent
startup migration (e.g. `CREATE UNIQUE INDEX IF NOT EXISTS ... ON t(employee_id) WHERE status='approved'`),
then catch the unique violation (`err.code === '23505'`) at the write and return 409. The
in-app pre-check still gives a friendly early 409 for the common case.
