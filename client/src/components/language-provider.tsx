import { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";
import { DirectionProvider } from "@radix-ui/react-direction";

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
      return (localStorage.getItem("teak-lang") as Language) || "ar";
    }
    return "ar";
  });

  const isRTL = lang === "ar";

  useLayoutEffect(() => {
    document.documentElement.setAttribute("dir", isRTL ? "rtl" : "ltr");
    document.documentElement.setAttribute("lang", lang);
  }, [lang, isRTL]);

  useEffect(() => {
    localStorage.setItem("teak-lang", lang);
  }, [lang]);

  const toggleLang = () => setLang((prev) => (prev === "ar" ? "en" : "ar"));
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);

  const dir = isRTL ? "rtl" : "ltr";

  return (
    <DirectionProvider dir={dir}>
      <LanguageContext.Provider value={{ lang, toggleLang, t, isRTL }}>
        {children}
      </LanguageContext.Provider>
    </DirectionProvider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
