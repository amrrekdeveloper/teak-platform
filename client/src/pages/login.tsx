import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sun, Moon, Eye, EyeOff, Loader2, Lock, Copy, CheckCircle2 } from "lucide-react";
import teakLogo from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";

const demoAccounts = [
  { username: "admin", password: "123456", roleAr: "مدير النظام", roleEn: "System Admin" },
  { username: "k.asiri", password: "123456", roleAr: "المالك", roleEn: "Owner" },
  { username: "hadi", password: "123456", roleAr: "المبيعات", roleEn: "Sales" },
  { username: "mohsen", password: "123456", roleAr: "المصمم", roleEn: "Designer" },
  { username: "hamdi", password: "123456", roleAr: "الإنتاج", roleEn: "Production" },
  { username: "ismail", password: "123456", roleAr: "المحاسبة", roleEn: "Accounting" },
];

export default function LoginPage() {
  const { lang, toggleLang, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { login, isLoggingIn } = useAuth();
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login({ username, password });
      setLocation("/dashboard");
    } catch (err: any) {
      try {
        const errorData = JSON.parse(err.message.split(": ").slice(1).join(": "));
        setError(lang === "ar" ? errorData.message : errorData.messageEn);
      } catch {
        setError(t("حدث خطأ في تسجيل الدخول", "Login failed"));
      }
    }
  };

  const fillCredentials = (account: typeof demoAccounts[0], idx: number) => {
    setUsername(account.username);
    setPassword(account.password);
    setError("");
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="absolute top-4 end-4 flex items-center gap-2">
        <Button
          size="icon"
          variant="ghost"
          onClick={toggleTheme}
          className="rounded-full"
          data-testid="button-login-theme"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleLang}
          className="rounded-full text-xs font-bold"
          data-testid="button-login-lang"
        >
          {lang === "ar" ? "EN" : "عربي"}
        </Button>
      </div>

      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <img
            src={teakLogo}
            alt="Teak"
            className="w-20 h-20 mx-auto mb-4 object-contain logo-auto transition-all duration-300"
            data-testid="img-login-logo"
          />
          <h1 className="text-2xl font-bold mb-1" data-testid="text-login-title">
            {t("تسجيل الدخول", "Sign In")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("لوحة تحكم تيك للتصنيع", "Teak Manufacturing Dashboard")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm text-center"
              data-testid="text-login-error"
            >
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="username" className="text-xs font-medium text-muted-foreground">
              {t("اسم المستخدم", "Username")}
            </Label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t("أدخل اسم المستخدم", "Enter username")}
              required
              autoComplete="username"
              className="h-11"
              data-testid="input-username"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">
              {t("كلمة المرور", "Password")}
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("أدخل كلمة المرور", "Enter password")}
                required
                autoComplete="current-password"
                className="h-11 pe-11"
                data-testid="input-password"
              />
              <button
                type="button"
                className="absolute top-1/2 -translate-y-1/2 end-3 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                data-testid="button-toggle-password"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-11 text-sm font-semibold"
            disabled={isLoggingIn}
            data-testid="button-login-submit"
          >
            {isLoggingIn ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Lock className="w-4 h-4 me-2" />
                {t("دخول", "Sign In")}
              </>
            )}
          </Button>
        </form>

        <div className="mt-6 p-4 rounded-xl border border-dashed border-primary/30 bg-primary/5">
          <p className="text-xs font-semibold text-primary mb-3 text-center" data-testid="text-demo-title">
            {t("حسابات تجريبية — اضغط لنسخ البيانات", "Demo Accounts — Tap to auto-fill")}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {demoAccounts.map((account, idx) => (
              <button
                key={account.username}
                type="button"
                onClick={() => fillCredentials(account, idx)}
                className="flex items-center gap-2 p-2 rounded-lg border border-border/50 bg-background hover:bg-accent hover:border-primary/40 transition-all text-start group"
                data-testid={`button-demo-${account.username}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{account.username}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {lang === "ar" ? account.roleAr : account.roleEn}
                  </p>
                </div>
                <div className="shrink-0">
                  {copiedIdx === idx ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 text-center">
          <a
            href="/"
            className="text-xs text-muted-foreground hover:text-primary transition-colors"
            data-testid="link-back-home"
          >
            {t("العودة للصفحة الرئيسية", "Back to Home")}
          </a>
        </div>
      </div>
    </div>
  );
}
