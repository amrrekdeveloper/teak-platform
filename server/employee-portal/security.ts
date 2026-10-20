import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function normalizeEmployeePhone(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 40) return null;
  let value = raw.replace(/[٠-٩۰-۹]/g, c => String(c.charCodeAt(0) - (c <= "٩" ? 0x660 : 0x6f0)))
    .replace(/[\s()+-]/g, "");
  if (value.startsWith("00966")) value = value.slice(2);
  if (/^05\d{8}$/.test(value)) value = `966${value.slice(1)}`;
  if (/^5\d{8}$/.test(value)) value = `966${value}`;
  return /^9665\d{8}$/.test(value) ? value : null;
}

export const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
export function otpHash(id: string, code: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Secure session configuration required");
  return createHmac("sha256", secret).update(`employee-otp:${id}:${code}`).digest("hex");
}
export function equalHash(a: string, b: string) {
  return /^[a-f0-9]{64}$/.test(a) && /^[a-f0-9]{64}$/.test(b) &&
    timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

export const riyadhDay = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
export function validDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}

type Point = { lat: number; lng: number };
type Zone = {
  id: number; nameAr: string; isActive: boolean;
  centerLat: string | null; centerLng: string | null;
  radiusMeters: number | null; polygonCoords: unknown;
};
export function distanceMeters(a: Point, b: Point) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
function insidePolygon(p: Point, vertices: Point[]) {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i], b = vertices[j];
    if (((a.lng > p.lng) !== (b.lng > p.lng)) &&
      p.lat < (b.lat - a.lat) * (p.lng - a.lng) / (b.lng - a.lng) + a.lat) inside = !inside;
  }
  return inside;
}
// Minimum point-to-boundary distance on the local tangent plane.
function polygonClearance(p: Point, vertices: Point[]) {
  const scale = Math.cos(p.lat * Math.PI / 180);
  const xy = (v: Point) => ({ x: (v.lng - p.lng) * scale * 111195, y: (v.lat - p.lat) * 111195 });
  let min = Infinity;
  for (let i = 0; i < vertices.length; i++) {
    const a = xy(vertices[i]), b = xy(vertices[(i + 1) % vertices.length]);
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / (dx * dx + dy * dy || 1)));
    min = Math.min(min, Math.hypot(a.x + t * dx, a.y + t * dy));
  }
  return min;
}
export function permittedZone(zones: Zone[], point: Point, accuracy: number) {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat) > 90 ||
    Math.abs(point.lng) > 180 || !Number.isFinite(accuracy) || accuracy <= 0 || accuracy > 50) return undefined;
  return zones.find(zone => {
    if (!zone.isActive) return false;
    const polygon = zone.polygonCoords;
    if (Array.isArray(polygon) && polygon.length >= 3) {
      if (!polygon.every(p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng))) return false;
      return insidePolygon(point, polygon) && polygonClearance(point, polygon) >= accuracy;
    }
    if (zone.centerLat === null || zone.centerLng === null) return false;
    const center = { lat: Number(zone.centerLat), lng: Number(zone.centerLng) };
    return Number.isFinite(center.lat) && Number.isFinite(center.lng) &&
      (zone.radiusMeters ?? 0) > 0 &&
      distanceMeters(point, center) + accuracy <= zone.radiusMeters!;
  });
}
