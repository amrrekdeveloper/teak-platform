/** Express 5 permits wildcard arrays; these routes require one path segment. */
export function singleParam(value: string | string[]): string {
  if (typeof value !== "string") throw Object.assign(new Error("معرّف المسار غير صالح"), { status: 400 });
  return value;
}

export function parseInt(value: string | string[], radix = 10): number {
  return Number.parseInt(singleParam(value), radix);
}
