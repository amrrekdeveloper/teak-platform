import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, User, Phone, Mail, Shield, Lock, Save, Eye, EyeOff } from "lucide-react";

const roleLabels: Record<string, { ar: string; en: string; color: string }> = {
  owner: { ar: "المالك", en: "Owner", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  assistant: { ar: "المساعد", en: "Assistant", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  sales: { ar: "المبيعات", en: "Sales", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  designer: { ar: "المصمم", en: "Designer", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  production: { ar: "الإنتاج", en: "Production", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  purchasing: { ar: "المشتريات", en: "Purchasing", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  warehouse: { ar: "المستودع", en: "Warehouse", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  accountant: { ar: "المحاسبة", en: "Accounting", color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" },
  customer_service: { ar: "خدمة العملاء", en: "Customer Service", color: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400" },
  delivery: { ar: "التوصيل", en: "Delivery", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
  installation: { ar: "التركيب", en: "Installation", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400" },
  quality: { ar: "الجودة", en: "Quality", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  hr: { ar: "الموارد البشرية", en: "HR", color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" },
  it: { ar: "تقنية المعلومات", en: "IT", color: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400" },
};

export default function MyProfilePage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();

  const [fullNameAr, setFullNameAr] = useState("");
  const [fullNameEn, setFullNameEn] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (user && !initialized) {
      setFullNameAr(user.fullNameAr || "");
      setFullNameEn(user.fullNameEn || "");
      setPhone(user.phone || "");
      setEmail(user.email || "");
      setInitialized(true);
    }
  }, [user, initialized]);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const profileMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", "/api/users/profile/me", data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: t("تم حفظ البيانات بنجاح", "Profile updated successfully") });
    },
    onError: async (err: any) => {
      try {
        const r = await err.json?.();
        toast({ title: r?.message || t("حدث خطأ", "Error"), variant: "destructive" });
      } catch {
        toast({ title: t("حدث خطأ", "Error"), variant: "destructive" });
      }
    },
  });

  const passwordMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", "/api/users/profile/me", data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: t("تم تغيير كلمة المرور بنجاح", "Password changed successfully") });
    },
    onError: async (err: any) => {
      try {
        const r = await err.json?.();
        toast({ title: r?.message || t("حدث خطأ", "Error"), variant: "destructive" });
      } catch {
        toast({ title: t("حدث خطأ", "Error"), variant: "destructive" });
      }
    },
  });

  const handleSaveProfile = () => {
    profileMutation.mutate({ fullNameAr, fullNameEn, phone, email });
  };

  const handleChangePassword = () => {
    if (newPassword !== confirmPassword) {
      toast({ title: t("كلمة المرور الجديدة غير متطابقة", "Passwords do not match"), variant: "destructive" });
      return;
    }
    if (newPassword.length < 4) {
      toast({ title: t("كلمة المرور قصيرة جداً", "Password too short"), variant: "destructive" });
      return;
    }
    passwordMutation.mutate({ currentPassword, newPassword });
  };

  if (!user) return null;

  const roleInfo = roleLabels[user.role] || { ar: user.role, en: user.role, color: "bg-muted text-muted-foreground" };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold" data-testid="text-profile-title">
        {t("الملف الشخصي", "My Profile")}
      </h1>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold" data-testid="text-profile-name">
                {t(user.fullNameAr, user.fullNameEn)}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-muted-foreground font-mono">@{user.username}</span>
                <Badge className={`text-xs ${roleInfo.color}`} data-testid="badge-profile-role">
                  {t(roleInfo.ar, roleInfo.en)}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="w-5 h-5" />
            {t("البيانات الشخصية", "Personal Information")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t("الاسم بالعربي", "Name (Arabic)")}</Label>
              <Input value={fullNameAr} onChange={e => setFullNameAr(e.target.value)} data-testid="input-profile-name-ar" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("الاسم بالإنجليزي", "Name (English)")}</Label>
              <Input value={fullNameEn} onChange={e => setFullNameEn(e.target.value)} data-testid="input-profile-name-en" />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{t("رقم الجوال", "Phone")}</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} data-testid="input-profile-phone" />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{t("البريد الإلكتروني", "Email")}</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} data-testid="input-profile-email" />
            </div>
          </div>
          <Button onClick={handleSaveProfile} disabled={profileMutation.isPending} data-testid="button-save-profile">
            {profileMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <Save className="w-4 h-4 me-2" />}
            {t("حفظ التعديلات", "Save Changes")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lock className="w-5 h-5" />
            {t("تغيير كلمة المرور", "Change Password")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("كلمة المرور الحالية", "Current Password")}</Label>
            <div className="relative">
              <Input type={showCurrent ? "text" : "password"} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                className="pe-10" data-testid="input-current-password" />
              <button type="button" className="absolute top-1/2 -translate-y-1/2 end-3 text-muted-foreground" onClick={() => setShowCurrent(!showCurrent)}>
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t("كلمة المرور الجديدة", "New Password")}</Label>
              <div className="relative">
                <Input type={showNew ? "text" : "password"} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  className="pe-10" data-testid="input-new-password" />
                <button type="button" className="absolute top-1/2 -translate-y-1/2 end-3 text-muted-foreground" onClick={() => setShowNew(!showNew)}>
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("تأكيد كلمة المرور", "Confirm Password")}</Label>
              <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                data-testid="input-confirm-password" />
            </div>
          </div>
          {newPassword && confirmPassword && newPassword !== confirmPassword && (
            <p className="text-sm text-destructive">{t("كلمة المرور غير متطابقة", "Passwords do not match")}</p>
          )}
          <Button onClick={handleChangePassword}
            disabled={!currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword || passwordMutation.isPending}
            data-testid="button-change-password">
            {passwordMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <Lock className="w-4 h-4 me-2" />}
            {t("تغيير كلمة المرور", "Change Password")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
