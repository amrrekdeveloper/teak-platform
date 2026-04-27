import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useLanguage } from "@/components/language-provider";
import type { PurchaseOrder, Supplier } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Loader2, ShoppingCart, Clock, CheckCircle2, XCircle, Truck, PackageCheck } from "lucide-react";

interface POItem {
  materialNameAr: string;
  materialNameEn: string;
  quantity: string;
  unitPrice: string;
  total: number;
}

const statusConfig: Record<string, { ar: string; en: string; color: string; icon: any }> = {
  draft: { ar: "مسودة", en: "Draft", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300", icon: Clock },
  pending_approval: { ar: "بانتظار الموافقة", en: "Pending Approval", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300", icon: Clock },
  approved: { ar: "معتمد", en: "Approved", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300", icon: CheckCircle2 },
  ordered: { ar: "تم الطلب", en: "Ordered", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300", icon: ShoppingCart },
  partially_received: { ar: "استلام جزئي", en: "Partially Received", color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300", icon: PackageCheck },
  received: { ar: "مستلم", en: "Received", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300", icon: PackageCheck },
  cancelled: { ar: "ملغي", en: "Cancelled", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300", icon: XCircle },
};

export default function PurchaseDetailPage() {
  const { t, isRTL } = useLanguage();
  const [, params] = useRoute("/purchases/:id");
  const id = params?.id;

  const { data: po, isLoading, isError } = useQuery<PurchaseOrder>({
    queryKey: ["/api/purchase-orders", id],
    enabled: !!id,
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !po) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-muted-foreground" data-testid="text-po-not-found">
          {t("أمر الشراء غير موجود", "Purchase order not found")}
        </p>
        <Link href="/purchases">
          <Button variant="outline">
            {isRTL ? <ArrowRight className="w-4 h-4 me-2" /> : <ArrowLeft className="w-4 h-4 me-2" />}
            {t("العودة إلى أوامر الشراء", "Back to Purchase Orders")}
          </Button>
        </Link>
      </div>
    );
  }

  const supplier = suppliers.find(s => s.id === po.supplierId);
  const status = statusConfig[po.status] || statusConfig.draft;
  const StatusIcon = status.icon;
  const items = Array.isArray(po.items) ? po.items as POItem[] : [];
  const totalAmount = parseFloat(po.totalAmount?.toString() || "0");

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-4">
      <div className="flex items-center gap-3">
        <Link href="/purchases">
          <Button variant="ghost" size="sm" data-testid="button-back-purchases">
            {isRTL ? <ArrowRight className="w-4 h-4 me-1" /> : <ArrowLeft className="w-4 h-4 me-1" />}
            {t("أوامر الشراء", "Purchase Orders")}
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <ShoppingCart className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-po-title">
            {t("أمر شراء", "Purchase Order")} #{po.orderNumber}
          </h1>
          <p className="text-sm text-muted-foreground">
            {supplier?.name || `#${po.supplierId}`}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("تفاصيل الأمر", "Order Details")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <span className="text-muted-foreground">{t("الحالة", "Status")}</span>
            <Badge className={status.color} data-testid="badge-po-status">
              <StatusIcon className="w-3 h-3 me-1" />
              {t(status.ar, status.en)}
            </Badge>

            <span className="text-muted-foreground">{t("المورد", "Supplier")}</span>
            <span className="font-medium" data-testid="text-po-supplier">
              {supplier?.name || `#${po.supplierId}`}
            </span>

            <span className="text-muted-foreground">{t("إجمالي الأمر", "Order Total")}</span>
            <span className="font-bold text-primary text-base" data-testid="text-po-total">
              {totalAmount.toLocaleString()} {t("ر.س", "SAR")}
            </span>

            <span className="text-muted-foreground">{t("عدد المواد", "Items Count")}</span>
            <span data-testid="text-po-items-count">{items.length}</span>
          </div>
        </CardContent>
      </Card>

      {items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("المواد المطلوبة", "Ordered Items")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-po-items">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-start p-3">{t("المادة", "Material")}</th>
                    <th className="text-center p-3">{t("الكمية", "Qty")}</th>
                    <th className="text-center p-3">{t("سعر الوحدة", "Unit Price")}</th>
                    <th className="text-center p-3">{t("المجموع", "Total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} className="border-t" data-testid={`row-po-item-${idx}`}>
                      <td className="p-3">{t(item.materialNameAr, item.materialNameEn)}</td>
                      <td className="text-center p-3">{item.quantity}</td>
                      <td className="text-center p-3">{parseFloat(item.unitPrice || "0").toLocaleString()}</td>
                      <td className="text-center p-3 font-semibold">{(item.total || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted/50">
                  <tr>
                    <td colSpan={3} className="p-3 font-bold text-end">{t("الإجمالي", "Total")}</td>
                    <td className="text-center p-3 font-bold text-primary" data-testid="text-po-items-total">
                      {totalAmount.toLocaleString()} {t("ر.س", "SAR")}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-center">
        <Link href="/purchases">
          <Button variant="outline" data-testid="button-back-purchases-bottom">
            {isRTL ? <ArrowRight className="w-4 h-4 me-2" /> : <ArrowLeft className="w-4 h-4 me-2" />}
            {t("العودة إلى قائمة أوامر الشراء", "Back to Purchase Orders List")}
          </Button>
        </Link>
      </div>
    </div>
  );
}
