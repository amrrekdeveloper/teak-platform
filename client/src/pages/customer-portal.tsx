import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  FileText, Receipt, Factory, Truck, Shield, Wrench, LogOut, CheckCircle2,
  Clock, Upload, Download, Phone, Eye, ChevronDown, ChevronUp, Loader2,
  Camera, Calendar, Package, User, CircleDot, Sun, Moon,
} from "lucide-react";
import logoAr from "@assets/logo_teak1_1772689915503.png";
import logoEn from "@assets/logo_teak2_1772689894105.png";

function PortalHeader({ customerName }: { customerName: string }) {
  const { t, lang, setLang } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const currentLogo = lang === "ar" ? logoAr : logoEn;

  const handleLogout = () => {
    sessionStorage.removeItem("portalPhone");
    sessionStorage.removeItem("portalCustomerName");
    window.location.href = "/portal/login";
  };

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b px-4 py-3">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={currentLogo} alt="Teak" className="w-10 h-10 object-contain" data-testid="img-portal-header-logo" />
          <div>
            <p className="font-semibold text-sm" data-testid="text-header-name">{customerName}</p>
            <p className="text-xs text-muted-foreground">{t("بوابة العملاء", "Customer Portal")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setLang(lang === "ar" ? "en" : "ar")} data-testid="button-lang-toggle">
            {lang === "ar" ? "EN" : "عربي"}
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleTheme} data-testid="button-theme-toggle">
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleLogout} data-testid="button-logout">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useLanguage();
  const statusMap: Record<string, { labelAr: string; labelEn: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    draft: { labelAr: "مسودة", labelEn: "Draft", variant: "secondary" },
    sent: { labelAr: "مُرسل", labelEn: "Sent", variant: "default" },
    approved: { labelAr: "معتمد", labelEn: "Approved", variant: "default" },
    rejected: { labelAr: "مرفوض", labelEn: "Rejected", variant: "destructive" },
    pending: { labelAr: "قيد الانتظار", labelEn: "Pending", variant: "secondary" },
    active: { labelAr: "نشط", labelEn: "Active", variant: "default" },
    completed: { labelAr: "مكتمل", labelEn: "Completed", variant: "default" },
    issued: { labelAr: "صادرة", labelEn: "Issued", variant: "default" },
    paid: { labelAr: "مدفوعة", labelEn: "Paid", variant: "default" },
    in_progress: { labelAr: "قيد التنفيذ", labelEn: "In Progress", variant: "default" },
    designing: { labelAr: "قيد التصميم", labelEn: "Designing", variant: "secondary" },
  };
  const info = statusMap[status] || { labelAr: status, labelEn: status, variant: "outline" as const };
  return <Badge variant={info.variant} data-testid={`badge-status-${status}`}>{t(info.labelAr, info.labelEn)}</Badge>;
}

function QuotationsSection({ quotations, designs, onApprove, approving }: {
  quotations: any[]; designs: any[]; onApprove: (id: number) => void; approving: boolean;
}) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState<number | null>(null);

  if (!quotations.length) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold flex items-center gap-2" data-testid="text-section-quotations">
        <FileText className="w-5 h-5 text-primary" />
        {t("عروض الأسعار", "Quotations")}
      </h2>
      {quotations.map((q: any) => {
        const design = designs.find((d: any) => d.customerId === q.customerId && d.status === "completed");
        return (
          <Card key={q.id} data-testid={`card-quotation-${q.id}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">#{q.id}</span>
                <StatusBadge status={q.status} />
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>{t("المبلغ", "Amount")}: <span className="font-semibold text-foreground">{q.totalWithVat || q.total} {t("ريال", "SAR")}</span></p>
                {q.createdAt && <p className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(q.createdAt).toLocaleDateString("ar-SA")}</p>}
              </div>

              {design?.sketchImage && (
                <div className="mt-3">
                  <button onClick={() => setExpanded(expanded === q.id ? null : q.id)} className="text-sm text-primary flex items-center gap-1" data-testid={`button-toggle-design-${q.id}`}>
                    <Eye className="w-3 h-3" />
                    {t("المخططات", "Designs")}
                    {expanded === q.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {expanded === q.id && (
                    <div className="mt-2 border rounded-lg p-2">
                      <img src={design.sketchImage} alt="Design" className="w-full rounded" data-testid={`img-design-${q.id}`} />
                      {design.notes && <p className="text-xs text-muted-foreground mt-1">{design.notes}</p>}
                    </div>
                  )}
                </div>
              )}

              {(q.status === "sent" || q.status === "draft") && (
                <Button
                  onClick={() => onApprove(q.id)}
                  disabled={approving}
                  className="w-full mt-3"
                  data-testid={`button-approve-quotation-${q.id}`}
                >
                  {approving ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <CheckCircle2 className="w-4 h-4 me-2" />}
                  {t("اعتماد عرض السعر", "Approve Quotation")}
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}

function InvoicesSection({ invoices }: { invoices: any[] }) {
  const { t } = useLanguage();
  if (!invoices.length) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold flex items-center gap-2" data-testid="text-section-invoices">
        <Receipt className="w-5 h-5 text-primary" />
        {t("الفواتير", "Invoices")}
      </h2>
      {invoices.map((inv: any) => (
        <Card key={inv.id} data-testid={`card-invoice-${inv.id}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">{inv.invoiceNumber || `#${inv.id}`}</span>
              <StatusBadge status={inv.status} />
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>{t("النوع", "Type")}: {inv.type === "simplified_tax_invoice" ? t("فاتورة ضريبية مبسطة", "Simplified Tax Invoice") : t("عرض سعر", "Quotation")}</p>
              <p>{t("المبلغ", "Amount")}: <span className="font-semibold text-foreground">{inv.totalWithVat} {t("ريال", "SAR")}</span></p>
              {inv.vatAmount && <p>{t("الضريبة", "VAT")}: {inv.vatAmount} {t("ريال", "SAR")}</p>}
            </div>
            {inv.qrCode && (
              <div className="mt-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">{t("رمز QR للتحقق", "QR Verification Code")}</p>
                <div className="inline-block p-2 bg-white rounded" data-testid={`qr-invoice-${inv.id}`}>
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(inv.qrCode)}`} alt="QR" className="w-24 h-24" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function ProductionTimeline({ production }: { production: any[] }) {
  const { t } = useLanguage();
  if (!production.length) return null;

  const stageLabels: Record<string, { ar: string; en: string }> = {
    cutting: { ar: "القص", en: "Cutting" },
    edging: { ar: "الحواف", en: "Edging" },
    assembly: { ar: "التجميع", en: "Assembly" },
    finishing: { ar: "التشطيب", en: "Finishing" },
    quality_check: { ar: "فحص الجودة", en: "Quality Check" },
    packaging: { ar: "التغليف", en: "Packaging" },
  };

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold flex items-center gap-2" data-testid="text-section-production">
        <Factory className="w-5 h-5 text-primary" />
        {t("تتبع الإنتاج", "Production Tracking")}
      </h2>
      {production.map(({ workOrder, stages }: any) => (
        <Card key={workOrder.id} data-testid={`card-production-${workOrder.id}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-medium">{t("أمر عمل", "Work Order")} #{workOrder.id}</span>
              <StatusBadge status={workOrder.status} />
            </div>

            <div className="space-y-3">
              {stages.length > 0 ? stages.map((stage: any, idx: number) => {
                const label = stageLabels[stage.stageName] || { ar: stage.stageName, en: stage.stageName };
                const isCompleted = stage.status === "completed";
                const isActive = stage.status === "in_progress";

                return (
                  <div key={stage.id} className="flex gap-3" data-testid={`stage-${stage.id}`}>
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        isCompleted ? "bg-green-500 text-white" :
                        isActive ? "bg-primary text-primary-foreground animate-pulse" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                      </div>
                      {idx < stages.length - 1 && (
                        <div className={`w-0.5 h-8 ${isCompleted ? "bg-green-500" : "bg-muted"}`} />
                      )}
                    </div>
                    <div className="flex-1 pb-2">
                      <p className={`font-medium text-sm ${isActive ? "text-primary" : ""}`}>
                        {t(label.ar, label.en)}
                      </p>
                      {stage.completedAt && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(stage.completedAt).toLocaleDateString("ar-SA")}
                        </p>
                      )}
                      {stage.progressImages && stage.progressImages.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {stage.progressImages.map((img: string, i: number) => (
                            <img key={i} src={img} alt={`Progress ${i + 1}`} className="w-16 h-16 rounded object-cover border" />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t("لم تبدأ مراحل الإنتاج بعد", "Production stages not started yet")}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function PaymentSection({ payments, contracts, phone }: { payments: any[]; contracts: any[]; phone: string }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [showUpload, setShowUpload] = useState(false);
  const [receiptData, setReceiptData] = useState({ amount: "", notes: "" });
  const [uploading, setUploading] = useState(false);

  const handleUploadReceipt = async () => {
    if (!receiptData.amount) {
      toast({ title: t("خطأ", "Error"), description: t("أدخل المبلغ", "Enter amount"), variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const res = await fetch("/api/customer-portal/upload-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          contractId: contracts.length > 0 ? contracts[0].id : null,
          amount: receiptData.amount,
          paymentMethod: "bank_transfer",
          notes: receiptData.notes || t("تحويل بنكي", "Bank Transfer"),
        }),
      });
      if (res.ok) {
        toast({ title: t("تم", "Done"), description: t("تم رفع وصل الدفع بنجاح", "Payment receipt uploaded successfully") });
        setShowUpload(false);
        setReceiptData({ amount: "", notes: "" });
        queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/my-data"] });
      } else {
        throw new Error("Upload failed");
      }
    } catch {
      toast({ title: t("خطأ", "Error"), description: t("حدث خطأ", "An error occurred"), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2" data-testid="text-section-payments">
          <Upload className="w-5 h-5 text-primary" />
          {t("المدفوعات", "Payments")}
        </h2>
        <Button variant="outline" size="sm" onClick={() => setShowUpload(!showUpload)} data-testid="button-toggle-upload">
          <Upload className="w-4 h-4 me-1" />
          {t("رفع وصل", "Upload Receipt")}
        </Button>
      </div>

      {showUpload && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <Input
              type="number"
              placeholder={t("المبلغ", "Amount")}
              value={receiptData.amount}
              onChange={(e) => setReceiptData({ ...receiptData, amount: e.target.value })}
              data-testid="input-receipt-amount"
            />
            <Textarea
              placeholder={t("ملاحظات (اختياري)", "Notes (optional)")}
              value={receiptData.notes}
              onChange={(e) => setReceiptData({ ...receiptData, notes: e.target.value })}
              data-testid="input-receipt-notes"
            />
            <Button onClick={handleUploadReceipt} disabled={uploading} className="w-full" data-testid="button-submit-receipt">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
              {t("إرسال", "Submit")}
            </Button>
          </CardContent>
        </Card>
      )}

      {payments.length > 0 ? payments.map((p: any) => (
        <Card key={p.id} data-testid={`card-payment-${p.id}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">{p.amount} {t("ريال", "SAR")}</span>
              <Badge variant="outline">{p.method === "bank_transfer" ? t("تحويل بنكي", "Bank Transfer") : p.method === "cash" ? t("نقد", "Cash") : p.method}</Badge>
            </div>
            {p.createdAt && <p className="text-xs text-muted-foreground mt-1">{new Date(p.createdAt).toLocaleDateString("ar-SA")}</p>}
          </CardContent>
        </Card>
      )) : (
        <p className="text-sm text-muted-foreground text-center py-2">{t("لا توجد مدفوعات", "No payments yet")}</p>
      )}
    </section>
  );
}

function WarrantySection({ warranties: warrantyList }: { warranties: any[] }) {
  const { t } = useLanguage();
  if (!warrantyList.length) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold flex items-center gap-2" data-testid="text-section-warranties">
        <Shield className="w-5 h-5 text-primary" />
        {t("الضمان", "Warranty")}
      </h2>
      {warrantyList.map((w: any) => (
        <Card key={w.id} data-testid={`card-warranty-${w.id}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">{t("شهادة ضمان", "Warranty Certificate")} #{w.id}</span>
              <StatusBadge status={w.status} />
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {t("من", "From")}: {w.startDate}</p>
              <p className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {t("إلى", "To")}: {w.endDate}</p>
              {w.terms && <p>{w.terms}</p>}
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function MaintenanceSection({ maintenance, phone }: { maintenance: any[]; phone: string }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!description.trim()) {
      toast({ title: t("خطأ", "Error"), description: t("اكتب وصف المشكلة", "Describe the issue"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/customer-portal/maintenance-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, description }),
      });
      if (res.ok) {
        toast({ title: t("تم", "Done"), description: t("تم تقديم طلب الصيانة", "Maintenance request submitted") });
        setShowForm(false);
        setDescription("");
        queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/my-data"] });
      }
    } catch {
      toast({ title: t("خطأ", "Error"), description: t("حدث خطأ", "Error occurred"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2" data-testid="text-section-maintenance">
          <Wrench className="w-5 h-5 text-primary" />
          {t("الصيانة", "Maintenance")}
        </h2>
        <Button variant="outline" size="sm" onClick={() => setShowForm(!showForm)} data-testid="button-new-maintenance">
          <Wrench className="w-4 h-4 me-1" />
          {t("طلب صيانة", "Request")}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <Textarea
              placeholder={t("وصف المشكلة...", "Describe the issue...")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              data-testid="input-maintenance-description"
            />
            <Button onClick={handleSubmit} disabled={submitting} className="w-full" data-testid="button-submit-maintenance">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
              {t("إرسال طلب الصيانة", "Submit Maintenance Request")}
            </Button>
          </CardContent>
        </Card>
      )}

      {maintenance.length > 0 ? maintenance.map((m: any) => (
        <Card key={m.id} data-testid={`card-maintenance-${m.id}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-sm">#{m.id}</span>
              <StatusBadge status={m.status} />
            </div>
            <p className="text-sm text-muted-foreground">{m.description}</p>
            {m.createdAt && <p className="text-xs text-muted-foreground mt-1">{new Date(m.createdAt).toLocaleDateString("ar-SA")}</p>}
          </CardContent>
        </Card>
      )) : !showForm && (
        <p className="text-sm text-muted-foreground text-center py-2">{t("لا توجد طلبات صيانة", "No maintenance requests")}</p>
      )}
    </section>
  );
}

export default function CustomerPortal() {
  const { t, lang } = useLanguage();
  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    const savedPhone = sessionStorage.getItem("portalPhone");
    const savedName = sessionStorage.getItem("portalCustomerName");
    if (!savedPhone) {
      window.location.href = "/portal/login";
      return;
    }
    setPhone(savedPhone);
    setCustomerName(savedName || "");
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/customer-portal/my-data", phone],
    queryFn: async () => {
      if (!phone) return null;
      const res = await fetch(`/api/customer-portal/my-data?phone=${encodeURIComponent(phone)}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!phone,
    refetchInterval: 30000,
  });

  const approveMutation = useMutation({
    mutationFn: async (quotationId: number) => {
      const res = await fetch(`/api/customer-portal/approve-quotation/${quotationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("تم", "Done"), description: t("تم اعتماد عرض السعر وتحويله لفاتورة ضريبية", "Quotation approved and converted to tax invoice") });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/my-data"] });
    },
    onError: () => {
      toast({ title: t("خطأ", "Error"), description: t("حدث خطأ في الاعتماد", "Error approving"), variant: "destructive" });
    },
  });

  if (!phone) return null;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir={lang === "ar" ? "rtl" : "ltr"}>
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir={lang === "ar" ? "rtl" : "ltr"}>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-destructive mb-4">{t("حدث خطأ في تحميل البيانات", "Error loading data")}</p>
            <Button onClick={() => window.location.reload()} data-testid="button-retry">{t("إعادة المحاولة", "Retry")}</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const summaryCards = [
    { icon: FileText, labelAr: "عروض الأسعار", labelEn: "Quotations", count: data.quotations?.length || 0, color: "text-blue-500" },
    { icon: Receipt, labelAr: "الفواتير", labelEn: "Invoices", count: data.invoices?.length || 0, color: "text-green-500" },
    { icon: Factory, labelAr: "الإنتاج", labelEn: "Production", count: data.production?.length || 0, color: "text-orange-500" },
    { icon: Shield, labelAr: "الضمان", labelEn: "Warranty", count: data.warranties?.length || 0, color: "text-purple-500" },
  ];

  return (
    <div className="min-h-screen bg-background" dir={lang === "ar" ? "rtl" : "ltr"}>
      <PortalHeader customerName={customerName || data.customer?.fullName || ""} />

      <main className="max-w-4xl mx-auto p-4 space-y-6 pb-20">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {summaryCards.map((card) => (
            <Card key={card.labelEn} data-testid={`card-summary-${card.labelEn.toLowerCase()}`}>
              <CardContent className="p-3 text-center">
                <card.icon className={`w-6 h-6 mx-auto mb-1 ${card.color}`} />
                <p className="text-2xl font-bold">{card.count}</p>
                <p className="text-xs text-muted-foreground">{t(card.labelAr, card.labelEn)}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <QuotationsSection
          quotations={data.quotations || []}
          designs={data.designs || []}
          onApprove={(id) => approveMutation.mutate(id)}
          approving={approveMutation.isPending}
        />

        <InvoicesSection invoices={data.invoices || []} />

        <ProductionTimeline production={data.production || []} />

        <PaymentSection payments={data.payments || []} contracts={data.contracts || []} phone={phone} />

        <WarrantySection warranties={data.warranties || []} />

        <MaintenanceSection maintenance={data.maintenance || []} phone={phone} />
      </main>
    </div>
  );
}
