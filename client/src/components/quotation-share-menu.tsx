import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Share2,
  Eye,
  Send,
  MessageCircle,
  Download,
  Mail,
  Loader2,
  Check,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/components/language-provider";

interface QuotationShareMenuProps {
  quotationId: number;
  quotationNumber?: string | number;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  totalPrice?: number | string;
  status?: string;
  triggerLabel?: string;
  triggerClassName?: string;
  triggerSize?: "sm" | "default" | "lg" | "icon";
  iconOnly?: boolean;
}

export function QuotationShareMenu({
  quotationId,
  quotationNumber,
  customerName,
  customerPhone,
  customerEmail,
  totalPrice,
  status,
  triggerLabel,
  triggerClassName,
  triggerSize = "sm",
  iconOnly = false,
}: QuotationShareMenuProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [sent, setSent] = useState(status === "sent");

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/quotations/${quotationId}`, { status: "sent" });
      return res.json();
    },
    onSuccess: () => {
      setSent(true);
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotations", String(quotationId)] });
      toast({ title: t("تم إرسال العرض للعميل بنجاح", "Quotation sent to customer successfully") });
    },
    onError: () => {
      toast({
        title: t("حدث خطأ أثناء الإرسال", "Error sending quotation"),
        variant: "destructive",
      });
    },
  });

  const handleViewQuotation = () => {
    window.location.href = `/quotations/${quotationId}`;
  };

  const handleSendToCustomer = () => {
    if (sent) {
      toast({
        title: t("تم إرسال العرض مسبقاً للعميل", "Quotation already sent to customer"),
      });
      return;
    }
    sendMutation.mutate();
  };

  const handleWhatsApp = () => {
    const phone = customerPhone?.replace(/\D/g, "") || "";
    const waPhone = phone.startsWith("966") ? phone : phone.startsWith("0") ? `966${phone.slice(1)}` : `966${phone}`;
    const portalUrl = `${window.location.origin}/portal`;
    const total = typeof totalPrice === "number"
      ? totalPrice.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : parseFloat(String(totalPrice || "0")).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const name = customerName || t("العميل الكريم", "Valued Customer");
    const num = quotationNumber || quotationId;
    const msg = `السلام عليكم ${name}، نود إحاطتكم بأن عرض السعر رقم #${num} بإجمالي ${total} ر.س قد تم إعداده. يمكنكم مراجعته من البوابة الإلكترونية: ${portalUrl}`;
    const url = `https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  };

  const handleDownloadPDF = () => {
    const url = `/quotations/${quotationId}/view?print=1`;
    window.open(url, "_blank");
  };

  const handleEmail = () => {
    const email = customerEmail || "";
    const num = quotationNumber || quotationId;
    const total = typeof totalPrice === "number"
      ? totalPrice.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : parseFloat(String(totalPrice || "0")).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const name = customerName || t("العميل الكريم", "Valued Customer");
    const portalUrl = `${window.location.origin}/portal`;
    const subject = encodeURIComponent(`عرض السعر رقم #${num}`);
    const body = encodeURIComponent(
      `السلام عليكم ${name}،\n\nنود إحاطتكم بأن عرض السعر رقم #${num} بإجمالي ${total} ر.س قد تم إعداده.\n\nيمكنكم مراجعته من البوابة الإلكترونية:\n${portalUrl}\n\nمع تحيات فريق تيك.`
    );
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size={triggerSize}
          variant="default"
          className={triggerClassName}
          data-testid="btn-share-quotation"
        >
          <Share2 className={iconOnly ? "w-4 h-4" : "w-4 h-4 me-1.5"} />
          {!iconOnly && (triggerLabel || t("مشاركة", "Share"))}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" data-testid="share-dropdown-menu">
        <DropdownMenuItem onClick={handleViewQuotation} data-testid="share-option-view">
          <Eye className="w-4 h-4 me-2" />
          {t("عرض عرض السعر", "View Quotation")}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={handleSendToCustomer}
          disabled={sendMutation.isPending}
          data-testid="share-option-portal"
        >
          {sendMutation.isPending ? (
            <Loader2 className="w-4 h-4 me-2 animate-spin" />
          ) : sent ? (
            <Check className="w-4 h-4 me-2 text-green-600" />
          ) : (
            <Send className="w-4 h-4 me-2" />
          )}
          {sent
            ? t("تم الإرسال للبوابة ✓", "Already Sent to Portal ✓")
            : t("إرسال للعميل (البوابة)", "Send to Customer (Portal)")}
        </DropdownMenuItem>

        <DropdownMenuItem onClick={handleWhatsApp} data-testid="share-option-whatsapp">
          <MessageCircle className="w-4 h-4 me-2 text-green-600" />
          {t("مشاركة عبر واتساب", "Share via WhatsApp")}
        </DropdownMenuItem>

        <DropdownMenuItem onClick={handleDownloadPDF} data-testid="share-option-pdf">
          <Download className="w-4 h-4 me-2 text-blue-600" />
          {t("تحميل PDF", "Download PDF")}
        </DropdownMenuItem>

        <DropdownMenuItem onClick={handleEmail} data-testid="share-option-email">
          <Mail className="w-4 h-4 me-2" />
          {t("إرسال بالبريد", "Send via Email")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
