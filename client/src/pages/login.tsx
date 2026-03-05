import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sun, Moon, Eye, EyeOff, Loader2, Lock } from "lucide-react";
import logoEN from "@assets/logo_teak2_1772689894105.png";
import logoAR from "@assets/logo_teak1_1772689915503.png";

export default function LoginPage() {
  const { lang, toggleLang, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { login, isLoggingIn } = useAuth();
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const currentLogo = lang === "ar" ? logoAR : logoEN;

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
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
        <div className="text-center mb-8">
          <img
            src={currentLogo}
            alt="Teak"
            className="w-24 h-24 mx-auto mb-6 object-contain"
            data-testid="img-login-logo"
          />
          <h1 className="text-2xl font-bold mb-1" data-testid="text-login-title">
            {t("تسجيل الدخول", "Sign In")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("لوحة تحكم تيك للتصنيع", "Teak Manufacturing Dashboard")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
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

        <div className="mt-8 text-center">
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
