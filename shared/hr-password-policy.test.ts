import { describe,expect,it } from "vitest";
import { isValidHrPassword } from "./hr-password-policy";
describe("HR password creation and reset policy",()=>{
  it.each(["Aa1!xx","Ab2@cd","Aa١!xx","Aa1!existing-long-password"])("accepts %s",value=>{
    expect(isValidHrPassword(value)).toBe(true);
  });
  it.each(["Aa1!x","aa1!xx","AA1!XX","Aa!!xx","Aa12xx","Aa1عxx","Aa1 xx","Aa1!"+"x".repeat(253),"",null])("rejects missing requirements",value=>{
    expect(isValidHrPassword(value)).toBe(false);
  });
});
