-- Migration 0002: Accounting module — chart_of_accounts, journal_entries, journal_entry_lines
-- Uses IF NOT EXISTS throughout so it is safe to run on environments that already have the tables.

-- ── Enums ─────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE account_type AS ENUM ('asset','liability','equity','revenue','cost','expense');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE journal_entry_status AS ENUM ('draft','posted','void');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Chart of Accounts ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id          SERIAL PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name_ar     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  type        account_type NOT NULL,
  parent_code TEXT REFERENCES chart_of_accounts(code),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  notes       TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Journal Entries ───────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS journal_entries_entry_number_seq START 1001;

CREATE TABLE IF NOT EXISTS journal_entries (
  id             SERIAL PRIMARY KEY,
  entry_number   INTEGER NOT NULL DEFAULT nextval('journal_entries_entry_number_seq'),
  date           DATE NOT NULL,
  description    TEXT NOT NULL,
  reference      TEXT,
  reference_type TEXT,
  reference_id   INTEGER,
  status         journal_entry_status NOT NULL DEFAULT 'posted',
  total_debit    NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_credit   NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_by     INTEGER REFERENCES users(id),
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Journal Entry Lines ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id              SERIAL PRIMARY KEY,
  entry_id        INTEGER NOT NULL REFERENCES journal_entries(id),
  account_code    TEXT NOT NULL,
  account_name_ar TEXT NOT NULL,
  debit           NUMERIC(15,2) NOT NULL DEFAULT 0,
  credit          NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes           TEXT
);

-- ── Seed: Chart of Accounts (41 standard accounts for Saudi manufacturing) ────
INSERT INTO chart_of_accounts (code, name_ar, name_en, type, parent_code, is_system)
SELECT code, name_ar, name_en, type::account_type, parent_code, TRUE
FROM (VALUES
  ('1000','الأصول','Assets','asset',NULL),
    ('1100','الأصول المتداولة','Current Assets','asset','1000'),
      ('1110','النقدية وما في حكمها','Cash and Cash Equivalents','asset','1100'),
        ('1111','الصندوق','Petty Cash','asset','1110'),
        ('1112','البنك - الحساب الجاري','Bank - Current Account','asset','1110'),
      ('1120','حسابات القبض','Accounts Receivable','asset','1100'),
        ('1121','ذمم العملاء','Customer Receivables','asset','1120'),
      ('1130','المخزون','Inventory','asset','1100'),
        ('1131','مواد خام','Raw Materials','asset','1130'),
        ('1132','إنتاج تحت التشغيل','Work in Progress','asset','1130'),
        ('1133','بضاعة تامة الصنع','Finished Goods','asset','1130'),
      ('1140','الأصول المتداولة الأخرى','Other Current Assets','asset','1100'),
        ('1141','ضريبة القيمة المضافة المدخلات','Input VAT','asset','1140'),
        ('1142','دفعات مقدمة للموردين','Prepaid to Suppliers','asset','1140'),
    ('1200','الأصول غير المتداولة','Non-Current Assets','asset','1000'),
      ('1210','الممتلكات والمعدات','Property and Equipment','asset','1200'),
        ('1211','معدات وآلات','Machinery & Equipment','asset','1210'),
        ('1212','أثاث وتجهيزات','Furniture & Fixtures','asset','1210'),
        ('1213','سيارات ومركبات','Vehicles','asset','1210'),
      ('1220','مجمع الاستهلاك','Accumulated Depreciation','asset','1200'),
  ('2000','الخصوم','Liabilities','liability',NULL),
    ('2100','الخصوم المتداولة','Current Liabilities','liability','2000'),
      ('2110','حسابات الدفع','Accounts Payable','liability','2100'),
        ('2111','ذمم الموردين','Supplier Payables','liability','2110'),
      ('2120','الخصوم المتداولة الأخرى','Other Current Liabilities','liability','2100'),
        ('2121','ضريبة القيمة المضافة المخرجات','Output VAT Payable','liability','2120'),
        ('2122','رواتب مستحقة','Accrued Salaries','liability','2120'),
        ('2123','دفعات مقدمة من العملاء','Advance Payments from Customers','liability','2120'),
  ('3000','حقوق الملكية','Equity','equity',NULL),
    ('3100','رأس المال','Share Capital','equity','3000'),
    ('3200','الأرباح المحتجزة','Retained Earnings','equity','3000'),
    ('3300','الأرباح والخسائر للسنة الحالية','Current Year Profit/Loss','equity','3000'),
  ('4000','الإيرادات','Revenue','revenue',NULL),
    ('4100','إيرادات المبيعات','Sales Revenue','revenue','4000'),
      ('4110','مبيعات المنتجات','Product Sales','revenue','4100'),
      ('4120','إيرادات الخدمات','Service Revenue','revenue','4100'),
    ('4200','إيرادات أخرى','Other Revenue','revenue','4000'),
  ('5000','تكلفة المبيعات','Cost of Sales','cost',NULL),
    ('5100','تكلفة البضاعة المباعة','Cost of Goods Sold','cost','5000'),
    ('5200','تكاليف التصنيع المباشرة','Direct Manufacturing Costs','cost','5000'),
  ('6000','المصروفات التشغيلية','Operating Expenses','expense',NULL),
    ('6100','مصروفات الرواتب والأجور','Salaries & Wages','expense','6000'),
    ('6200','مصروفات إيجار','Rent Expense','expense','6000'),
    ('6300','مصروفات كهرباء ومياه','Utilities Expense','expense','6000'),
    ('6400','مصروفات إهلاك','Depreciation Expense','expense','6000'),
    ('6500','مصروفات عمومية وإدارية','General & Administrative Expenses','expense','6000'),
    ('6600','مصروفات تسويق','Marketing Expenses','expense','6000')
) AS t(code, name_ar, name_en, type, parent_code)
ON CONFLICT (code) DO NOTHING;
