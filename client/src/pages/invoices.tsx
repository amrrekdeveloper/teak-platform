import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import type { Invoice, Customer } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Search, Loader2, Receipt, FileText } from "lucide-react";
import { Link } from "wouter";

const typeLabels: Record<string, { ar: string; en: string; color: string }> = {
  quotation: { ar: "عرض سعر", en: "Quotation", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  simplified_tax_invoice: { ar: "فاتورة ضريبية مبسطة", en: "Simplified Tax Invoice", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
};

export default function InvoicesPage() {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const getCustomerName = (customerId: number) => customers.find((c) => c.id === customerId)?.fullName || "";

  const filtered = invoices.filter((inv) => {
    const matchSearch = search === "" ||
      getCustomerName(inv.customerId).includes(search) ||
      String(inv.invoiceNumber).includes(search);
    const matchType = typeFilter === "all" || inv.type === typeFilter;
    return matchSearch && matchType;
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" data-testid="text-invoices-title">
          {t("الفواتير", "Invoices")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t(`${invoices.length} فاتورة`, `${invoices.length} invoices`)}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("بحث...", "Search...")}
            className="ps-10"
            data-testid="input-search-invoices"
          />
        </div>
        <div className="flex gap-2">
          {["all", "simplified_tax_invoice", "quotation"].map((type) => (
            <Button
              key={type}
              variant={typeFilter === type ? "default" : "outline"}
              size="sm"
              onClick={() => setTypeFilter(type)}
              data-testid={`button-filter-${type}`}
            >
              {type === "all"
                ? t("الكل", "All")
                : t(typeLabels[type]?.ar || type, typeLabels[type]?.en || type)}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[200px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t("لا توجد فواتير", "No invoices found")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((inv) => {
            const typeConfig = typeLabels[inv.type] || typeLabels.quotation;
            return (
              <Link key={inv.id} href={`/invoices/${inv.id}`}>
                <Card className="cursor-pointer hover:border-primary/30 transition-colors" data-testid={`card-invoice-${inv.id}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                          {inv.type === "simplified_tax_invoice" ? <Receipt className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">#{inv.invoiceNumber}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${typeConfig.color}`}>
                              {t(typeConfig.ar, typeConfig.en)}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {inv.buyerName || getCustomerName(inv.customerId)}
                            {inv.issuedAt && ` — ${new Date(inv.issuedAt).toLocaleDateString("ar-SA")}`}
                          </p>
                        </div>
                      </div>
                      <span className="text-lg font-bold">
                        {parseFloat(inv.totalWithVat).toLocaleString()} SAR
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
