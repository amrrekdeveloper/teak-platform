import { toLatinEditableDigits } from "../shared/digits";

/** JSON IDs may be numbers; Express wildcard/path guards must not parse them. */
export function hrEntityIdInput(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = toLatinEditableDigits(value);
  const id = Number(text);
  return /^\d+$/.test(text) && Number.isInteger(id) && id > 0 && id <= 2147483647 ? id : null;
}

/** Strict existing HR money bounds; localization never turns malformed input into zero. */
export function hrMoneyInput(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = toLatinEditableDigits(value);
  const amount = Number(text);
  return /^\d+(\.\d{1,2})?$/.test(text) && Number.isFinite(amount) &&
    amount >= 0 && amount < 10000000000 ? amount : null;
}

export function hrScoreInput(value: unknown): number | null {
  if (value === undefined) return 3; // Preserve the optional criterion's existing default.
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = toLatinEditableDigits(value).trim();
  return /^[1-5]$/.test(text) ? Number(text) : null;
}
