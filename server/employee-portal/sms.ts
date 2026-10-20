// Official API: https://dev.taqnyat.sa/en/doc/sms/
// No SDK logging, query-string credentials, demo codes, or fallback verification.
export async function sendEmployeeOtp(phone: string, code: string): Promise<void> {
  const apiKey = process.env.TAQNYAT_API_KEY?.trim().replace(/^Bearer\s+/i, "");
  if (!apiKey) throw new Error("SMS_NOT_CONFIGURED");
  const response = await fetch("https://api.taqnyat.sa/v1/messages", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      recipients: [phone],
      sender: "TEAKSA",
      body: `رمز دخولك إلى خدمة موظفي تيك: ${code}\nصالح لمدة 5 دقائق. لا تشارك الرمز مع أي شخص.`,
    }),
    signal: AbortSignal.timeout(15000),
  });
  // Never log provider payloads: they may contain message bodies or recipients.
  const result = await response.json().catch(() => null);
  if (response.status !== 201 || result?.statusCode !== 201 ||
    !result?.messageId || (result?.rejected && String(result.rejected) !== "[]" && String(result.rejected) !== "")) {
    throw new Error("SMS_DELIVERY_FAILED");
  }
}
