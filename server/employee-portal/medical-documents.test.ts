import {describe,it,expect,vi} from "vitest";
vi.mock("../db",()=>({pool:{}}));
vi.mock("../objectFileStore",()=>({saveObjectFile:vi.fn(),streamObjectFile:vi.fn(),deleteObjectFile:vi.fn()}));
vi.mock("./router",()=>({asyncRoute:vi.fn(),identity:vi.fn(),portalError:vi.fn()}));
import {medicalMime} from "./medical-documents";
describe("medical document content validation",()=>{
  it("accepts only declared PDF, JPEG and PNG signatures",()=>{
    expect(medicalMime(Buffer.from("%PDF-1.7\n"),"application/pdf")).toBe("application/pdf");
    expect(medicalMime(Buffer.from([137,80,78,71,13,10,26,10]),"image/png")).toBe("image/png");
    expect(medicalMime(Buffer.from([255,216,255,224]),"image/jpeg")).toBe("image/jpeg");
  });
  it("rejects forged MIME, HTML, and SVG",()=>{
    expect(medicalMime(Buffer.from("<script>alert(1)</script>"),"application/pdf")).toBeNull();
    expect(medicalMime(Buffer.from("%PDF-1.7"),"image/png")).toBeNull();
    expect(medicalMime(Buffer.from("<svg/>"),"image/svg+xml")).toBeNull();
  });
});
