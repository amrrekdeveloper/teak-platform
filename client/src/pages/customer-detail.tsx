import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useRoute, Link } from "wouter";
import type { Customer, Quotation, Contract, Payment } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Phone, Mail, MapPin, FileText, FolderOpen, CreditCard, ArrowLeft, ArrowRight, Plus } from "lucide-react";

export default function CustomerDetailPage() {
  const { t, isRTL } = useLanguage();
  const [, params] = useRoute("/dashboard/customers/:id");
  const id = params?.id;

  const { data: customer, isLoading } = useQuery<Customer>({
    queryKey: ["/api/customers", id],
    enabled: !!id,
  });

  const { data: quotations = [] } = useQuery<Quotation[]>({
    queryKey: ["/api/customers", id, "quotations"],
    enabled: !!id,
  });

  const { data: contracts = [] } = useQuery<Contract[]>({
    queryKey: ["/api/customers", id, "contracts"],
    enabled: !!id,
  });

  const { data: payments = [] } = useQuery<Payment[]>({
    queryKey: ["/api/customers", id, "payments"],
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t("العميل غير موجود", "Customer not found")}</p>
      </div>
    );
  }

  const statusLabels: Record<string, { ar: string; en: string; color: string }> = {
    draft: { ar: "مسودة", en: "Draft", color: "bg-gray-500/10 text-gray-500" },
    sent: { ar: "مرسل", en: "Sent", color: "bg-blue-500/10 text-blue-500" },
    approved: { ar: "معتمد", en: "Approved", color: "bg-green-500/10 text-green-500" },
    rejected: { ar: "مرفوض", en: "Rejected", color: "bg-red-500/10 text-red-500" },
    active: { ar: "نشط", en: "Active", color: "bg-green-500/10 text-green-500" },
    completed: { ar: "مكتمل", en: "Completed", color: "bg-blue-500/10 text-blue-500" },
    cancelled: { ar: "ملغي", en: "Cancelled", color: "bg-red-500/10 text-red-500" },
  };

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/customers">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <BackIcon className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-customer-detail-name">
            {customer.fullName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("ملف العميل", "Customer Profile")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card data-testid="card-customer-info">
          <CardHeader>
            <CardTitle className="text-lg">{t("معلومات العميل", "Customer Info")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Phone className="w-4 h-4 text-muted-foreground" />
              <span dir="ltr">{customer.phone}</span>
            </div>
            {customer.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <span>{customer.email}</span>
              </div>
            )}
            {customer.city && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span>{customer.city}{customer.district ? ` - ${customer.district}` : ""}</span>
              </div>
            )}
            {customer.buildingStatus && (
              <div className="text-sm">
                <span className="text-muted-foreground">{t("حالة المبنى: ", "Building: ")}</span>
                {customer.buildingStatus}
              </div>
            )}
            {customer.notes && (
              <div className="text-sm pt-2 border-t">
                <span className="text-muted-foreground">{t("ملاحظات: ", "Notes: ")}</span>
                {customer.notes}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5" />
                {t("عروض الأسعار", "Quotations")} ({quotations.length})
              </CardTitle>
              <Link href={`/dashboard/quotations/new?customerId=${id}`}>
                <Button size="sm" data-testid="button-new-quotation">
                  <Plus className="w-3 h-3 me-1" /> {t("جديد", "New")}
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {quotations.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("لا توجد عروض أسعار", "No quotations")}</p>
              ) : (
                <div className="space-y-2">
                  {quotations.map((q) => {
                    const status = statusLabels[q.status] || statusLabels.draft;
                    return (
                      <div key={q.id} className="flex items-center justify-between p-3 rounded-lg border">
                        <div>
                          <span className="font-medium">#{q.quotationNumber}</span>
                          <span className="text-sm text-muted-foreground ms-2">
                            {new Date(q.createdAt).toLocaleDateString("ar-SA")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{parseFloat(q.finalPrice).toLocaleString()} SAR</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${status.color}`}>
                            {t(status.ar, status.en)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FolderOpen className="w-5 h-5" />
                {t("العقود", "Contracts")} ({contracts.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {contracts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("لا توجد عقود", "No contracts")}</p>
              ) : (
                <div className="space-y-2">
                  {contracts.map((c) => {
                    const status = statusLabels[c.status] || statusLabels.active;
                    return (
                      <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border">
                        <div>
                          <span className="font-medium">{c.contractNumber}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{parseFloat(c.totalAmount).toLocaleString()} SAR</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${status.color}`}>
                            {t(status.ar, status.en)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                {t("المدفوعات", "Payments")} ({payments.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("لا توجد مدفوعات", "No payments")}</p>
              ) : (
                <div className="space-y-2">
                  {payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="text-sm">
                        <span>{new Date(p.createdAt).toLocaleDateString("ar-SA")}</span>
                        <span className="text-muted-foreground ms-2">{p.paymentStage}</span>
                      </div>
                      <span className="font-medium text-green-600">{parseFloat(p.amount).toLocaleString()} SAR</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
