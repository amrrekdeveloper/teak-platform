import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLanguage, LanguageToggle } from "@/components/language-provider";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, Loader2 } from "lucide-react";

export default function WarehouseLogin() {
  const { t, isRTL } = useLanguage();
  const [remember, setRemember] = useState(false);
  const login = useMutation({
    mutationFn: async (data: { username: string; password: string; rememberMe: boolean }) =>
      (await apiRequest("POST", "/api/warehouse-access/login", data)).json(),
    onSuccess: user => { queryClient.setQueryData(["/api/auth/me"], user); window.location.replace("/dashboard/warehouses"); },
  });
  return <main dir={isRTL ? "rtl" : "ltr"} className="min-h-dvh bg-background px-4 py-8 text-foreground">
    <div className="mx-auto flex max-w-md justify-end"><LanguageToggle /></div>
    <section className="mx-auto mt-8 max-w-md rounded-2xl border bg-card p-6 shadow-sm">
      <Package className="mb-5 h-10 w-10 text-primary" />
      <p className="text-sm font-medium text-primary">TEAK</p>
      <h1 className="mt-1 text-2xl font-bold">{t("دخول المستودعات والمشتريات", "Warehouses & purchasing sign-in")}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("استخدم حساب العمل المخوّل لك. هذه المساحة مستقلة عن حسابات الموظفين والموارد البشرية.", "Use your authorized work account. This workspace is separate from employee and HR access.")}</p>
      <form className="mt-6 space-y-5" onSubmit={event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        login.mutate({ username: String(data.get("username") || "").trim(), password: String(data.get("password") || ""), rememberMe: remember });
      }}>
        <div className="space-y-2"><Label htmlFor="warehouse-username">{t("اسم المستخدم", "Username")}</Label>
          <Input id="warehouse-username" name="username" autoComplete="username" required dir="ltr" maxLength={100} className="h-12" /></div>
        <div className="space-y-2"><Label htmlFor="warehouse-password">{t("كلمة المرور", "Password")}</Label>
          <Input id="warehouse-password" name="password" type="password" autoComplete="current-password" required maxLength={256} dir="ltr" className="h-12" /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} />{t("تذكرني على هذا الجهاز الخاص", "Remember me on this private device")}</label>
        {login.error && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{login.error.message}</p>}
        <Button className="h-12 w-full" type="submit" disabled={login.isPending}>{login.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}{t("دخول", "Sign in")}</Button>
      </form>
    </section>
  </main>;
}
