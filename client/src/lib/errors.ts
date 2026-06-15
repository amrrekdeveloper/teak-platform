// Central translator: turns raw API/DB errors into clear, friendly Arabic messages.
// Backend messages that are already Arabic are trusted and passed through.

const TECHNICAL_PATTERNS: { test: (m: string) => boolean; ar: string }[] = [
  {
    test: (m) => m.includes("invalid input syntax for type numeric"),
    ar: "قيمة رقمية غير صحيحة — يرجى إدخال أرقام صحيحة في الحقول المالية.",
  },
  {
    test: (m) => m.includes("invalid input syntax for type"),
    ar: "صيغة غير صحيحة في أحد الحقول — يرجى مراجعة البيانات المدخلة.",
  },
  {
    test: (m) => m.includes("duplicate key") || m.includes("unique constraint") || m.includes("already exists"),
    ar: "هذا السجل موجود مسبقًا — لا يمكن تكراره.",
  },
  {
    test: (m) => m.includes("violates foreign key"),
    ar: "لا يمكن إتمام العملية لارتباط هذا السجل بسجلات أخرى.",
  },
  {
    test: (m) => m.includes("violates not-null") || m.includes("null value in column"),
    ar: "هناك حقل مطلوب لم تتم تعبئته.",
  },
  {
    test: (m) => m.includes("failed to fetch") || m.includes("networkerror") || m.includes("load failed"),
    ar: "تعذّر الاتصال بالخادم — تحقق من اتصال الإنترنت ثم حاول مجددًا.",
  },
];

const STATUS_FALLBACK: Record<number, string> = {
  400: "تعذّر إتمام العملية — يرجى مراجعة البيانات المدخلة.",
  401: "انتهت الجلسة — يرجى تسجيل الدخول من جديد.",
  403: "ليس لديك صلاحية لتنفيذ هذا الإجراء.",
  404: "العنصر المطلوب غير موجود.",
  409: "تعارض في البيانات — قد يكون السجل موجودًا مسبقًا.",
  413: "حجم الملف كبير جدًا — يرجى اختيار ملف أصغر.",
  429: "محاولات كثيرة خلال وقت قصير — يرجى الانتظار قليلًا ثم المحاولة.",
};

const hasArabic = (s: string) => /[\u0600-\u06FF]/.test(s);

export function friendlyArabicError(status: number, rawMessage?: string): string {
  const msg = (rawMessage || "").trim();
  const lower = msg.toLowerCase();

  for (const p of TECHNICAL_PATTERNS) {
    if (p.test(lower)) return p.ar;
  }

  // Server-provided Arabic messages are clear by design — trust them.
  if (msg && hasArabic(msg) && !lower.startsWith("<")) return msg;

  if (status >= 500) return "حدث خطأ في الخادم — يرجى المحاولة لاحقًا.";
  if (STATUS_FALLBACK[status]) return STATUS_FALLBACK[status];
  if (!msg) return "حدث خطأ غير متوقع — يرجى المحاولة مرة أخرى.";

  // English/technical message with no specific mapping → generic Arabic.
  return "تعذّر إتمام العملية — يرجى المحاولة مرة أخرى.";
}

// Resolve a clean Arabic message from any thrown error (ApiError, Error, string).
export function resolveErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "status" in error) {
    const e = error as { status?: number; message?: string };
    return friendlyArabicError(e.status ?? 0, e.message);
  }
  if (error instanceof Error) return friendlyArabicError(0, error.message);
  if (typeof error === "string") return friendlyArabicError(0, error);
  return "حدث خطأ غير متوقع — يرجى المحاولة مرة أخرى.";
}
