import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import type { Payment, Customer, Contract } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Search, Loader2, CreditCard } from "lucide-react";
import { Link } from "wouter";

const stageLabels: Record<string, { ar: string; en: string; color: string }> = {
  deposit: { ar: "عربون", en: "Deposit", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  pre_manufacturing: { ar: "قبل التصنيع", en: "Pre-manufacturing", color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
  delivery: { ar: "عند التوصيل", en: "Upon Delivery", color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
  final: { ar: "نهائية", en: "Final", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  other: { ar: "أخرى", en: "Other", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
};

const methodLabels: Record<string, { ar: string; en: string }> = {
  bank_transfer: { ar: "تحويل بنكي", en: "Bank Transfer" },
  cash: { ar: "نقدي", en: "Cash" },
  card: { ar: "بطاقة", en: "Card" },
};

export default function PaymentsPage() {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");

  const { data: payments = [], isLoading } = useQuery<Payment[]>({
    queryKey: ["/api/payments"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: contracts = [] } = useQuery<Contract[]>({
    queryKey: ["/api/contracts"],
  });

  const getCustomerName = (customerId: number) => customers.find((c) => c.id === customerId)?.fullName || "";
  const getContractNumber = (contractId: number) => contracts.find((c) => c.id === contractId)?.contractNumber || "";

  const totalAmount = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);

  const filtered = payments.filter((p) => {
    const name = getCustomerName(p.customerId);
    const contractNum = getContractNumber(p.contractId);
    return name.toLowerCase().includes(search.toLowerCase()) || contractNum.includes(search);
  });

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-payments-title">
            {t("المدفوعات", "Payments")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t(
              `${payments.length} دفعة — إجمالي ${totalAmount.toLocaleString()} ريال`,
              `${payments.length} payments — Total ${totalAmount.toLocaleString()} SAR`
            )}
          </p>
        </div>
      </div>

      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("بحث...", "Search...")}
            className="ps-10"
            data-testid="input-search-payments"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[200px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t("لا توجد مدفوعات", "No payments found")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((payment) => {
            const stage = stageLabels[payment.paymentStage] || stageLabels.other;
            return (
              <Card key={payment.id} data-testid={`card-payment-${payment.id}`}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center text-green-600">
                        <CreditCard className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{getCustomerName(payment.customerId)}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${stage.color}`}>
                            {t(stage.ar, stage.en)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <Link href={`/contracts/${payment.contractId}`}>
                            <span className="hover:text-primary cursor-pointer">{getContractNumber(payment.contractId)}</span>
                          </Link>
                          <span>•</span>
                          <span>{t(methodLabels[payment.method]?.ar || payment.method, methodLabels[payment.method]?.en || payment.method)}</span>
                          <span>•</span>
                          <span>{new Date(payment.createdAt).toLocaleDateString("ar-SA")}</span>
                        </div>
                      </div>
                    </div>
                    <span className="text-lg font-bold text-green-600" data-testid={`text-payment-amount-${payment.id}`}>
                      {parseFloat(payment.amount).toLocaleString()} SAR
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
