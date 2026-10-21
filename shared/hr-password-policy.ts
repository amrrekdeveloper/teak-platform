export const HR_PASSWORD_MIN_LENGTH = 6;
export const HR_PASSWORD_MAX_LENGTH = 256;
export const HR_PASSWORD_MESSAGE = "6 خانات على الأقل، تشمل حرفًا كبيرًا وحرفًا صغيرًا ورقمًا ورمزًا.";

/** Creation/reset policy only. Never reject an existing password at login. */
export function isValidHrPassword(value: unknown): value is string {
  return typeof value==="string" &&
    value.length>=HR_PASSWORD_MIN_LENGTH && value.length<=HR_PASSWORD_MAX_LENGTH &&
    /[A-Z]/.test(value) && /[a-z]/.test(value) &&
    /\p{Nd}/u.test(value) && /[\p{P}\p{S}]/u.test(value);
}
