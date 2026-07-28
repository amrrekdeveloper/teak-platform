---
name: Chart of accounts — role lookup, not hardcoded codes
description: Production chart uses different numbering than the dev seed; resolve accounts by role/tree position, never by code prefix.
---

**Rule:** Never hardcode chart-of-account codes (1111, 1121, 2111, 2121…) in finance logic. The production chart uses its own numbering (e.g. 11000101 النقدية بالصندوق الرئيسي under 110001 النقدية والبنوك, 11000201 ذمم العملاء, 2000010101 ذمم الموردين, VAT 2000010201/2000010202) while the dev seed uses 111x/1121/2111/2121/2122.

**Why:** Hardcoded `startsWith("111")` made the cash/bank list empty in production (voucher dialog unusable).

**How to apply:**
- Cash/bank accounts = active **leaf asset** accounts whose self-or-ancestor nameAr/nameEn matches /صندوق|بنك|نقد|cash|bank/i (walk parentCode with a guard). Asset-type restriction excludes expense accounts like «رسوم عمولات بنكية».
- AR/AP control accounts = leaf by type + name (/ذمم/ + /عملاء|مورد/), VAT by /ضريبة/ + /مخرجات|مدخلات/, with dev-seed fallback codes only if they exist.
- Same logic lives in both client (finance-accounts.tsx) and server (routes.ts record-voucher/record-invoice) — keep in sync (follow-up task exists to unify in shared/).
- Vouchers expose customers/suppliers as pseudo-options (`cust:<id>`/`supp:<id>`) resolved at submit to the control account + partyName (control account + subledger pattern; party name only in the entry description for now).
