// Converts Arabic-Indic (٠-٩, U+0660–U+0669) and Persian/Urdu (۰-۹, U+06F0–U+06F9)
// digits to ASCII 0-9. Keyboards with an Arabic numeric layout produce these,
// which break parseFloat() and Postgres numeric casts. Normalize at every numeric
// boundary (form input + API/storage) to avoid "invalid input syntax for type numeric".
export function toLatinDigits(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "";
  return String(input)
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\u066B/g, ".") // Arabic decimal separator ٫ → .
    .replace(/\u066C/g, ""); // Arabic thousands separator ٬ → removed
}

// Preserve incomplete/malformed Arabic grouping while editing. Stripping "١٬٢"
// would silently change an invalid amount into 12 before API validation.
export function toLatinEditableDigits(input: string | number | null | undefined): string {
  const text = input == null ? "" : String(input);
  if (text.includes("\u066C") &&
      !/^[0-9٠-٩۰-۹]{1,3}(?:٬[0-9٠-٩۰-۹]{3})+(?:[.٫][0-9٠-٩۰-۹]*)?$/.test(text))
    return text;
  return toLatinDigits(input);
}

// Parses a possibly-localized numeric string into a finite number, falling back to 0.
export function parseNum(input: string | number | null | undefined): number {
  const n = parseFloat(toLatinDigits(input));
  return Number.isFinite(n) ? n : 0;
}
