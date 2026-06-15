---
name: Arabic-Indic numerals in numeric fields
description: Why numeric inputs in this AR/EN app must normalize Arabic/Persian digits before parseFloat or Postgres numeric casts
---

# Arabic-Indic numerals break numeric columns

In this bilingual AR/EN app, users on an Arabic numeric keyboard type Arabic-Indic
digits (٠-٩, U+0660–0669) or Persian (۰-۹, U+06F0–06F9), plus Arabic decimal `٫`
(U+066B) and thousands `٬` (U+066C) separators.

**The rule:** every numeric value crossing a boundary (form input → state, and
API/storage → DB) must be passed through `toLatinDigits`/`parseNum` from
`shared/digits.ts` before `parseFloat` or before hitting a Drizzle `numeric` column.

**Why:** `parseFloat("٦٦")` returns `NaN`. NaN comparisons (`debit <= 0`, `debit > 0`,
`Math.abs(a-b) > 0.01`) all evaluate false, so validation *silently passes*, then the
raw Arabic string reaches the Postgres `numeric` column → 500/400 with
`invalid input syntax for type numeric: "٦٦"`. The validation looks fine but the DB
rejects the write.

**How to apply:** normalize at the input `onChange` (so state/balance checks/display
all use Latin) AND defensively in storage/route handlers (so direct API calls or older
clients can't crash the DB). `shared/digits.ts` is importable from both client
(`@shared/digits`) and server. Already applied across the finance journal/voucher/
invoice/opening-balance flows; replicate for any new numeric input or numeric API field.
