import { useState } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Eye, EyeOff, Loader2, Lock } from "lucide-react";
import teakLogo from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";

export default function SystemAdminLogin() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/login", {
        username: "jabran",
        password,
      });
      navigate("/dashboard");
    } catch {
      toast({
        title: "كلمة المرور غير صحيحة",
        description: "يرجى التحقق من كلمة المرور والمحاولة مجدداً",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"
      dir="rtl"
    >
      <div className="w-full max-w-md px-6">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-8 space-y-8">
          {/* Header */}
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="relative">
                <div className="w-20 h-20 rounded-2xl bg-white/10 flex items-center justify-center shadow-lg border border-white/20">
                  <img
                    src={teakLogo}
                    alt="Teak"
                    className="w-12 h-12 object-contain"
                  />
                </div>
                <div className="absolute -bottom-1 -left-1 w-7 h-7 bg-amber-500 rounded-full flex items-center justify-center shadow-md">
                  <Shield className="w-4 h-4 text-white" />
                </div>
              </div>
            </div>
            <div>
              <p className="text-slate-400 text-sm tracking-widest uppercase mb-1">
                لوحة تحكم النظام
              </p>
              <h1 className="text-2xl font-bold text-white">
                م. جبران الشهراني
              </h1>
              <p className="text-amber-400 text-sm font-medium mt-1">
                مالك النظام · Super Admin
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10" />
            <Lock className="w-4 h-4 text-slate-500" />
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            {/* Username display — read-only */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 block">
                اسم المستخدم
              </label>
              <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white/70 text-sm select-none">
                jabran
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 block">
                كلمة المرور
              </label>
              <div className="relative">
                <Input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور"
                  autoFocus
                  required
                  data-testid="input-admin-password"
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 rounded-xl h-12 pr-4 pl-12 focus-visible:ring-amber-500/50 focus-visible:border-amber-500/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPwd ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || !password.trim()}
              data-testid="btn-admin-login"
              className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-xl text-base shadow-lg shadow-amber-500/20 transition-all duration-200 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Shield className="w-5 h-5 ml-2" />
                  دخول لوحة التحكم
                </>
              )}
            </Button>
          </form>

          {/* Footer note */}
          <p className="text-center text-xs text-slate-600">
            هذه الصفحة مخصصة لمدير النظام فقط
          </p>
        </div>

        {/* Back to site */}
        <div className="text-center mt-6">
          <a
            href="/"
            className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
          >
            العودة للموقع
          </a>
        </div>
      </div>
    </div>
  );
}
