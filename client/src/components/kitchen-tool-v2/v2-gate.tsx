/**
 * Kitchen Designer V2 — internal-phase access gate.
 * Allows only authenticated owner / it / designer roles.
 * Does not touch V1 routes or public landing behavior.
 */
import { type ReactNode } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";

const ALLOWED_ROLES = ["owner", "it", "designer"];

export function V2Gate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const { t, lang } = useLanguage();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        {t("جارٍ التحميل...", "Loading...")}
      </div>
    );
  }

  if (!user || !ALLOWED_ROLES.includes(user.role)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center" dir={lang === "ar" ? "rtl" : "ltr"}>
        <h1 className="text-xl font-bold" data-testid="text-v2-gate-denied">
          {t("هذه النسخة التجريبية متاحة للفريق الداخلي فقط", "This experimental version is available to the internal team only")}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t("سجّل الدخول بحساب مصرّح (مالك، تقنية معلومات، أو مصمم) للوصول.", "Sign in with an authorized account (owner, IT, or designer) to access.")}
        </p>
        <div className="flex gap-3">
          <Link href="/employee-login">
            <Button data-testid="button-v2-gate-login">{t("تسجيل الدخول", "Sign in")}</Button>
          </Link>
          <Link href="/">
            <Button variant="outline" data-testid="button-v2-gate-home">{t("الرئيسية", "Home")}</Button>
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
