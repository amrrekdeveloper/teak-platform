import { Link, useLocation } from "wouter";
import { useLanguage } from "@/components/language-provider";
import {
  LayoutDashboard, FileText, BookOpen, BookText, Scale,
  BarChart3, TrendingUp, Wallet, Receipt, Building2,
  ChevronRight, CreditCard, FileCheck,
} from "lucide-react";

const NAV_GROUPS = [
  {
    labelAr: "لوحة التحكم",
    items: [
      { href: "/finance", labelAr: "الرئيسية", icon: LayoutDashboard, exact: true },
      { href: "/payments", labelAr: "المدفوعات", icon: CreditCard },
      { href: "/invoices", labelAr: "الفواتير", icon: FileCheck },
    ],
  },
  {
    labelAr: "المحاسبة",
    items: [
      { href: "/finance/accounts", labelAr: "شجرة الحسابات", icon: BookOpen },
      { href: "/finance/journal", labelAr: "القيود اليومية", icon: FileText },
    ],
  },
  {
    labelAr: "دفاتر التقارير",
    items: [
      { href: "/finance/ledger", labelAr: "دفتر الأستاذ العام", icon: BookText },
      { href: "/finance/trial-balance", labelAr: "ميزان المراجعة", icon: Scale },
    ],
  },
  {
    labelAr: "القوائم المالية",
    items: [
      { href: "/finance/balance-sheet", labelAr: "الميزانية العمومية", icon: BarChart3 },
      { href: "/finance/income-statement", labelAr: "قائمة الدخل", icon: TrendingUp },
      { href: "/finance/cash-flow", labelAr: "التدفقات النقدية", icon: Wallet },
    ],
  },
  {
    labelAr: "الضريبة والبنك",
    items: [
      { href: "/finance/vat-report", labelAr: "ضريبة القيمة المضافة", icon: Receipt },
      { href: "/finance/bank-reconciliation", labelAr: "مطابقة البنك", icon: Building2 },
    ],
  },
];

export function FinanceLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex min-h-[calc(100vh-56px)]" dir="rtl">
      <aside className="w-52 shrink-0 border-l border-border bg-card sticky top-14 h-[calc(100vh-56px)] overflow-y-auto">
        <nav className="p-3 space-y-5">
          {NAV_GROUPS.map(group => (
            <div key={group.labelAr}>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2 mb-1.5">
                {group.labelAr}
              </p>
              <div className="space-y-0.5">
                {group.items.map(item => {
                  const isActive = item.exact
                    ? location === item.href
                    : location === item.href || location.startsWith(item.href + "/");
                  return (
                    <Link key={item.href} href={item.href}>
                      <div
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors cursor-pointer ${
                          isActive
                            ? "bg-primary text-primary-foreground font-medium"
                            : "text-foreground hover:bg-accent"
                        }`}
                        data-testid={`finance-nav-${item.href.replace(/\//g, "-")}`}
                      >
                        <item.icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{item.labelAr}</span>
                        {isActive && <ChevronRight className="h-3 w-3 ms-auto opacity-60 rotate-180" />}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
      <main className="flex-1 min-w-0 p-4 md:p-6">
        {children}
      </main>
    </div>
  );
}
