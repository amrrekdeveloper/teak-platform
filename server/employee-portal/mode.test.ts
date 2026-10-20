import { describe, expect, it } from "vitest";
import { developmentOtpEnabled } from "./mode";

describe("development OTP isolation", () => {
  it("requires explicit development opt-in", () => {
    expect(developmentOtpEnabled({ NODE_ENV: "development", EMPLOYEE_PORTAL_DEV_OTP: "true" })).toBe(true);
    for (const NODE_ENV of ["production", "test", "", undefined]) {
      expect(developmentOtpEnabled({ NODE_ENV, EMPLOYEE_PORTAL_DEV_OTP: "true" })).toBe(false);
    }
    expect(developmentOtpEnabled({ NODE_ENV: "development" })).toBe(false);
  });
  it("never enables the fixed code in a deployment even with mistaken settings", () => {
    expect(developmentOtpEnabled({
      NODE_ENV: "development", EMPLOYEE_PORTAL_DEV_OTP: "true", REPLIT_DEPLOYMENT: "1",
    })).toBe(false);
  });
});
