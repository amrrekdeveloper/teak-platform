import { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";
import { DirectionProvider } from "@radix-ui/react-direction";
import { Languages } from "lucide-react";

type Language = "ar" | "en";

interface LanguageContextType {
  lang: Language;
  toggleLang: () => void;
  t: (ar: string, en: string) => string;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: "ar",
  toggleLang: () => {},
  t: (ar) => ar,
  isRTL: true,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Language>(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem("teak-lang") === "en" ? "en" : "ar";
      } catch { return "ar"; }
    }
    return "ar";
  });

  const isRTL = lang === "ar";

  useLayoutEffect(() => {
    document.documentElement.setAttribute("dir", isRTL ? "rtl" : "ltr");
    document.documentElement.setAttribute("lang", lang);
  }, [lang, isRTL]);

  useEffect(() => {
    try { localStorage.setItem("teak-lang", lang); } catch { /* Storage may be disabled. */ }
  }, [lang]);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === "teak-lang") setLang(event.newValue === "en" ? "en" : "ar");
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const toggleLang = () => setLang((prev) => (prev === "ar" ? "en" : "ar"));
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);

  const dir = isRTL ? "rtl" : "ltr";

  return (
    <DirectionProvider dir={dir}>
      <LanguageContext.Provider value={{ lang, toggleLang, t, isRTL }}>
        {children}
        <LanguageFallback />
      </LanguageContext.Provider>
    </DirectionProvider>
  );
}

export const useLanguage = () => useContext(LanguageContext);

/** Shared control: language names, not country flags. */
export function LanguageToggle({ testId = "button-language-toggle" }: { testId?: string }) {
  const { lang, toggleLang, t } = useLanguage();
  return (
    <button
      type="button"
      onClick={toggleLang}
      data-teak-language-control
      data-testid={testId}
      aria-label={t("Switch to English — التبديل إلى الإنجليزية", "التبديل إلى العربية — Switch to Arabic")}
      title={t("التبديل إلى الإنجليزية", "Switch to Arabic")}
      className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-bold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring print:hidden"
    >
      <Languages className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span lang={lang === "ar" ? "en" : "ar"} dir={lang === "ar" ? "ltr" : "rtl"}>
        {lang === "ar" ? "English" : "العربية"}
      </span>
    </button>
  );
}

/** Read-only DOM discovery: cover standalone React routes without duplicating header controls. */
function LanguageFallback() {
  const [needed, setNeeded] = useState(false);
  useEffect(() => {
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setNeeded(!document.querySelector("[data-teak-language-control]:not([data-language-fallback] *)"));
      });
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);
  if (!needed) return null;
  return (
    <div data-language-fallback className="fixed z-40 print:hidden" style={{ insetInlineEnd: 16, insetBlockEnd: 88 }}>
      <LanguageToggle testId="button-global-language" />
    </div>
  );
}
