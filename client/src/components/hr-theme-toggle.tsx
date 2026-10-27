import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useLanguage } from "@/components/language-provider";

type HrThemeToggleProps = { compact?: boolean };

export default function HrThemeToggle({ compact = false }: HrThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const { t } = useLanguage();
  const targetIsDark = theme === "light";
  const targetLabel = targetIsDark
    ? t("التبديل إلى الوضع الداكن", "Switch to dark mode")
    : t("التبديل إلى الوضع الفاتح", "Switch to light mode");

  return (
    <button
      type="button"
      className={`hr-theme-toggle${compact ? " is-compact" : ""}`}
      onClick={toggleTheme}
      aria-label={targetLabel}
      aria-pressed={theme === "dark"}
      title={targetLabel}
    >
      {targetIsDark ? <Moon size={17} aria-hidden="true" /> : <Sun size={17} aria-hidden="true" />}
      {!compact && <span>{targetIsDark ? t("داكن", "Dark") : t("فاتح", "Light")}</span>}
    </button>
  );
}
