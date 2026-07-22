import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, Eye, EyeOff, ChevronRight, ShieldCheck, AlertTriangle, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";

export default function FinanceSettingsPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();

  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/finance-reset", { confirm: resetConfirmText.trim() });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: t("تم تصفير البيانات المالية بنجاح", "Financial data reset successfully"),
        description: t("تم الاحتفاظ بنسخة احتياطية من جميع البيانات المحذوفة", "A backup of all deleted data was kept"),
      });
      setResetOpen(false);
      setResetConfirmText("");
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => {
      let message = t("حدث خطأ أثناء التصفير", "An error occurred during reset");
      try {
        const parsed = JSON.parse(e.message.replace(/^\d+:\s*/, ""));
        if (parsed.message) message = parsed.message;
      } catch {}
      toast({ title: message, variant: "destructive" });
    },
  });

  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const changePinMutation = useMutation({
    mutationFn: (data: { currentPin: string; newPin: string }) =>
      apiRequest("PATCH", "/api/finance-auth/change-pin", data),
    onSuccess: () => {
      toast({
        title: t("تم تغيير كلمة المرور بنجاح", "PIN changed successfully"),
        description: t("يمكنك الآن استخدام كلمة المرور الجديدة عند تسجيل الدخول", "You can now use the new PIN to log in"),
      });
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
    },
    onError: (e: Error) => {
      let message = t("حدث خطأ أثناء تغيير كلمة المرور", "An error occurred while changing the PIN");
      try {
        const body = e.message.replace(/^\d+:\s*/, "");
        const parsed = JSON.parse(body);
        if (parsed.message) message = parsed.message;
      } catch {}
      toast({ title: message, variant: "destructive" });
    },
  });

  const pinMismatch = newPin.length > 0 && confirmPin.length > 0 && newPin !== confirmPin;
  const pinTooShort = newPin.length > 0 && newPin.length < 4;
  const isValid =
    currentPin.length >= 4 &&
    newPin.length >= 4 &&
    confirmPin.length >= 4 &&
    newPin === confirmPin;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    changePinMutation.mutate({ currentPin, newPin });
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-lg" dir="rtl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/finance">
          <span className="hover:text-foreground cursor-pointer transition-colors" data-testid="link-finance-dashboard">
            {t("لوحة التحكم المالية", "Finance Dashboard")}
          </span>
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground font-medium">{t("الإعدادات", "Settings")}</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold">{t("إعدادات الحساب", "Account Settings")}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t("إدارة إعدادات الدخول السريع", "Manage your quick login settings")}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            {t("تغيير كلمة مرور الدخول السريع", "Change Quick Login PIN")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="current-pin" className="text-sm">
                {t("كلمة المرور الحالية", "Current PIN")}
              </Label>
              <div className="relative">
                <Input
                  id="current-pin"
                  type={showCurrent ? "text" : "password"}
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value)}
                  placeholder={t("أدخل كلمة المرور الحالية", "Enter current PIN")}
                  className="font-mono pe-10"
                  data-testid="input-current-pin"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute inset-y-0 end-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="btn-toggle-current-pin"
                  tabIndex={-1}
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-pin" className="text-sm">
                {t("كلمة المرور الجديدة", "New PIN")}
              </Label>
              <div className="relative">
                <Input
                  id="new-pin"
                  type={showNew ? "text" : "password"}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder={t("أدخل كلمة المرور الجديدة (4 أحرف على الأقل)", "Enter new PIN (min 4 characters)")}
                  className="font-mono pe-10"
                  data-testid="input-new-pin"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute inset-y-0 end-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="btn-toggle-new-pin"
                  tabIndex={-1}
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {pinTooShort && (
                <p className="text-xs text-amber-600" data-testid="text-pin-too-short">
                  {t("كلمة المرور يجب أن تكون 4 أحرف على الأقل", "PIN must be at least 4 characters")}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-pin" className="text-sm">
                {t("تأكيد كلمة المرور الجديدة", "Confirm New PIN")}
              </Label>
              <div className="relative">
                <Input
                  id="confirm-pin"
                  type={showConfirm ? "text" : "password"}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  placeholder={t("أعد إدخال كلمة المرور الجديدة", "Re-enter new PIN")}
                  className="font-mono pe-10"
                  data-testid="input-confirm-pin"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute inset-y-0 end-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="btn-toggle-confirm-pin"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {pinMismatch && (
                <p className="text-xs text-destructive" data-testid="text-pin-mismatch">
                  {t("كلمتا المرور غير متطابقتين", "PINs do not match")}
                </p>
              )}
            </div>

            <div className="pt-2 flex gap-3">
              <Button
                type="submit"
                disabled={!isValid || changePinMutation.isPending}
                className="flex items-center gap-2"
                data-testid="btn-submit-change-pin"
              >
                <ShieldCheck className="h-4 w-4" />
                {changePinMutation.isPending
                  ? t("جاري الحفظ...", "Saving...")
                  : t("تغيير كلمة المرور", "Change PIN")}
              </Button>
              <Link href="/finance">
                <Button type="button" variant="outline" data-testid="btn-cancel-change-pin">
                  {t("إلغاء", "Cancel")}
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      {user?.role === "owner" && (
        <Card className="border-destructive/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {t("منطقة الخطر — تصفير البيانات المالية", "Danger Zone — Financial Data Reset")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t(
                "حذف جميع القيود المحاسبية والدفعات والفواتير وسجلات الرواتب والسلف، وحذف العقود بالكامل (تبقى أوامر العمل والسجلات المرتبطة لكن دون ارتباط بالعقد). يتم الاحتفاظ بدليل الحسابات، ويتم حفظ نسخة احتياطية من كل البيانات قبل الحذف.",
                "Deletes all journal entries, payments, invoices, payroll records and advances, and deletes all contracts entirely (work orders and related records remain but are unlinked). The chart of accounts is kept, and a backup of all data is saved before deletion."
              )}
            </p>
            <Button
              variant="destructive"
              onClick={() => setResetOpen(true)}
              className="flex items-center gap-2"
              data-testid="btn-open-finance-reset"
            >
              <Trash2 className="h-4 w-4" />
              {t("تصفير البيانات المالية", "Reset Financial Data")}
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={resetOpen} onOpenChange={(o) => { setResetOpen(o); if (!o) setResetConfirmText(""); }}>
        <DialogContent data-testid="dialog-finance-reset">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {t("تأكيد تصفير البيانات المالية", "Confirm Financial Data Reset")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "هذا الإجراء سيحذف جميع البيانات المالية والعقود نهائيًا (مع نسخة احتياطية). للمتابعة اكتب كلمة «تصفير» في الحقل أدناه.",
                "This will permanently delete all financial data and contracts (with a backup). To proceed, type the word «تصفير» below."
              )}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={resetConfirmText}
            onChange={(e) => setResetConfirmText(e.target.value)}
            placeholder={t("اكتب: تصفير", "Type: تصفير")}
            data-testid="input-finance-reset-confirm"
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setResetOpen(false)} data-testid="btn-cancel-finance-reset">
              {t("إلغاء", "Cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={resetConfirmText.trim() !== "تصفير" || resetMutation.isPending}
              onClick={() => resetMutation.mutate()}
              data-testid="btn-confirm-finance-reset"
            >
              {resetMutation.isPending
                ? t("جاري التصفير...", "Resetting...")
                : t("تصفير نهائي", "Reset Permanently")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
