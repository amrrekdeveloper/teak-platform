import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useRoute, Link } from "wouter";
import type { Quotation, Customer } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Loader2, Printer } from "lucide-react";
import { useState, useEffect } from "react";
import teakLogo from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";
import { LoadingTransition } from "@/components/loading-transition";

export default function QuotationViewPage() {
  const { t, isRTL } = useLanguage();
  const [, params] = useRoute("/quotations/:id/view");
  const id = params?.id;
  const autoPrint = new URLSearchParams(window.location.search).get("print") === "1";

  const { data: quotation, isLoading: quotationLoading } = useQuery<Quotation>({
    queryKey: ["/api/quotations", id],
    enabled: !!id,
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  interface CompanySettings {
    nameAr?: string;
    vatNumber?: string;
    address?: string;
  }
  const { data: companySettings } = useQuery<CompanySettings>({
    queryKey: ["/api/company-settings/public"],
  });

  const [showPrintTransition, setShowPrintTransition] = useState(false);

  useEffect(() => {
    if (autoPrint && quotation && !quotationLoading) {
      const timer = setTimeout(() => setShowPrintTransition(true), 800);
      return () => clearTimeout(timer);
    }
  }, [autoPrint, quotation, quotationLoading]);

  const fmtNum = (v: string | number | null | undefined) =>
    parseFloat(String(v || 0)).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const customer = customers.find((c) => c.id === quotation?.customerId);

  const validUntil = quotation?.validUntil
    ? new Date(quotation.validUntil)
    : quotation?.createdAt
    ? new Date(new Date(quotation.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000)
    : null;

  const doPrint = () => {
    const content = document.getElementById("quotation-receipt");
    if (!content) {
      window.print();
      return;
    }
    const pw = window.open("", "_blank");
    if (!pw) return;
    pw.document.write(`
      <html dir="rtl">
        <head>
          <title>${t("عرض سعر", "Price Quotation")} #${quotation?.quotationNumber || id}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: system-ui, -apple-system, sans-serif; padding: 8px; color: #000; font-size: 11px; max-width: 80mm; margin: 0 auto; direction: rtl; }
            table { border-collapse: collapse; width: 100%; }
            td, th { border: 1px solid #000; padding: 3px 4px; font-size: 10px; }
            @media print { @page { size: 80mm auto; margin: 4mm; } body { max-width: 100%; } }
          </style>
        </head>
        <body>${content.innerHTML}</body>
      </html>
    `);
    pw.document.close();
    setTimeout(() => {
      pw.print();
      pw.close();
    }, 500);
  };

  const handlePrint = () => {
    setShowPrintTransition(true);
  };

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  if (quotationLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!quotation) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {t("عرض السعر غير موجود", "Quotation not found")}
      </div>
    );
  }

  interface QuotationItem {
    nameAr?: string;
    nameEn?: string;
    description?: string;
    productType?: string;
    code?: string;
    quantity?: number | string;
    unitPrice?: number | string;
    optionsCost?: number | string;
    total?: number | string;
  }
  const items: QuotationItem[] = Array.isArray(quotation.items) ? (quotation.items as QuotationItem[]) : [];
  const sellerName =
    companySettings?.nameAr || "مصنع تيك للمنتجات الخشبية";
  const sellerVatNumber = companySettings?.vatNumber || "311476070100003";
  const sellerAddress = companySettings?.address || "الرياض، المملكة العربية السعودية";

  return (
    <div className="max-w-md mx-auto">
      <LoadingTransition
        show={showPrintTransition}
        message={t("جاري تجهيز عرض السعر...", "Preparing quotation...")}
        subMessage={t("يتم تجهيز المستند للطباعة", "Preparing document for printing")}
        duration={1000}
        onComplete={() => {
          setShowPrintTransition(false);
          doPrint();
        }}
      />

      <div className="flex items-center justify-between mb-4 print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/quotations">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <BackIcon className="w-4 h-4" />
            </Button>
          </Link>
          <h1 className="text-lg font-bold">
            {t("عرض سعر", "Price Quotation")} #{quotation.quotationNumber}
          </h1>
        </div>
        <Button onClick={handlePrint} size="sm" data-testid="button-print">
          <Printer className="w-4 h-4 me-2" />
          {t("طباعة", "Print")}
        </Button>
      </div>

      <div className="bg-white rounded-lg border shadow-sm print:shadow-none print:border-none overflow-hidden">
        <div
          id="quotation-receipt"
          dir="rtl"
          className="p-4 text-black"
          style={{
            fontSize: "12px",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <div
            style={{
              backgroundColor: "#2563eb",
              color: "#fff",
              textAlign: "center",
              padding: "10px 4px",
              fontWeight: "bold",
              fontSize: "16px",
              marginBottom: "10px",
            }}
          >
            {t("عرض سعر", "Price Quotation")}
          </div>

          <div
            style={{
              textAlign: "center",
              marginBottom: "8px",
              fontSize: "12px",
            }}
          >
            {t("رقم عرض السعر:", "Quotation #:")} {quotation.quotationNumber}
          </div>

          <div style={{ textAlign: "center", marginBottom: "4px" }}>
            <img
              src={teakLogo}
              alt="Teak"
              style={{
                width: "44px",
                height: "44px",
                objectFit: "contain",
                margin: "0 auto 4px",
                display: "block",
              }}
            />
          </div>

          <div
            style={{
              textAlign: "center",
              fontWeight: "bold",
              fontSize: "14px",
              marginBottom: "2px",
            }}
          >
            {sellerName}
          </div>
          <div
            style={{
              textAlign: "center",
              fontSize: "11px",
              color: "#666",
              marginBottom: "10px",
            }}
          >
            {sellerAddress}
          </div>

          <div
            style={{
              border: "1px solid #000",
              padding: "8px 10px",
              marginBottom: "10px",
              fontSize: "11px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "4px",
              }}
            >
              <span>{t("تاريخ الإصدار:", "Issue Date:")}</span>
              <span>
                {quotation.createdAt
                  ? new Date(quotation.createdAt).toLocaleDateString("ar-SA", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    })
                  : "-"}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "4px",
              }}
            >
              <span>{t("صالح حتى:", "Valid Until:")}</span>
              <span style={{ color: "#2563eb", fontWeight: "bold" }}>
                {validUntil
                  ? validUntil.toLocaleDateString("ar-SA", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    })
                  : "-"}
              </span>
            </div>
            <div>
              <span>{t("رقم تسجيل ضريبة القيمة المضافة: ", "VAT Reg. No.: ")}</span>
              <span style={{ direction: "ltr", unicodeBidi: "embed" }}>
                {sellerVatNumber}
              </span>
            </div>
          </div>

          {customer && (
            <div
              style={{
                border: "1px solid #000",
                padding: "8px 10px",
                marginBottom: "10px",
                fontSize: "11px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "4px",
                }}
              >
                <span>{t("اسم العميل:", "Customer:")}</span>
                <span style={{ fontWeight: "bold" }}>{customer.fullName}</span>
              </div>
              {customer.phone && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>{t("الجوال:", "Phone:")}</span>
                  <span style={{ direction: "ltr", unicodeBidi: "embed" }}>
                    {customer.phone}
                  </span>
                </div>
              )}
            </div>
          )}

          {items.length > 0 && (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                marginBottom: "10px",
                fontSize: "11px",
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      border: "1px solid #000",
                      padding: "5px 4px",
                      textAlign: "right",
                      fontWeight: "bold",
                    }}
                  >
                    {t("البند", "Item")}
                  </th>
                  <th
                    style={{
                      border: "1px solid #000",
                      padding: "5px 4px",
                      textAlign: "center",
                      fontWeight: "bold",
                    }}
                  >
                    {t("الكمية", "Qty")}
                  </th>
                  <th
                    style={{
                      border: "1px solid #000",
                      padding: "5px 4px",
                      textAlign: "center",
                      fontWeight: "bold",
                    }}
                  >
                    {t("السعر", "Price")}
                  </th>
                  <th
                    style={{
                      border: "1px solid #000",
                      padding: "5px 4px",
                      textAlign: "center",
                      fontWeight: "bold",
                    }}
                  >
                    {t("الضريبة", "VAT")}
                  </th>
                  <th
                    style={{
                      border: "1px solid #000",
                      padding: "5px 4px",
                      textAlign: "center",
                      fontWeight: "bold",
                    }}
                  >
                    {t("الإجمالي شامل الضريبة", "Total incl. VAT")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const itemQty = parseFloat(String(item.quantity ?? 1));
                  const unitPrice = parseFloat(String(item.unitPrice ?? 0));
                  const optionsCost = parseFloat(String(item.optionsCost ?? 0));
                  const linePreTax = (unitPrice + optionsCost) * itemQty;
                  const lineVat = linePreTax * 0.15;
                  const lineWithVat = linePreTax + lineVat;
                  const description =
                    item.nameAr ||
                    item.description ||
                    item.productType ||
                    `${t("بند", "Item")} ${idx + 1}`;
                  return (
                    <tr key={idx}>
                      <td
                        style={{
                          border: "1px solid #000",
                          padding: "4px",
                          textAlign: "right",
                        }}
                      >
                        {description}
                        {item.code && (
                          <div style={{ fontSize: "9px", color: "#666" }}>
                            {item.code}
                          </div>
                        )}
                      </td>
                      <td
                        style={{
                          border: "1px solid #000",
                          padding: "4px",
                          textAlign: "center",
                        }}
                      >
                        {itemQty}
                      </td>
                      <td
                        style={{
                          border: "1px solid #000",
                          padding: "4px",
                          textAlign: "center",
                        }}
                      >
                        {fmtNum(unitPrice + optionsCost)}
                      </td>
                      <td
                        style={{
                          border: "1px solid #000",
                          padding: "4px",
                          textAlign: "center",
                        }}
                      >
                        {fmtNum(lineVat)}
                      </td>
                      <td
                        style={{
                          border: "1px solid #000",
                          padding: "4px",
                          textAlign: "center",
                        }}
                      >
                        {fmtNum(lineWithVat)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div style={{ marginBottom: "10px" }}>
            <div
              style={{
                border: "1px solid #000",
                padding: "7px 10px",
                display: "flex",
                justifyContent: "space-between",
                fontSize: "12px",
              }}
            >
              <span>{t("إجمالي المبلغ قبل الضريبة", "Subtotal (excl. VAT)")}</span>
              <span style={{ fontWeight: "bold" }}>
                {fmtNum(quotation.subtotal)}
              </span>
            </div>
            {parseFloat(quotation.discount || "0") > 0 && (
              <div
                style={{
                  border: "1px solid #000",
                  borderTop: "none",
                  padding: "7px 10px",
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "12px",
                  color: "#16a34a",
                }}
              >
                <span>{t("الخصم", "Discount")}</span>
                <span style={{ fontWeight: "bold" }}>
                  -{fmtNum(quotation.discount)}
                </span>
              </div>
            )}
            <div
              style={{
                border: "1px solid #000",
                borderTop: "none",
                padding: "7px 10px",
                display: "flex",
                justifyContent: "space-between",
                fontSize: "12px",
              }}
            >
              <span>{t("ضريبة القيمة المضافة (15%)", "VAT (15%)")}</span>
              <span style={{ fontWeight: "bold" }}>
                {fmtNum(quotation.vatAmount)}
              </span>
            </div>
            <div
              style={{
                border: "1px solid #000",
                borderTop: "none",
                padding: "7px 10px",
                display: "flex",
                justifyContent: "space-between",
                fontSize: "12px",
                backgroundColor: "#dbeafe",
                fontWeight: "bold",
              }}
            >
              <span>{t("الإجمالي النهائي شامل الضريبة", "Total incl. VAT")}</span>
              <span>{fmtNum(quotation.finalPrice)}</span>
            </div>
          </div>

          {quotation.deliveryDays && (
            <div
              style={{
                border: "1px solid #ddd",
                padding: "6px 10px",
                marginBottom: "10px",
                fontSize: "11px",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>{t("مدة التسليم:", "Delivery:")}</span>
              <span>
                {quotation.deliveryDays} {t("يوم", "days")}
              </span>
            </div>
          )}

          {quotation.notes && (
            <div
              style={{
                border: "1px solid #ddd",
                padding: "6px 10px",
                marginBottom: "10px",
                fontSize: "11px",
              }}
            >
              <div style={{ fontWeight: "bold", marginBottom: "3px" }}>
                {t("ملاحظات:", "Notes:")}
              </div>
              <div style={{ color: "#444" }}>{quotation.notes}</div>
            </div>
          )}

          <div
            style={{
              textAlign: "center",
              fontSize: "10px",
              color: "#888",
              marginTop: "12px",
              borderTop: "1px dashed #ccc",
              paddingTop: "8px",
            }}
          >
            <div>
              {t(
                "هذا عرض سعر وليس فاتورة رسمية — صالح حتى",
                "This is a price quotation, not an official invoice — valid until"
              )}{" "}
              {validUntil
                ? validUntil.toLocaleDateString("ar-SA", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                  })
                : "-"}
            </div>
            <div style={{ marginTop: "4px" }}>
              {sellerName} | {sellerVatNumber}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
