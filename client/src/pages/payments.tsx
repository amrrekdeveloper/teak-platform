import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Payment, Customer, Contract } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Search, Loader2, CreditCard, CheckCircle2, XCircle, Clock, AlertTriangle, Image as ImageIcon } from "lucide-react";
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

const statusConfig: Record<string, { ar: string; en: string; color: string; icon: any }> = {
  pending: { ar: "بانتظار التأكيد", en: "Pending", color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300", icon: Clock },
  confirmed: { ar: "مؤكدة", en: "Confirmed", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300", icon: CheckCircle2 },
  rejected: { ar: "مرفوضة", en: "Rejected", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300", icon: XCircle },
};

export default function PaymentsPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"pending" | "all">("pending");
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const { data: payments = [], isLoading } = useQuery<Payment[]>({
    queryKey: ["/api/payments"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: contracts = [] } = useQuery<Contract[]>({
    queryKey: ["/api/contracts"],
  });

  const confirmMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("PATCH", `/api/payments/${id}/confirm`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      toast({ title: t("تم تأكيد الدفعة بنجاح", "Payment confirmed successfully") });
    },
    onError: () => {
      toast({ title: t("حدث خطأ", "Error"), variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const res = await apiRequest("PATCH", `/api/payments/${id}/reject`, { rejectionReason: reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      setRejectingId(null);
      setRejectionReason("");
      toast({ title: t("تم رفض الدفعة", "Payment rejected") });
    },
    onError: () => {
      toast({ title: t("حدث خطأ", "Error"), variant: "destructive" });
    },
  });

  const getCustomerName = (customerId: number) => customers.find((c) => c.id === customerId)?.fullName || "";
  const getContractNumber = (contractId: number) => contracts.find((c) => c.id === contractId)?.contractNumber || "";

  const pendingPayments = payments.filter((p: any) => p.status === "pending");
  const allPayments = payments;

  const displayPayments = activeTab === "pending" ? pendingPayments : allPayments;

  const filtered = displayPayments.filter((p) => {
    const name = getCustomerName(p.customerId);
    const contractNum = getContractNumber(p.contractId);
    return name.toLowerCase().includes(search.toLowerCase()) || contractNum.includes(search);
  });

  const totalConfirmed = payments.filter((p: any) => p.status === "confirmed").reduce((sum, p) => sum + parseFloat(p.amount), 0);

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-payments-title">
            {t("المدفوعات", "Payments")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t(
              `${payments.length} دفعة — إجمالي مؤكد ${totalConfirmed.toLocaleString()} ريال`,
              `${payments.length} payments — Confirmed total ${totalConfirmed.toLocaleString()} SAR`
            )}
          </p>
        </div>
        {pendingPayments.length > 0 && (
          <Badge variant="destructive" className="text-sm px-3 py-1" data-testid="badge-pending-count">
            <AlertTriangle className="w-3 h-3 me-1" />
            {t(`${pendingPayments.length} بانتظار التأكيد`, `${pendingPayments.length} pending`)}
          </Badge>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        <Button
          variant={activeTab === "pending" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("pending")}
          data-testid="tab-pending"
        >
          <Clock className="w-3 h-3 me-1" />
          {t("بانتظار التأكيد", "Pending")}
          {pendingPayments.length > 0 && (
            <span className="ms-1 bg-white/20 rounded-full px-1.5 text-xs">{pendingPayments.length}</span>
          )}
        </Button>
        <Button
          variant={activeTab === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("all")}
          data-testid="tab-all"
        >
          <CreditCard className="w-3 h-3 me-1" />
          {t("جميع المدفوعات", "All Payments")}
        </Button>
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
            {activeTab === "pending"
              ? t("لا توجد مدفوعات بانتظار التأكيد", "No pending payments")
              : t("لا توجد مدفوعات", "No payments found")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((payment: any) => {
            const stage = stageLabels[payment.paymentStage] || stageLabels.other;
            const status = statusConfig[payment.status] || statusConfig.confirmed;
            const StatusIcon = status.icon;

            return (
              <Card
                key={payment.id}
                className={payment.status === "pending" ? "border-amber-300 dark:border-amber-700" : ""}
                data-testid={`card-payment-${payment.id}`}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        payment.status === "pending" ? "bg-amber-500/10 text-amber-600" :
                        payment.status === "rejected" ? "bg-red-500/10 text-red-600" :
                        "bg-green-500/10 text-green-600"
                      }`}>
                        <StatusIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{getCustomerName(payment.customerId)}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${stage.color}`}>
                            {t(stage.ar, stage.en)}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${status.color}`}>
                            {t(status.ar, status.en)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <Link href={`/contracts/${payment.contractId}`}>
                            <span className="hover:text-primary cursor-pointer">{getContractNumber(payment.contractId)}</span>
                          </Link>
                          <span>.</span>
                          <span>{t(methodLabels[payment.method]?.ar || payment.method, methodLabels[payment.method]?.en || payment.method)}</span>
                          <span>.</span>
                          <span>{new Date(payment.createdAt).toLocaleDateString("ar-SA")}</span>
                        </div>
                        {payment.notes && (
                          <p className="text-xs text-muted-foreground mt-1">{payment.notes}</p>
                        )}
                        {payment.rejectionReason && (
                          <p className="text-xs text-red-600 mt-1">
                            {t("سبب الرفض:", "Reason:")} {payment.rejectionReason}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {payment.attachmentUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPreviewImage(payment.attachmentUrl)}
                          data-testid={`button-view-receipt-${payment.id}`}
                        >
                          <ImageIcon className="w-4 h-4 me-1" />
                          {t("الإيصال", "Receipt")}
                        </Button>
                      )}
                      <span className="text-lg font-bold text-green-600" data-testid={`text-payment-amount-${payment.id}`}>
                        {parseFloat(payment.amount).toLocaleString()} SAR
                      </span>
                    </div>
                  </div>

                  {payment.status === "pending" && (
                    <div className="flex items-center gap-2 pt-2 border-t">
                      {rejectingId === payment.id ? (
                        <div className="flex-1 flex items-center gap-2">
                          <Textarea
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            placeholder={t("سبب الرفض...", "Rejection reason...")}
                            className="text-sm h-10 min-h-0 flex-1"
                            data-testid={`input-rejection-reason-${payment.id}`}
                          />
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => rejectMutation.mutate({ id: payment.id, reason: rejectionReason })}
                            disabled={rejectMutation.isPending}
                            data-testid={`button-confirm-reject-${payment.id}`}
                          >
                            {rejectMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : t("رفض", "Reject")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setRejectingId(null); setRejectionReason(""); }}
                          >
                            {t("إلغاء", "Cancel")}
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => confirmMutation.mutate(payment.id)}
                            disabled={confirmMutation.isPending}
                            data-testid={`button-confirm-${payment.id}`}
                          >
                            {confirmMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : (
                              <>
                                <CheckCircle2 className="w-3 h-3 me-1" />
                                {t("تأكيد الدفعة", "Confirm Payment")}
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => setRejectingId(payment.id)}
                            data-testid={`button-reject-${payment.id}`}
                          >
                            <XCircle className="w-3 h-3 me-1" />
                            {t("رفض", "Reject")}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
          data-testid="modal-receipt-preview"
        >
          <div className="max-w-2xl max-h-[80vh] overflow-auto bg-white dark:bg-gray-900 rounded-lg p-2" onClick={(e) => e.stopPropagation()}>
            {previewImage.startsWith("data:application/pdf") ? (
              <div className="text-center p-8">
                <p className="text-muted-foreground mb-2">{t("ملف PDF", "PDF File")}</p>
                <a href={previewImage} download="receipt.pdf" className="text-primary underline">
                  {t("تحميل الملف", "Download File")}
                </a>
              </div>
            ) : (
              <img src={previewImage} alt="Receipt" className="w-full h-auto rounded" />
            )}
            <Button
              className="w-full mt-2"
              variant="outline"
              onClick={() => setPreviewImage(null)}
            >
              {t("إغلاق", "Close")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
