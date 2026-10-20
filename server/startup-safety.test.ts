import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
describe("production startup data preservation",()=>{
  it("does not invoke legacy production cleanup or identity reseeding",()=>{
    const startup=readFileSync("server/index.ts","utf8");
    expect(startup).not.toContain("seedProductionDatabase");
    expect(readFileSync("server/routes.ts","utf8")).toContain('if (process.env.NODE_ENV !== "production") await seedDatabase();');
  });
  it("build is not a forced database push",()=>{
    expect(readFileSync("scripts/build.sh","utf8")).not.toMatch(/npm run db:push/);
  });
});
