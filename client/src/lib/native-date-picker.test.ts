import { describe, expect, it, vi } from "vitest";
import { openNativeDatePicker } from "./native-date-picker";

function field(overrides: Record<string, unknown> = {}) {
  return {type:"date",disabled:false,readOnly:false,showPicker:vi.fn(),focus:vi.fn(),...overrides} as unknown as HTMLInputElement;
}

describe("native date picker",()=>{
  it("opens the native picker without changing the date",()=>{
    const input=field({value:"2026-10-27"});
    expect(openNativeDatePicker(input)).toBe(true);
    expect(input.showPicker).toHaveBeenCalledOnce();
    expect(input.value).toBe("2026-10-27");
  });
  it.each([{disabled:true},{readOnly:true},{type:"text"},{type:"number"}])("respects protected and non-date fields: %o",overrides=>{
    const input=field(overrides);
    expect(openNativeDatePicker(input)).toBe(false);
    expect(input.showPicker).not.toHaveBeenCalled();
    expect(input.focus).not.toHaveBeenCalled();
  });
  it("retains manual entry if the browser has no picker API",()=>{
    const input=field({showPicker:undefined});
    expect(openNativeDatePicker(input)).toBe(false);
    expect(input.focus).toHaveBeenCalledOnce();
  });
  it("retains manual entry in an embedded browser that disallows the picker",()=>{
    const input=field({showPicker:vi.fn(()=>{throw new Error("SecurityError");})});
    expect(openNativeDatePicker(input)).toBe(false);
    expect(input.focus).toHaveBeenCalledOnce();
  });
});
