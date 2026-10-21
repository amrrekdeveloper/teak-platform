import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn(), connect: vi.fn() }));
vi.mock("./db", () => ({ pool: { connect: fixture.connect, query: fixture.query } }));
import {
  backfillDepartmentCatalog, bootstrapDepartmentCatalog,
  requireDepartmentCatalogReady, withDepartmentCatalogWrite,
} from "./department-catalog";

beforeEach(() => {
  vi.clearAllMocks();
  fixture.connect.mockResolvedValue({ query: fixture.query, release: fixture.release });
  fixture.query.mockResolvedValue({ rows: [] });
});

describe("department catalog staged publication", () => {
  it("backfills an existing but empty table from referenced codes, without schema or employee writes", async () => {
    fixture.query.mockImplementation(async (query: string) => ({
      rows: query.includes("SELECT DISTINCT") ? [{ code: "hr" }, { code: "legacy_code" }] : [],
    }));
    await bootstrapDepartmentCatalog();
    const statements = fixture.query.mock.calls.map(([query]) => query);
    expect(statements.some(query => /\b(CREATE|ALTER|DROP|UPDATE|DELETE)\b/i.test(query))).toBe(false);
    expect(statements).toContain("SELECT pg_advisory_xact_lock(51804)");
    expect(statements).toContain("LOCK TABLE employees IN SHARE MODE");
    expect(fixture.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO hr_departments"), ["hr", "الموارد البشرية"],
    );
    expect(fixture.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO hr_departments"), ["legacy_code", "legacy_code"],
    );
    expect(statements.at(-1)).toBe("COMMIT");
    expect(fixture.release).toHaveBeenCalledOnce();
  });

  it("does not resurrect unused deleted departments or seed a development catalog into production", async () => {
    await backfillDepartmentCatalog({ query: fixture.query });
    expect(fixture.query).toHaveBeenCalledOnce();
    expect(fixture.query.mock.calls[0][0]).toContain("WHERE d.code IS NULL");
  });

  it("preserves an existing department name when a legacy code needs the same Arabic label", async () => {
    fixture.query.mockImplementation(async (query: string) => ({
      rows: query.includes("SELECT DISTINCT") ? [{ code: "sales" }]
        : query.startsWith("SELECT name_ar") ? [{ name_ar: "المبيعات" }] : [],
    }));
    await backfillDepartmentCatalog({ query: fixture.query });
    expect(fixture.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO hr_departments"), ["sales", "المبيعات (sales)"],
    );
  });

  it("rolls back initialization and releases the client on a failed insert", async () => {
    fixture.query.mockImplementation(async (query: string) => {
      if (query.includes("SELECT DISTINCT")) return { rows: [{ code: "hr" }] };
      if (query.startsWith("INSERT")) throw new Error("isolated failure");
      return { rows: [] };
    });
    await expect(bootstrapDepartmentCatalog()).rejects.toThrow("isolated failure");
    expect(fixture.query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(fixture.release).toHaveBeenCalledOnce();
  });

  it.each([{ rows: [] }, { rows: [{ ready: false }] }])("fails closed when the validated FK is absent: %j", async ({ rows }) => {
    fixture.query.mockResolvedValue({ rows });
    const write = vi.fn();
    await expect(withDepartmentCatalogWrite(write)).rejects.toMatchObject({ status: 503 });
    expect(write).not.toHaveBeenCalled();
    expect(fixture.query).toHaveBeenCalledWith("SELECT pg_advisory_unlock_shared(51804)");
    expect(fixture.release).toHaveBeenCalledWith(false);
  });

  it("requires a validated, non-cascading catalog FK before allowing a write", async () => {
    fixture.query.mockResolvedValue({ rows: [{ ready: true }] });
    await expect(requireDepartmentCatalogReady()).resolves.toBeUndefined();
    expect(fixture.query.mock.calls[0][0]).toContain("convalidated");
    expect(fixture.query.mock.calls[0][0]).toContain("confdeltype IN ('a','r')");
    const write = vi.fn().mockResolvedValue("saved");
    await expect(withDepartmentCatalogWrite(write)).resolves.toBe("saved");
    expect(write).toHaveBeenCalledOnce();
    expect(fixture.query).toHaveBeenCalledWith("SELECT pg_advisory_lock_shared(51804)");
  });

  it("unlocks after a rejected write without hiding the database error", async () => {
    fixture.query.mockResolvedValue({ rows: [{ ready: true }] });
    await expect(withDepartmentCatalogWrite(async () => { throw new Error("FK rejection"); }))
      .rejects.toThrow("FK rejection");
    expect(fixture.query).toHaveBeenLastCalledWith("SELECT pg_advisory_unlock_shared(51804)");
    expect(fixture.release).toHaveBeenCalledWith(false);
  });

  it("discards a connection if its session lock cannot be released", async () => {
    fixture.query.mockImplementation(async (query: string) => {
      if (query.includes("pg_advisory_unlock")) throw new Error("connection lost");
      return { rows: [{ ready: true }] };
    });
    await expect(withDepartmentCatalogWrite(async () => "saved")).resolves.toBe("saved");
    expect(fixture.release).toHaveBeenCalledWith(true);
  });
});
