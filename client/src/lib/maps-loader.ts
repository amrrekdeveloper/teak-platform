// محمّل موحّد لخرائط Google: setOptions تُستدعى مرة واحدة فقط على مستوى التطبيق،
// مع التقاط فشل المصادقة (gm_authFailure) لأن Google لا ترميه كخطأ عادي —
// المفتاح المقيّد بنطاق معيّن (مثل الإنتاج فقط) يفشل بصمت داخل الخريطة.
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

export const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined;

let initialized = false;
let authFailed = false;
const authFailureListeners = new Set<() => void>();

export function onMapsAuthFailure(cb: () => void): () => void {
  if (authFailed) cb();
  authFailureListeners.add(cb);
  return () => authFailureListeners.delete(cb);
}

export function initMapsLoader(): boolean {
  if (!MAPS_KEY) return false;
  if (initialized) return true;
  initialized = true;
  // Google تستدعي window.gm_authFailure عند فشل مصادقة المفتاح
  // (InvalidKey / RefererNotAllowed / ApiNotActivated ...)
  (window as any).gm_authFailure = () => {
    authFailed = true;
    console.error("[maps] gm_authFailure: مفتاح Google Maps مرفوض لهذا النطاق (تحقق من قيود HTTP referrer وتفعيل Maps JavaScript API)");
    authFailureListeners.forEach(cb => cb());
  };
  setOptions({ key: MAPS_KEY, v: "weekly" });
  return true;
}

export async function loadMapsLibrary<T = any>(name: string): Promise<T> {
  if (!initMapsLoader()) throw new Error("VITE_GOOGLE_MAPS_KEY غير مضبوط");
  try {
    return (await importLibrary(name as any)) as T;
  } catch (err: any) {
    console.error(`[maps] فشل تحميل مكتبة ${name}:`, err?.message || err, err);
    throw err;
  }
}

export function describeMapsError(err: unknown): string {
  const msg = (err as any)?.message || String(err);
  if (/could not load/i.test(msg)) {
    return "تعذّر تحميل سكربت خرائط Google من المتصفح (قد يكون محجوباً بمانع إعلانات أو مشكلة شبكة). جرّب تعطيل مانع الإعلانات أو إعادة تحميل الصفحة.";
  }
  return `تعذّر تحميل خريطة Google: ${msg}`;
}
