/**
 * Normalize a Saudi phone number to the standard 10-digit format (05XXXXXXXX).
 * Accepts:
 *   - 9-digit numbers starting with 5  → prepends "0"
 *   - 10-digit numbers starting with 05 → returned as-is
 * Strips spaces and dashes before processing.
 */
export function normalizePhone(phone: string): string {
  const cleaned = phone.trim().replace(/[\s\-]/g, "");
  if (/^5\d{8}$/.test(cleaned)) {
    return "0" + cleaned;
  }
  return cleaned;
}
