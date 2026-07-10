import { useEffect, useState } from "react";
import { Monitor, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/language-provider";

const QUERY = "(min-width: 1024px)";

export default function DesktopGate({ children }: { children: React.ReactNode }) {
  const { t } = useLanguage();
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia(QUERY).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  if (isDesktop) return <>{children}</>;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-6 text-center"
      data-testid="screen-desktop-gate"
    >
      <div className="relative mb-8">
        <div className="absolute inset-0 rounded-full bg-primary/10 blur-2xl scale-150" />
        <div className="relative w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
          <Monitor className="w-11 h-11 text-primary" />
        </div>
      </div>
      <h1 className="text-2xl sm:text-3xl font-bold mb-3" data-testid="text-gate-title">
        {t("أداة تيك لتصميم المطابخ", "Teak Kitchen Design Tool")}
      </h1>
      <p className="text-muted-foreground max-w-md leading-relaxed mb-2" data-testid="text-gate-message">
        {t(
          "صُممت هذه الأداة لتمنحك تجربة تصميم دقيقة ومريحة على شاشة الكمبيوتر.",
          "This tool is designed for a precise and comfortable design experience on desktop screens."
        )}
      </p>
      <p className="text-muted-foreground max-w-md leading-relaxed mb-8">
        {t(
          "يرجى فتح الأداة من جهاز كمبيوتر للاستمتاع بكامل الإمكانيات.",
          "Please open the tool from a desktop computer to enjoy the full experience."
        )}
      </p>
      <a href="/" data-testid="link-gate-home">
        <Button size="lg" className="font-bold min-w-[180px]">
          <Home className="w-4 h-4 me-2" />
          {t("العودة للرئيسية", "Back to Home")}
        </Button>
      </a>
    </div>
  );
}
