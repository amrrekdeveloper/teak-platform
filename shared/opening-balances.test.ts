import { describe, it, expect } from "vitest";
import { mergeOpeningBalanceLines, obLineKey, type ObLine } from "./opening-balances";

const line = (accountCode: string, credit: string, partyType?: string | null, partyId?: number | null, debit = "0"): ObLine => ({
  accountCode, accountNameAr: "x", debit, credit, partyType: partyType ?? null, partyId: partyId ?? null,
});

const total = (lines: ObLine[]) => lines.reduce((s, l) => s + parseFloat(l.credit) - parseFloat(l.debit), 0);

describe("mergeOpeningBalanceLines", () => {
  it("keeps plain lines additive and overrides same account", () => {
    const merged = mergeOpeningBalanceLines([line("1100", "0", null, null, "500")], [line("1100", "0", null, null, "800"), line("5100", "0", null, null, "100")]);
    expect(merged).toHaveLength(2);
    expect(merged.find(l => l.accountCode === "1100")!.debit).toBe("800");
  });

  it("keeps separate party lines on the same control account", () => {
    const merged = mergeOpeningBalanceLines(
      [line("2111", "1000", "supplier", 1)],
      [line("2111", "2000", "supplier", 2)],
    );
    expect(merged).toHaveLength(2);
    expect(total(merged)).toBe(3000);
  });

  it("overrides the same party's balance instead of duplicating", () => {
    const merged = mergeOpeningBalanceLines(
      [line("2111", "1000", "supplier", 1)],
      [line("2111", "2500", "supplier", 1)],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].credit).toBe("2500");
  });

  it("drops legacy aggregate control line when party lines are submitted (no double count)", () => {
    const merged = mergeOpeningBalanceLines(
      [line("2111", "5000", null, null), line("1100", "0", null, null, "5000")],
      [line("2111", "3000", "supplier", 1), line("2111", "2000", "supplier", 2)],
    );
    const apLines = merged.filter(l => l.accountCode === "2111");
    expect(apLines).toHaveLength(2);
    expect(apLines.every(l => l.partyType === "supplier")).toBe(true);
    expect(total(apLines)).toBe(5000);
  });

  it("drops old party lines when a new aggregate line is submitted for the same account", () => {
    const merged = mergeOpeningBalanceLines(
      [line("2111", "3000", "supplier", 1), line("2111", "2000", "supplier", 2)],
      [line("2111", "4000", null, null)],
    );
    const apLines = merged.filter(l => l.accountCode === "2111");
    expect(apLines).toHaveLength(1);
    expect(apLines[0].credit).toBe("4000");
  });

  it("does not touch party lines on other accounts", () => {
    const merged = mergeOpeningBalanceLines(
      [line("1121", "0", "customer", 7, "900")],
      [line("2111", "1000", "supplier", 1)],
    );
    expect(merged).toHaveLength(2);
  });

  it("obLineKey distinguishes party vs plain", () => {
    expect(obLineKey(line("2111", "1", "supplier", 1))).not.toBe(obLineKey(line("2111", "1")));
  });
});
