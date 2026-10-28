import { useEffect, useMemo, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { BookOpenText, ChevronLeft, CircleHelp, ExternalLink, Search, X } from "lucide-react";
import { useLocation } from "wouter";
import { useLanguage } from "@/components/language-provider";
import { canShowHrHelpLink, filterHrHelpSections, type HrHelpIdentity } from "@/components/hr-help-content";
import "@/styles/hr-help.css";

type HrHelpProps = {
  user: HrHelpIdentity | null;
  menuOpen: boolean;
};

export default function HrHelp({ user, menuOpen }: HrHelpProps) {
  const { t, isRTL } = useLanguage();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [otherDialogOpen, setOtherDialogOpen] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);
  const [noSafePosition, setNoSafePosition] = useState(false);
  const sections = useMemo(() => filterHrHelpSections(query), [query]);
  const authorized = user?.role === "hr" && user?.maintenanceScope === "hr";

  useEffect(() => {
    if (!authorized) return;
    const checkDialogs = () => {
      setOtherDialogOpen(!!document.querySelector('[role="dialog"][data-state="open"]:not([data-hr-help-dialog]),[role="alertdialog"][data-state="open"]'));
    };
    const observer = new MutationObserver(checkDialogs);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state", "role"] });
    checkDialogs();
    return () => observer.disconnect();
  }, [authorized]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    if (menuOpen || otherDialogOpen) setOpen(false);
  }, [menuOpen, otherDialogOpen]);

  // End-of-page padding protects final rows. Avoid covering controls elsewhere
  // too, especially short/keyboard-sized viewports, without changing HR scrolling.
  useEffect(() => {
    if (!authorized || open || menuOpen || otherDialogOpen) return;
    let frame = 0;
    const place = () => {
      frame = 0;
      const dock = dockRef.current;
      if (!dock || dock.contains(document.activeElement)) return;
      dock.style.setProperty("--hr-help-lift", "0px");
      const box = dock.getBoundingClientRect();
      const controls = Array.from(document.querySelectorAll<HTMLElement>(
        "button,input,select,textarea,a[href],[role=combobox],[role=button]",
      )).filter(element => !dock.contains(element)).map(element => element.getBoundingClientRect())
        .filter(rect => rect.width > 0 && rect.height > 0);
      const lift = [0, 56, 112, 168].find(offset =>
        box.top - offset >= 64 && !controls.some(rect =>
          box.left < rect.right + 4 && box.right > rect.left - 4 &&
          box.top - offset < rect.bottom + 4 && box.bottom - offset > rect.top - 4,
        ));
      // A screen filled with controls has no safe floating slot; scrolling
      // restores the icon as soon as a slot is available.
      setNoSafePosition(lift === undefined);
      dock.style.setProperty("--hr-help-lift", `${lift ?? 0}px`);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(place); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { subtree: true, childList: true });
    document.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    schedule();
    return () => {
      observer.disconnect();
      document.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, [authorized, open, menuOpen, otherDialogOpen]);

  // Mobile keyboards can shrink visualViewport without changing CSS dvh.
  useEffect(() => {
    if (!open || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const update = () => {
      const dialog = document.querySelector<HTMLElement>("[data-hr-help-dialog]");
      dialog?.style.setProperty("--hr-help-visible-height", `${viewport.height}px`);
      dialog?.style.setProperty("--hr-help-keyboard-inset", `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [open]);

  if (!authorized) return null;

  const suppressTrigger = menuOpen || otherDialogOpen || (noSafePosition && !open);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <div ref={dockRef} className="hr-help-dock" dir={isRTL ? "rtl" : "ltr"}>
        <DialogPrimitive.Trigger asChild>
          <button
            type="button"
            className={`hr-help-trigger${suppressTrigger ? " is-suppressed" : ""}`}
            aria-label={t("فتح دليل الموارد البشرية", "Open HR help guide")}
            aria-hidden={suppressTrigger || undefined}
            tabIndex={suppressTrigger ? -1 : 0}
            disabled={suppressTrigger}
            data-testid="hr-help-trigger"
          >
            <CircleHelp size={21} strokeWidth={1.9} aria-hidden="true" />
          </button>
        </DialogPrimitive.Trigger>
      </div>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="hr-help-overlay" />
        <DialogPrimitive.Content
          className="hr-help-dialog"
          dir={isRTL ? "rtl" : "ltr"}
          data-hr-help-dialog
          onOpenAutoFocus={event => {
            event.preventDefault();
            document.getElementById("hr-help-search")?.focus();
          }}
        >
          <header className="hr-help-heading">
            <span className="hr-help-mark"><BookOpenText size={20} aria-hidden="true" /></span>
            <div className="hr-help-heading-copy">
              <span className="hr-help-eyebrow">{t("مرجع داخلي", "INTERNAL REFERENCE")}</span>
              <DialogPrimitive.Title className="hr-help-title">{t("دليل مساحة HR", "HR workspace guide")}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="hr-help-subtitle">
                {t("إرشادات عملية للميزات والصلاحيات الظاهرة هنا.", "Practical notes on the features and permissions available here.")}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button type="button" className="hr-help-close" aria-label={t("إغلاق الدليل", "Close guide")}>
                <X size={18} aria-hidden="true" />
              </button>
            </DialogPrimitive.Close>
          </header>
          <div className="hr-help-search-wrap">
            <Search className="hr-help-search-icon" size={16} aria-hidden="true" />
            <label className="sr-only" htmlFor="hr-help-search">{t("ابحث في الدليل", "Search the guide")}</label>
            <input
              id="hr-help-search"
              className="hr-help-search"
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={t("ابحث: دوام، مرفق، راتب…", "Search: schedule, attachment, payroll…")}
              autoComplete="off"
            />
          </div>
          <div className="hr-help-scroll" aria-live="polite">
            {sections.length ? sections.map(section => {
              const availableLinks = section.links.filter(link => canShowHrHelpLink(user, link));
              return (
                <section className="hr-help-section" key={section.id}>
                  <h3>{t(section.titleAr, section.titleEn)}</h3>
                  <p>{t(section.bodyAr, section.bodyEn)}</p>
                  <ul>{(isRTL ? section.pointsAr : section.pointsEn).map((point, index) => <li key={index}>{point}</li>)}</ul>
                  {availableLinks.length > 0 && (
                    <nav className="hr-help-links" aria-label={t(`روابط ${section.titleAr}`, `${section.titleEn} links`)}>
                      {availableLinks.map(link => (
                        <button type="button" className="hr-help-link" key={link.href} onClick={() => { setOpen(false); setLocation(link.href); }}>
                          <span>{t(link.labelAr, link.labelEn)}</span>
                          {isRTL ? <ChevronLeft size={14} aria-hidden="true" /> : <ExternalLink size={13} aria-hidden="true" />}
                        </button>
                      ))}
                    </nav>
                  )}
                  {availableLinks.length !== section.links.length && (
                    <p className="hr-help-unavailable">{t("بعض الروابط غير متاحة وفق صلاحيات حسابك.", "Some links are unavailable under this account’s permissions.")}</p>
                  )}
                </section>
              );
            }) : (
              <div className="hr-help-empty" role="status">
                <strong>{t("لا توجد نتائج", "No results")}</strong>
                <p>{t("جرّب كلمة أخرى مثل «إجازة» أو «راتب».", "Try another term, such as “leave” or “payroll”.")}</p>
              </div>
            )}
          </div>
          <footer className="hr-help-footer">
            <span>{t("محتوى ثابت للمراجعة؛ لا ينفّذ الدليل أي تغييرات.", "Static reviewable guidance; this guide makes no changes.")}</span>
            <span>{t("عدم ظهور سجل قديم لا يثبت عدم وقوعه. توقف نظام الحضور لا يعني توقف خدمة الموظف أو خصمًا من راتبه.", "Missing history does not prove an event did not occur. Attendance system downtime is not termination of employee service or a payroll deduction.")}</span>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
