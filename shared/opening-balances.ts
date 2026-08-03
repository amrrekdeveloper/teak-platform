// دمج أسطر الأرصدة الافتتاحية (دفتر مساعد): منطق نقي قابل للاختبار.
// القاعدة: الأسطر الجديدة تستبدل القديمة بنفس (الحساب + الطرف)، ومنع الازدواج على
// حساب المراقبة — إذا أدخل المستخدم أسطر أطراف لحساب ما تُحذف أسطره الإجمالية القديمة
// (بلا طرف)، والعكس: سطر إجمالي جديد يحذف أسطر الأطراف القديمة لنفس الحساب.

export type ObLine = {
  accountCode: string;
  accountNameAr: string;
  debit: string;
  credit: string;
  partyType?: string | null;
  partyId?: number | null;
};

export const obLineKey = (l: Pick<ObLine, "accountCode" | "partyType" | "partyId">) =>
  `${l.accountCode}|${l.partyType || ""}|${l.partyId || ""}`;

export function mergeOpeningBalanceLines(existing: ObLine[], incoming: ObLine[]): ObLine[] {
  const isParty = (l: ObLine) => !!(l.partyType && l.partyId);
  // حسابات وردت في الإدخال الجديد بأسطر أطراف / بأسطر إجمالية
  const newPartyAccounts = new Set(incoming.filter(isParty).map(l => l.accountCode));
  const newPlainAccounts = new Set(incoming.filter(l => !isParty(l)).map(l => l.accountCode));

  const map = new Map<string, ObLine>();
  for (const row of existing) {
    // منع الازدواج على حساب المراقبة:
    if (!isParty(row) && newPartyAccounts.has(row.accountCode)) continue; // سطر إجمالي قديم يُستبدل بأسطر الأطراف الجديدة
    if (isParty(row) && newPlainAccounts.has(row.accountCode)) continue;  // أسطر أطراف قديمة يُستبدل بها سطر إجمالي جديد
    map.set(obLineKey(row), row);
  }
  for (const l of incoming) {
    map.set(obLineKey(l), l);
  }
  return Array.from(map.values());
}
