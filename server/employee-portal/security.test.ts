import { describe, expect, it } from "vitest";
import { normalizeEmployeePhone, permittedZone, riyadhDay, validDate, equalHash, tokenHash } from "./security";
import { employeePhone, resolveEligibleEmployee, type PortalEmployee } from "./database";

const employee = (id: number, phone: string, status = "active") =>
  ({ id, phone, status } as PortalEmployee);
const circle = {
  id: 1, nameAr: "مقر اختبار", isActive: true,
  centerLat: "24.7", centerLng: "46.7", radiusMeters: 100, polygonCoords: [],
};
describe("employee identity", () => {
  it("normalizes Saudi mobile variants, including Arabic digits", () => {
    for (const value of ["0501234567", "+966501234567", "00966501234567", "٥٠١٢٣٤٥٦٧", "۰۵۰۱۲۳۴۵۶۷"]) {
      expect(normalizeEmployeePhone(value)).toBe("966501234567");
    }
    for (const value of ["", "966441234567", "<script>", "050123", null]) expect(normalizeEmployeePhone(value)).toBeNull();
  });
  it("never resolves duplicate numbers, inactive employees or nonemployees", () => {
    expect(resolveEligibleEmployee([employee(1, "0501234567")], "966501234567")?.id).toBe(1);
    expect(resolveEligibleEmployee([employee(1, "0501234567"), employee(2, "+966501234567")], "966501234567")).toBeNull();
    expect(resolveEligibleEmployee([employee(1, "0501234567", "terminated")], "966501234567")).toBeNull();
    expect(resolveEligibleEmployee([], "966501234567")).toBeNull();
  });
  it("uses only the HR employee mobile, never an administrative account fallback", () => {
    expect(employeePhone({ phone: null, user_phone: "0501234567" } as PortalEmployee)).toBeNull();
    expect(employeePhone({ phone: "0507654321", user_phone: "0501234567" } as PortalEmployee)).toBe("966507654321");
  });
  it("hash comparisons do not accept malformed or partial token hashes", () => {
    expect(equalHash(tokenHash("one"), tokenHash("one"))).toBe(true);
    expect(equalHash(tokenHash("one"), tokenHash("two"))).toBe(false);
    expect(equalHash("", "")).toBe(false);
  });
});
describe("server attendance constraints", () => {
  it("uses Riyadh calendar days across UTC midnight", () => {
    expect(riyadhDay(new Date("2026-10-20T21:30:00Z"))).toBe("2026-10-21");
    expect(validDate("2026-02-30")).toBe(false);
    expect(validDate("2028-02-29")).toBe(true);
  });
  it("rejects missing zones, inactive zones, outside and uncertain boundaries", () => {
    expect(permittedZone([], { lat: 24.7, lng: 46.7 }, 10)).toBeUndefined();
    expect(permittedZone([{ ...circle, isActive: false }], { lat: 24.7, lng: 46.7 }, 10)).toBeUndefined();
    expect(permittedZone([circle], { lat: 24.71, lng: 46.7 }, 10)).toBeUndefined();
    expect(permittedZone([circle], { lat: 24.7008, lng: 46.7 }, 25)).toBeUndefined();
    expect(permittedZone([circle], { lat: 24.7, lng: 46.7 }, 10)?.id).toBe(1);
  });
  it("checks the actual polygon, not just its bounding box", () => {
    const triangle = { ...circle, polygonCoords: [
      { lat: 24.7, lng: 46.7 }, { lat: 24.71, lng: 46.7 }, { lat: 24.7, lng: 46.71 },
    ] };
    expect(permittedZone([triangle], { lat: 24.708, lng: 46.708 }, 5)).toBeUndefined();
    expect(permittedZone([triangle], { lat: 24.702, lng: 46.702 }, 5)?.id).toBe(1);
  });
});
