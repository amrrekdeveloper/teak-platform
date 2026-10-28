import { describe, expect, it } from "vitest";
import { hrEntityIdInput, hrMoneyInput, hrScoreInput } from "./hr-number-inputs";
import { toLatinEditableDigits } from "../shared/digits";

describe("localized HR numeric boundaries", () => {
  it.each(["١٬٢", "١٬", "٬١٠٠", "١٬٢٣"])("never silently removes malformed grouping: %s", value => {
    expect(toLatinEditableDigits(value)).toBe(value);
    expect(hrMoneyInput(value)).toBeNull();
    expect(hrEntityIdInput(value)).toBeNull();
    expect(hrScoreInput(value)).toBeNull();
  });
  it.each([7, "7", "٧", "۷"])("accepts an employee JSON ID of the same type sent by HR forms: %s", value => {
    expect(hrEntityIdInput(value)).toBe(7);
  });
  it.each([0, -1, "7x", "7.5", "1e2", "", ["7"], null, 2147483648])(
    "rejects an invalid employee ID before database access: %s", value => {
      expect(hrEntityIdInput(value)).toBeNull();
    },
  );
  it.each(["١٬٢٣٤٫٥٠", "۱٬۲۳۴٫۵۰", "1234.50"])("normalizes money without changing value: %s", value => {
    expect(hrMoneyInput(value)).toBe(1234.5);
  });
  it.each(["1x", "1e2", "", "-1", "1.001", "Infinity", "10000000000", null, true, {}])(
    "rejects malformed/out-of-bounds money rather than defaulting: %s", value => {
      expect(hrMoneyInput(value)).toBeNull();
    },
  );
  it("allows zero payroll adjustments", () => expect(hrMoneyInput("٠")).toBe(0));
  it.each(["٥", "۵", "5", 5])("preserves localized evaluation score: %s", value => {
    expect(hrScoreInput(value)).toBe(5);
  });
  it.each(["4x", "3.5", "6", "0", "", null, true])("rejects malformed evaluation score: %s", value => {
    expect(hrScoreInput(value)).toBeNull();
  });
  it("retains the optional score default", () => expect(hrScoreInput(undefined)).toBe(3));
});
