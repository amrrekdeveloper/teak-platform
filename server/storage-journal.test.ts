import { beforeEach, describe, expect, it, vi } from "vitest";
import { journalEntries, journalEntryLines } from "@shared/schema";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  select: vi.fn(),
}));
vi.mock("./db", () => ({ db: mocks, pool: {} }));

import { storage } from "./storage";

describe("journal storage type-contract regressions", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([null, [{ url: "/objects/receipt.pdf", name: "receipt.pdf" }]])(
    "preserves attachments %j and assigns the new parent ID to every line",
    async (attachments) => {
      const headerValues = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 42, attachments }]),
      });
      const lineValues = vi.fn().mockResolvedValue([]);
      const insert = vi.fn((table) => ({
        values: table === journalEntries ? headerValues : lineValues,
      }));
      mocks.transaction.mockImplementation(async (run) => run({ insert }));

      const entry = await storage.createJournalEntry(
        { date: "2026-01-01", description: "Test entry", attachments },
        [
          { accountCode: "cash", accountNameAr: "النقدية", debit: "١٠٠", credit: "0", partyType: "customer", partyId: 7 },
          { entryId: 0, accountCode: "sales", accountNameAr: "المبيعات", debit: "0", credit: "100" },
        ],
      );

      expect(entry.id).toBe(42);
      expect(mocks.transaction).toHaveBeenCalledOnce();
      expect(insert).toHaveBeenNthCalledWith(2, journalEntryLines);
      expect(headerValues).toHaveBeenCalledWith(expect.objectContaining({
        attachments, totalDebit: "100.00", totalCredit: "100.00",
      }));
      expect(lineValues).toHaveBeenCalledWith([
        { entryId: 42, accountCode: "cash", accountNameAr: "النقدية", debit: "100", credit: "0", partyType: "customer", partyId: 7 },
        { entryId: 42, accountCode: "sales", accountNameAr: "المبيعات", debit: "0", credit: "100" },
      ]);
    },
  );

  it("includes party identity fields in account ledger results", async () => {
    const rows = [{ id: 1, partyType: "customer", partyId: 7 }];
    const orderBy = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ orderBy });
    const innerJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ innerJoin });
    mocks.select.mockReturnValue({ from });

    const result = await storage.getJournalEntryLinesForAccount("cash", "2026-01-01", "2026-12-31");

    expect(mocks.select).toHaveBeenCalledWith(expect.objectContaining({
      partyType: journalEntryLines.partyType,
      partyId: journalEntryLines.partyId,
    }));
    expect(result).toEqual(rows);
    expect(where).toHaveBeenCalledOnce();
    expect(orderBy).toHaveBeenCalledOnce();
  });
});
