/**
 * Native date fields keep their ISO value, browser validation and keyboard entry.
 * A real pointer gesture may also open the picker from anywhere in the field.
 * Embedded/older browsers may reject showPicker; keep the editable field usable.
 */
export function openNativeDatePicker(input: HTMLInputElement): boolean {
  if (input.type !== "date" || input.disabled || input.readOnly) return false;
  if (typeof input.showPicker !== "function") {
    input.focus();
    return false;
  }
  try {
    input.showPicker();
    return true;
  } catch {
    input.focus();
    return false;
  }
}
