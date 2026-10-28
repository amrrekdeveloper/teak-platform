import { describe, expect, it } from "vitest";
import { canShowHrHelpLink, filterHrHelpSections, HR_HELP_SECTIONS } from "@/components/hr-help-content";

describe("HR help content and permission-aware destinations", () => {
  it("finds bilingual content by meaning and returns an empty result for unmatched terms", () => {
    expect(filterHrHelpSections("payroll").map(section => section.id)).toContain("payroll");
    expect(filterHrHelpSections("مرفق").map(section => section.id)).toContain("requests");
    expect(filterHrHelpSections("not-a-real-guide-term")).toEqual([]);
  });

  it("exposes a link only to a signed-in HR workspace identity with that /me permission", () => {
    const link = HR_HELP_SECTIONS.find(section => section.id === "payroll")!.links[0];
    expect(canShowHrHelpLink({ role: "hr", maintenanceScope: "hr", permissions: ["/payroll"] }, link)).toBe(true);
    expect(canShowHrHelpLink({ role: "hr", maintenanceScope: "manager", permissions: ["/payroll"] }, link)).toBe(false);
    expect(canShowHrHelpLink({ role: "hr", maintenanceScope: "hr", permissions: [] }, link)).toBe(false);
    expect(canShowHrHelpLink(null, link)).toBe(false);
  });
});
