import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Sun, Moon, Eye, EyeOff, Loader2 } from "lucide-react";
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
          onClick={toggleLang}
          data-testid="button-login-lang"
        >
          <span className="text-xs font-bold">{lang === "ar" ? "EN" : "ع"}</span>
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={toggleTheme}
          data-testid="button-login-theme"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-2">
          <img
            src={currentLogo}
            alt="Teak"
            className="w-20 h-20 mx-auto mb-4 object-contain"
            data-testid="img-login-logo"
          />
          <h1 className="text-2xl font-bold" data-testid="text-login-title">
            {t("تسجيل الدخول", "Sign In")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("أدخل بيانات حسابك للمتابعة", "Enter your credentials to continue")}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div
                className="p-3 rounded-md bg-destructive/10 text-destructive text-sm text-center"
                data-testid="text-login-error"
              >
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="username">
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
                data-testid="input-username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">
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
                  data-testid="input-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-0 end-0 h-full px-3"
                  onClick={() => setShowPassword(!showPassword)}
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={isLoggingIn}
              data-testid="button-login-submit"
            >
              {isLoggingIn ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t("دخول", "Sign In")
              )}
            </Button>
          </form>
          <div className="mt-6 text-center">
            <a
              href="/"
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
              data-testid="link-back-home"
            >
              {t("العودة للصفحة الرئيسية", "Back to Home")}
            </a>
          </div>
          <div className="mt-4 p-3 rounded-md bg-muted/50 text-xs text-muted-foreground text-center">
            {t("للتجربة: اسم المستخدم: jabran - كلمة المرور: 123456", "Demo: Username: jabran - Password: 123456")}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
