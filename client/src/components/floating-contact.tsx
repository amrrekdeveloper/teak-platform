import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Phone, MessageCircle } from "lucide-react";
import { useLanguage } from "@/components/language-provider";

const CONTACTS = [
  {
    nameAr: "مهند",
    nameEn: "Mohannad",
    phone: "0557753491",
    wa: "966557753491",
    color: "#25D366",
  },
  {
    nameAr: "هادي",
    nameEn: "Hadi",
    phone: "0553053995",
    wa: "966553053995",
    color: "#25D366",
  },
  {
    nameAr: "تيك",
    nameEn: "Teak",
    phone: "0542662889",
    wa: "966542662889",
    color: "#25D366",
  },
];

function WhatsAppIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export default function FloatingContact() {
  const { isRTL, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setPulse(false), 8000);
    return () => clearTimeout(timer);
  }, []);

  const side = isRTL ? "right" : "left";
  const panelFrom = isRTL ? { x: 120 } : { x: -120 };
  const panelTo = { x: 0 };

  return (
    <>
      <div
        className="fixed z-[999]"
        style={{
          top: "50%",
          transform: "translateY(-50%)",
          [side]: 0,
        }}
      >
        <motion.button
          onClick={() => setOpen(true)}
          data-testid="button-floating-contact"
          className="relative flex flex-col items-center justify-center gap-1.5 cursor-pointer select-none focus:outline-none"
          style={{
            width: 44,
            paddingTop: 16,
            paddingBottom: 16,
            background: "linear-gradient(160deg, #1a6b3c 0%, #25D366 60%, #1a6b3c 100%)",
            borderRadius: isRTL ? "12px 0 0 12px" : "0 12px 12px 0",
            boxShadow: "0 4px 24px rgba(37,211,102,0.4), 0 2px 8px rgba(0,0,0,0.3)",
            color: "white",
          }}
          initial={{ x: isRTL ? 10 : -10 }}
          animate={{
            x: isRTL
              ? [10, 0, 10]
              : [-10, 0, -10],
            boxShadow: pulse
              ? [
                  "0 4px 24px rgba(37,211,102,0.4), 0 2px 8px rgba(0,0,0,0.3)",
                  "0 4px 32px rgba(37,211,102,0.75), 0 2px 12px rgba(0,0,0,0.4)",
                  "0 4px 24px rgba(37,211,102,0.4), 0 2px 8px rgba(0,0,0,0.3)",
                ]
              : "0 4px 24px rgba(37,211,102,0.4), 0 2px 8px rgba(0,0,0,0.3)",
          }}
          transition={{
            x: { duration: 2.5, repeat: Infinity, ease: "easeInOut" },
            boxShadow: { duration: 1.6, repeat: Infinity, ease: "easeInOut" },
          }}
          whileHover={{ x: isRTL ? -4 : 4, transition: { duration: 0.2 } }}
        >
          {pulse && (
            <motion.span
              className="absolute inset-0 rounded-[inherit]"
              style={{ background: "rgba(37,211,102,0.35)" }}
              animate={{ scale: [1, 1.4, 1.4], opacity: [0.6, 0, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
            />
          )}

          <WhatsAppIcon size={20} />

          <span
            className="text-white font-bold"
            style={{
              fontSize: 10,
              writingMode: "vertical-rl",
              textOrientation: "mixed",
              transform: isRTL ? "rotate(180deg)" : "none",
              letterSpacing: "0.04em",
              lineHeight: 1.2,
            }}
          >
            {t("تواصل", "Contact")}
          </span>
        </motion.button>
      </div>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-[1000]"
              style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />

            <motion.div
              className="fixed z-[1001] flex flex-col"
              style={{
                top: "50%",
                [side]: 0,
                transform: "translateY(-50%)",
                width: "min(340px, 92vw)",
                maxHeight: "90vh",
                background: "linear-gradient(145deg, #0f1a14 0%, #162214 50%, #0d1f11 100%)",
                borderRadius: isRTL ? "20px 0 0 20px" : "0 20px 20px 0",
                boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 4px 20px rgba(37,211,102,0.15)",
                overflow: "hidden",
                border: isRTL
                  ? "1px solid rgba(37,211,102,0.2)"
                  : "1px solid rgba(37,211,102,0.2)",
                borderRight: isRTL ? "none" : "1px solid rgba(37,211,102,0.2)",
                borderLeft: isRTL ? "1px solid rgba(37,211,102,0.2)" : "none",
              }}
              initial={{ ...panelFrom, opacity: 0 }}
              animate={{ ...panelTo, opacity: 1 }}
              exit={{ ...panelFrom, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
            >
              <div
                className="relative flex items-center justify-between px-5 py-4"
                style={{
                  background: "linear-gradient(135deg, #1a6b3c 0%, #25D366 100%)",
                  flexDirection: isRTL ? "row" : "row-reverse",
                }}
              >
                <div className="flex items-center gap-2.5" style={{ flexDirection: isRTL ? "row" : "row-reverse" }}>
                  <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                    <WhatsAppIcon size={20} />
                  </div>
                  <div style={{ textAlign: isRTL ? "right" : "left" }}>
                    <p className="text-white font-bold text-sm leading-tight">
                      {t("تواصل معنا", "Contact Us")}
                    </p>
                    <p className="text-white/70 text-xs">
                      {t("نرد فوراً", "We respond immediately")}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  data-testid="button-close-contact"
                  className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/30 flex items-center justify-center transition-colors"
                >
                  <X size={16} className="text-white" />
                </button>
              </div>

              <div className="p-4 flex flex-col gap-3 overflow-y-auto">
                {CONTACTS.map((c, i) => (
                  <motion.div
                    key={c.nameAr}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 + i * 0.07, duration: 0.3 }}
                    className="rounded-2xl overflow-hidden"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <div
                      className="flex items-center gap-3 px-4 py-3"
                      style={{ flexDirection: isRTL ? "row" : "row-reverse" }}
                    >
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-base flex-shrink-0"
                        style={{ background: "linear-gradient(135deg, #1a6b3c, #25D366)" }}
                      >
                        {t(c.nameAr[0], c.nameEn[0])}
                      </div>
                      <div className="flex-1 min-w-0" style={{ textAlign: isRTL ? "right" : "left" }}>
                        <p className="text-white font-semibold text-sm">{t(c.nameAr, c.nameEn)}</p>
                        <p className="text-white/50 text-xs font-mono mt-0.5" dir="ltr">{c.phone}</p>
                      </div>
                    </div>

                    <div
                      className="flex gap-2 px-4 pb-3"
                      style={{ flexDirection: isRTL ? "row" : "row-reverse" }}
                    >
                      <a
                        href={`https://wa.me/${c.wa}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid={`link-whatsapp-${c.nameAr}`}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl font-semibold text-xs transition-all hover:opacity-90 active:scale-95"
                        style={{
                          background: "linear-gradient(135deg, #1a6b3c, #25D366)",
                          color: "white",
                          flexDirection: isRTL ? "row" : "row-reverse",
                        }}
                      >
                        <WhatsAppIcon size={14} />
                        {t("واتساب", "WhatsApp")}
                      </a>
                      <a
                        href={`tel:${c.phone}`}
                        data-testid={`link-call-${c.nameAr}`}
                        className="flex items-center justify-center w-10 h-8 rounded-xl transition-all hover:opacity-90 active:scale-95"
                        style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}
                      >
                        <Phone size={14} />
                      </a>
                    </div>
                  </motion.div>
                ))}

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="rounded-2xl px-4 py-3 flex items-center gap-2.5"
                  style={{
                    background: "rgba(37,211,102,0.06)",
                    border: "1px solid rgba(37,211,102,0.15)",
                    flexDirection: isRTL ? "row" : "row-reverse",
                  }}
                >
                  <MessageCircle size={15} className="flex-shrink-0" style={{ color: "#25D366" }} />
                  <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)", textAlign: isRTL ? "right" : "left" }}>
                    {t(
                      "أوقات الدوام: السبت – الخميس، ٨ص – ٦م",
                      "Working hours: Sat – Thu, 8am – 6pm"
                    )}
                  </p>
                </motion.div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
