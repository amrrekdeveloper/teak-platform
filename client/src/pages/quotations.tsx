import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { Quotation, Customer, DesignAssignment } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useState, useMemo, useRef } from "react";
import { Plus, Search, Loader2, FileText, Check, X, UserPlus, Palette, Phone, MapPin, Eye, Pencil, Send, Upload, CheckCircle2, Receipt } from "lucide-react";
import { Link, useLocation } from "wouter";

const statusConfig: Record<string, { ar: string; en: string; color: string }> = {
  requested: { ar: "طلب جديد", en: "New Request", color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
  draft: { ar: "مسودة", en: "Draft", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  sent: { ar: "مرسل", en: "Sent", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  approved: { ar: "معتمد", en: "Approved", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  rejected: { ar: "مرفوض", en: "Rejected", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
  expired: { ar: "منتهي", en: "Expired", color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
};

interface SafeUser {
  id: number;
  username: string;
  fullNameAr: string;
  fullNameEn: string;
  role: string;
  phone: string | null;
}

export default function QuotationsPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedRequestCustomer, setSelectedRequestCustomer] = useState<Customer | null>(null);
  const [selectedDesignerId, setSelectedDesignerId] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approveTargetId, setApproveTargetId] = useState<number | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  const { data: quotations = [], isLoading } = useQuery<Quotation[]>({
    queryKey: ["/api/quotations"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: quoteRequests = [], isLoading: requestsLoading } = useQuery<Customer[]>({
    queryKey: ["/api/quote-requests"],
  });

  const { data: allUsers = [] } = useQuery<SafeUser[]>({
    queryKey: ["/api/users"],
  });

  const designers = allUsers.filter(u => u.role === "designer");

  const assignDesignerMutation = useMutation({
    mutationFn: async (data: { customerId: number; assignedTo: number; productDescription?: string }) => {
      const res = await apiRequest("POST", "/api/design-assignments", {
        customerId: data.customerId,
        assignedTo: data.assignedTo,
        status: "pending",
        productDescription: data.productDescription || "",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quote-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/design-assignments"] });
      toast({ title: t("تم تحويل الطلب للمصمم", "Request assigned to designer") });
      setAssignDialogOpen(false);
      setSelectedRequestCustomer(null);
      setSelectedDesignerId("");
      setProductDescription("");
    },
    onError: () => {
      toast({ title: t("حدث خطأ", "Error occurred"), variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, receiptData, receiptName }: { id: number; receiptData?: string; receiptName?: string }) => {
      const body: any = {};
      if (receiptData) { body.paymentReceiptData = receiptData; body.paymentReceiptName = receiptName; }
      await apiRequest("POST", `/api/quotations/${id}/approve`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: t("تم اعتماد عرض السعر وإنشاء العقد", "Quotation approved and contract created") });
      setApproveDialogOpen(false);
      setApproveTargetId(null);
      setReceiptFile(null);
      setReceiptPreview(null);
    },
    onError: () => {
      toast({ title: t("حدث خطأ أثناء الاعتماد", "Error during approval"), variant: "destructive" });
    },
  });

  const handleApproveClick = (id: number) => {
    setApproveTargetId(id);
    setReceiptFile(null);
    setReceiptPreview(null);
    setApproveDialogOpen(true);
  };

  const handleReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setReceiptPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleConfirmApprove = async () => {
    if (!approveTargetId) return;
    if (receiptFile && receiptPreview) {
      approveMutation.mutate({ id: approveTargetId, receiptData: receiptPreview, receiptName: receiptFile.name });
    } else {
      approveMutation.mutate({ id: approveTargetId });
    }
  };

  const rejectMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/quotations/${id}/reject`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      toast({ title: t("تم رفض عرض السعر", "Quotation rejected") });
    },
  });

  const getCustomerName = (customerId: number) => {
    return customers.find((c) => c.id === customerId)?.fullName || "";
  };

  const quotationCustomerIds = useMemo(() => {
    const ids = new Set(quotations.map(q => q.customerId));
    return customers.filter(c => ids.has(c.id));
  }, [quotations, customers]);

  const filtered = quotations.filter((q) => {
    const matchSearch =
      search === "" ||
      getCustomerName(q.customerId).includes(search) ||
      String(q.quotationNumber).includes(search);
    const matchStatus = statusFilter === "all" || q.status === statusFilter;
    const matchCustomer = customerFilter === "all" || String(q.customerId) === customerFilter;
    return matchSearch && matchStatus && matchCustomer;
  });

  const isManager = user?.role === "owner" || user?.role === "assistant";
  const canApproveQuotation = (q: Quotation) => {
    if (isManager) return q.status === "draft" || q.status === "sent";
    if (user?.role === "sales") return (q.status === "draft" || q.status === "sent") && (Number(q.assignedTo) === Number(user.id) || Number(q.createdBy) === Number(user.id));
    return false;
  };
  const canAssign = user?.role === "owner" || user?.role === "assistant" || user?.role === "sales";

  const handleOpenAssignDialog = (customer: Customer) => {
    setSelectedRequestCustomer(customer);
    const notesStr = customer.notes || "";
    const interestMatch = notesStr.match(/اهتمام:\s*([^.]*)/);
    setProductDescription(interestMatch ? interestMatch[1].trim() : "");
    setAssignDialogOpen(true);
  };

  return (
    <div>
      {canAssign && quoteRequests.length > 0 && (
        <div className="mb-6">
          <Card className="border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Palette className="w-5 h-5 text-primary" />
                {t("طلبات عروض أسعار جديدة", "New Quote Requests")}
                <Badge variant="secondary" className="text-xs">
                  {quoteRequests.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {requestsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              ) : (
                quoteRequests.map((req) => (
                  <div
                    key={req.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 border rounded-md"
                    data-testid={`quote-request-${req.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium" data-testid={`text-request-name-${req.id}`}>{req.fullName}</p>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {req.phone}
                        </span>
                        {req.city && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {req.city}
                          </span>
                        )}
                        {req.notes && (
                          <span className="truncate max-w-[200px]">{req.notes}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {req.createdAt && new Date(req.createdAt).toLocaleDateString(t("ar-SA", "en-US"))}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenAssignDialog(req)}
                        data-testid={`button-assign-designer-${req.id}`}
                      >
                        <UserPlus className="w-3 h-3 me-1" />
                        {t("تحويل لمصمم", "Assign Designer")}
                      </Button>
                      <Link href={`/quotations/new?customerId=${req.id}`}>
                        <Button size="sm" data-testid={`button-create-quote-${req.id}`}>
                          <Plus className="w-3 h-3 me-1" />
                          {t("إنشاء عرض مباشر", "Create Quote")}
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-quotations-title">
            {t("عروض الأسعار", "Quotations")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t(`${quotations.length} عرض سعر`, `${quotations.length} quotations`)}
          </p>
        </div>
        <Link href="/quotations/new">
          <Button data-testid="button-new-quotation">
            <Plus className="w-4 h-4 me-2" />
            {t("عرض سعر جديد", "New Quotation")}
          </Button>
        </Link>
      </div>

      <div className="flex flex-col gap-3 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("بحث...", "Search...")}
              className="ps-10"
              data-testid="input-search-quotations"
            />
          </div>
          {quotationCustomerIds.length > 1 && (
            <Select value={customerFilter} onValueChange={setCustomerFilter}>
              <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-customer-filter">
                <SelectValue placeholder={t("كل العملاء", "All Customers")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("كل العملاء", "All Customers")}</SelectItem>
                {quotationCustomerIds.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto flex-nowrap pb-1">
          {["all", "requested", "draft", "sent", "approved", "rejected", "expired"].map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? "default" : "outline"}
              size="sm"
              className="shrink-0 whitespace-nowrap"
              onClick={() => setStatusFilter(status)}
              data-testid={`button-filter-${status}`}
            >
              {status === "all"
                ? t("الكل", "All")
                : t(statusConfig[status]?.ar || status, statusConfig[status]?.en || status)}
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
            {t("لا توجد عروض أسعار", "No quotations found")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((q) => {
            const config = statusConfig[q.status] || statusConfig.draft;
            return (
              <Card key={q.id} data-testid={`card-quotation-${q.id}`}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">#{q.quotationNumber}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${config.color}`}>
                            {t(config.ar, config.en)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {getCustomerName(q.customerId)} - {new Date(q.createdAt).toLocaleDateString("ar-SA")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <span className="text-lg font-bold">
                        {parseFloat(q.finalPrice).toLocaleString()} SAR
                      </span>
                      {(q.status === "draft" || q.status === "sent") && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-amber-600"
                          onClick={() => navigate(`/quotation-builder?quotationId=${q.id}`)}
                          data-testid={`button-edit-${q.id}`}
                          title={t("تحرير عرض السعر", "Edit Quotation")}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                      )}
                      <Link href={`/quotations/${q.id}/view`}>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-blue-600"
                          data-testid={`button-view-${q.id}`}
                          title={t("عرض عرض السعر", "View Quotation")}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Link>
                      {canApproveQuotation(q) && (
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-green-600"
                            onClick={() => handleApproveClick(q.id)}
                            disabled={approveMutation.isPending}
                            data-testid={`button-approve-${q.id}`}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-red-600"
                            onClick={() => rejectMutation.mutate(q.id)}
                            disabled={rejectMutation.isPending}
                            data-testid={`button-reject-${q.id}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Payment Receipt / Approval Dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={(open) => { setApproveDialogOpen(open); if (!open) { setReceiptFile(null); setReceiptPreview(null); } }}>
        <DialogContent className="max-w-sm" data-testid="dialog-approve-receipt">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-green-600" />
              {t("اعتماد عرض السعر", "Approve Quotation")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("يمكنك إرفاق وصل الدفع قبل الاعتماد (اختياري).", "You may attach a payment receipt before approval (optional).")}
            </p>
            <input
              ref={receiptInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={handleReceiptFileChange}
              data-testid="input-receipt-file"
            />
            {receiptPreview ? (
              <div className="border rounded-md p-2 space-y-2">
                {receiptFile?.type.startsWith("image/") ? (
                  <img src={receiptPreview} alt="receipt" className="max-h-40 w-full object-contain rounded" />
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="w-4 h-4" />
                    <span>{receiptFile?.name}</span>
                  </div>
                )}
                <Button size="sm" variant="ghost" className="text-destructive w-full" onClick={() => { setReceiptFile(null); setReceiptPreview(null); }}>
                  {t("إزالة الوصل", "Remove receipt")}
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full h-20 flex flex-col gap-1 border-dashed"
                onClick={() => receiptInputRef.current?.click()}
                data-testid="button-upload-receipt"
              >
                <Upload className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{t("رفع وصل الدفع", "Upload payment receipt")}</span>
              </Button>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setApproveDialogOpen(false)} data-testid="button-cancel-approve">
              {t("إلغاء", "Cancel")}
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleConfirmApprove}
              disabled={approveMutation.isPending}
              data-testid="button-confirm-approve"
            >
              {approveMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 me-1" />
                  {t("اعتماد", "Approve")}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("تحويل لمصمم", "Assign to Designer")}</DialogTitle>
          </DialogHeader>
          {selectedRequestCustomer && (
            <div className="space-y-4">
              <div className="p-3 border rounded-md">
                <p className="font-medium">{selectedRequestCustomer.fullName}</p>
                <p className="text-sm text-muted-foreground">{selectedRequestCustomer.phone}</p>
                {selectedRequestCustomer.notes && (
                  <p className="text-sm text-muted-foreground mt-1">{selectedRequestCustomer.notes}</p>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("اختر المصمم", "Select Designer")}</label>
                <Select value={selectedDesignerId} onValueChange={setSelectedDesignerId}>
                  <SelectTrigger data-testid="select-designer">
                    <SelectValue placeholder={t("اختر المصمم", "Select designer")} />
                  </SelectTrigger>
                  <SelectContent>
                    {designers.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {t(d.fullNameAr, d.fullNameEn)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("وصف المنتج", "Product Description")}</label>
                <Input
                  value={productDescription}
                  onChange={(e) => setProductDescription(e.target.value)}
                  placeholder={t("مطبخ، خزانة، باب...", "Kitchen, wardrobe, door...")}
                  data-testid="input-product-description"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)} data-testid="button-cancel-assign">
              {t("إلغاء", "Cancel")}
            </Button>
            <Button
              onClick={() => {
                if (!selectedDesignerId || !selectedRequestCustomer) return;
                assignDesignerMutation.mutate({
                  customerId: selectedRequestCustomer.id,
                  assignedTo: parseInt(selectedDesignerId),
                  productDescription,
                });
              }}
              disabled={!selectedDesignerId || assignDesignerMutation.isPending}
              data-testid="button-confirm-assign"
            >
              {assignDesignerMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t("تحويل", "Assign")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
