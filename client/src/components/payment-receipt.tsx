import { useRef } from "react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Printer, Share2, X, Download } from "lucide-react";
import teakLogo from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";

interface ReceiptData {
  receiptNumber: string;
  customerName: string;
  amount: string;
  paymentMethod: string;
  bankReference?: string;
  paymentStage: string;
  contractNumber?: string;
  date: string;
  companyName?: string;
  companyVat?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyLogo?: string;
  companyStamp?: string;
  notes?: string;
}

const methodLabelsAr: Record<string, string> = {
  bank_transfer: "تحويل بنكي",
  cash: "نقدي",
  card: "بطاقة / POS",
};

const methodLabelsEn: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  cash: "Cash",
  card: "Card / POS",
};

const stageLabelsAr: Record<string, string> = {
  deposit: "عربون",
  pre_manufacturing: "قبل التصنيع",
  delivery: "عند التوصيل",
  final: "نهائية",
  other: "أخرى",
};

const stageLabelsEn: Record<string, string> = {
  deposit: "Deposit",
  pre_manufacturing: "Pre-manufacturing",
  delivery: "Upon Delivery",
  final: "Final",
  other: "Other",
};

function numberToArabicWords(num: number): string {
  if (num === 0) return "صفر";
  const ones = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
  const teens = ["عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
  const tens = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
  const hundreds = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

  const parts: string[] = [];
  const intNum = Math.floor(num);
  
  if (intNum >= 1000000) {
    const m = Math.floor(intNum / 1000000);
    parts.push(m === 1 ? "مليون" : m === 2 ? "مليونان" : `${ones[m] || m} ملايين`);
  }
  const remaining = intNum % 1000000;
  if (remaining >= 1000) {
    const th = Math.floor(remaining / 1000);
    if (th === 1) parts.push("ألف");
    else if (th === 2) parts.push("ألفان");
    else if (th <= 9) parts.push(`${ones[th]} آلاف`);
    else parts.push(`${th} ألف`);
  }
  const rem = remaining % 1000;
  if (rem >= 100) parts.push(hundreds[Math.floor(rem / 100)]);
  const lastTwo = rem % 100;
  if (lastTwo >= 10 && lastTwo <= 19) {
    parts.push(teens[lastTwo - 10]);
  } else {
    if (lastTwo % 10 > 0) parts.push(ones[lastTwo % 10]);
    if (lastTwo >= 20) parts.push(tens[Math.floor(lastTwo / 10)]);
  }

  return parts.filter(Boolean).join(" و") + " ريال سعودي";
}

export function PaymentReceiptModal({ data, onClose }: { data: ReceiptData; onClose: () => void }) {
  const { t } = useLanguage();
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const pw = window.open("", "_blank");
    if (!pw) return;
    const safeReceiptNum = String(data.receiptNumber || "").replace(/[<>&"']/g, "");
    const clonedContent = content.cloneNode(true) as HTMLElement;
    pw.document.open();
    pw.document.write(`<html dir="rtl"><head><title>سند قبض ${safeReceiptNum}</title><style>* { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: system-ui, -apple-system, sans-serif; padding: 20px; color: #000; font-size: 13px; direction: rtl; max-width: 700px; margin: 0 auto; } table { border-collapse: collapse; width: 100%; } td, th { border: 1px solid #333; padding: 8px 10px; font-size: 12px; } @media print { @page { size: A4; margin: 15mm; } }</style></head><body></body></html>`);
    pw.document.close();
    pw.document.body.appendChild(clonedContent);
    setTimeout(() => { pw.print(); pw.close(); }, 500);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `سند قبض ${data.receiptNumber}`,
          text: `سند قبض رقم ${data.receiptNumber} - ${data.customerName} - ${parseFloat(data.amount).toLocaleString()} ريال`,
        });
      } catch {}
    }
  };

  const amount = parseFloat(data.amount);
  const amountInWords = numberToArabicWords(amount);
  const formattedDate = new Date(data.date).toLocaleDateString("ar-SA", {
    year: "numeric", month: "long", day: "numeric",
  });
  const hijriDate = new Date(data.date).toLocaleDateString("ar-SA-u-ca-islamic", {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-[550px] sm:rounded-xl rounded-t-xl max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b px-3 py-2 flex items-center justify-between z-10">
          <h3 className="font-semibold text-sm text-black">{t("سند قبض", "Payment Receipt")}</h3>
          <div className="flex items-center gap-1">
            {typeof navigator.share === "function" && (
              <button className="p-1.5 rounded hover:bg-gray-100" onClick={handleShare} data-testid="button-share-receipt">
                <Share2 className="w-3.5 h-3.5 text-gray-600" />
              </button>
            )}
            <button className="p-1.5 rounded hover:bg-gray-100" onClick={handlePrint} data-testid="button-print-receipt">
              <Printer className="w-3.5 h-3.5 text-gray-600" />
            </button>
            <button className="p-1.5 rounded hover:bg-gray-100" onClick={onClose} data-testid="button-close-receipt">
              <X className="w-3.5 h-3.5 text-gray-600" />
            </button>
          </div>
        </div>

        <div ref={printRef} dir="rtl" className="p-5 text-black" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
          <div style={{ border: "2px solid #1a365d", padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "2px solid #1a365d", paddingBottom: "12px" }}>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: "20px", fontWeight: "bold", color: "#1a365d", marginBottom: "4px" }}>
                  {data.companyName || "مصنع تيك للمنتجات الخشبية"}
                </h2>
                <p style={{ fontSize: "11px", color: "#555" }}>
                  {data.companyAddress || "الرياض - المملكة العربية السعودية"}
                </p>
                {data.companyVat && (
                  <p style={{ fontSize: "11px", color: "#555" }}>
                    الرقم الضريبي: {data.companyVat}
                  </p>
                )}
                {data.companyPhone && (
                  <p style={{ fontSize: "11px", color: "#555" }}>
                    هاتف: {data.companyPhone}
                  </p>
                )}
              </div>
              <div style={{ textAlign: "center" }}>
                <img src={data.companyLogo || teakLogo} alt="Logo" style={{ width: "60px", height: "60px", objectFit: "contain" }} />
              </div>
            </div>

            <div style={{ textAlign: "center", backgroundColor: "#1a365d", color: "#fff", padding: "10px", fontSize: "18px", fontWeight: "bold", marginBottom: "16px", letterSpacing: "2px" }}>
              سند قبض &nbsp;/&nbsp; Payment Receipt
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px" }}>
              <tbody>
                <tr>
                  <td style={{ border: "1px solid #333", padding: "8px 10px", fontWeight: "bold", backgroundColor: "#f7fafc", width: "30%" }}>رقم السند</td>
                  <td style={{ border: "1px solid #333", padding: "8px 10px", width: "20%" }}>{data.receiptNumber}</td>
                  <td style={{ border: "1px solid #333", padding: "8px 10px", fontWeight: "bold", backgroundColor: "#f7fafc", width: "30%" }}>التاريخ الميلادي</td>
                  <td style={{ border: "1px solid #333", padding: "8px 10px", width: "20%" }}>{formattedDate}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #333", padding: "8px 10px", fontWeight: "bold", backgroundColor: "#f7fafc" }}>رقم العقد</td>
                  <td style={{ border: "1px solid #333", padding: "8px 10px" }}>{data.contractNumber || "-"}</td>
                  <td style={{ border: "1px solid #333", padding: "8px 10px", fontWeight: "bold", backgroundColor: "#f7fafc" }}>التاريخ الهجري</td>
                  <td style={{ border: "1px solid #333", padding: "8px 10px" }}>{hijriDate}</td>
                </tr>
              </tbody>
            </table>

            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px" }}>
              <tbody>
                <tr>
                  <td style={{ border: "1px solid #333", padding: "10px", fontWeight: "bold", backgroundColor: "#f7fafc", width: "30%" }}>استلمنا من السيد/ة</td>
                  <td colSpan={3} style={{ border: "1px solid #333", padding: "10px", fontSize: "15px", fontWeight: "bold" }}>{data.customerName}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #333", padding: "10px", fontWeight: "bold", backgroundColor: "#f7fafc" }}>المبلغ (رقماً)</td>
                  <td style={{ border: "1px solid #333", padding: "10px", fontSize: "16px", fontWeight: "bold", color: "#16a34a" }}>
                    {amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ريال
                  </td>
                  <td style={{ border: "1px solid #333", padding: "10px", fontWeight: "bold", backgroundColor: "#f7fafc", width: "20%" }}>مرحلة الدفع</td>
                  <td style={{ border: "1px solid #333", padding: "10px" }}>{stageLabelsAr[data.paymentStage] || data.paymentStage}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #333", padding: "10px", fontWeight: "bold", backgroundColor: "#f7fafc" }}>المبلغ (كتابةً)</td>
                  <td colSpan={3} style={{ border: "1px solid #333", padding: "10px" }}>{amountInWords}</td>
                </tr>
                <tr>
                  <td style={{ border: "1px solid #333", padding: "10px", fontWeight: "bold", backgroundColor: "#f7fafc" }}>طريقة الدفع</td>
                  <td style={{ border: "1px solid #333", padding: "10px" }}>{methodLabelsAr[data.paymentMethod] || data.paymentMethod}</td>
                  <td style={{ border: "1px solid #333", padding: "10px", fontWeight: "bold", backgroundColor: "#f7fafc" }}>رقم العملية</td>
                  <td style={{ border: "1px solid #333", padding: "10px", direction: "ltr" }}>{data.bankReference || "-"}</td>
                </tr>
                {data.notes && (
                  <tr>
                    <td style={{ border: "1px solid #333", padding: "10px", fontWeight: "bold", backgroundColor: "#f7fafc" }}>ملاحظات</td>
                    <td colSpan={3} style={{ border: "1px solid #333", padding: "10px" }}>{data.notes}</td>
                  </tr>
                )}
              </tbody>
            </table>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "30px", paddingTop: "16px" }}>
              <div style={{ textAlign: "center", width: "40%" }}>
                <div style={{ borderBottom: "1px solid #333", marginBottom: "6px", height: "50px" }}></div>
                <p style={{ fontSize: "11px", fontWeight: "bold" }}>توقيع المستلم</p>
              </div>
              <div style={{ textAlign: "center", width: "40%" }}>
                {data.companyStamp ? (
                  <img src={data.companyStamp} alt="Stamp" style={{ width: "80px", height: "80px", objectFit: "contain", margin: "0 auto" }} />
                ) : (
                  <div style={{ borderBottom: "1px solid #333", marginBottom: "6px", height: "50px" }}></div>
                )}
                <p style={{ fontSize: "11px", fontWeight: "bold" }}>ختم الشركة</p>
              </div>
            </div>

            <div style={{ textAlign: "center", fontSize: "9px", color: "#999", marginTop: "16px", borderTop: "1px solid #eee", paddingTop: "8px" }}>
              هذا السند يعتبر إقراراً باستلام المبلغ المذكور أعلاه — This receipt confirms the collection of the amount stated above
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t p-2.5 flex gap-2">
          <Button variant="outline" className="flex-1 h-9 text-xs" onClick={handlePrint} data-testid="button-print-receipt-bottom">
            <Printer className="w-3.5 h-3.5 me-1.5" />
            {t("طباعة / حفظ PDF", "Print / Save PDF")}
          </Button>
          {typeof navigator.share === "function" && (
            <Button variant="outline" className="flex-1 h-9 text-xs" onClick={handleShare} data-testid="button-share-receipt-bottom">
              <Share2 className="w-3.5 h-3.5 me-1.5" />
              {t("مشاركة", "Share")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
