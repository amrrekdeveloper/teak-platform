/**
 * Import per-grade prices for adeko_products from teak_products_prices CSV.
 *
 * - Matches by `code` ONLY (tolerant to spaces / underscores / dashes / case).
 * - Updates price_economy / price_standard / price_premium and sets
 *   price_after_vat = price_standard (prices are VAT-inclusive).
 * - NEVER touches any name column (description_ar is authoritative in DB).
 *
 * Run: npx tsx scripts/import-kitchen-prices.ts [path-to-csv]
 */
import fs from "fs";
import { Pool } from "pg";

const CSV_PATH =
  process.argv[2] ?? "attached_assets/teak_products_prices_1784296693966.csv";

const normalize = (code: string) =>
  code
    .replace(/^\uFEFF/, "")
    .toUpperCase()
    .replace(/[\s_\-]+/g, "");

function parseCsv(text: string): string[][] {
  // Simple CSV (no quoted commas in this file except none expected).
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((l) => l.split(","));
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const rows = parseCsv(fs.readFileSync(CSV_PATH, "utf8"));
  const header = rows[0].map((h) => h.trim());
  const idx = (name: string) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`Missing CSV column: ${name}`);
    return i;
  };
  const iCode = idx("code");
  const iEco = idx("price_economy");
  const iStd = idx("price_standard");
  const iPre = idx("price_premium");

  const csvByCode = new Map<
    string,
    { code: string; eco: number; std: number; pre: number }
  >();
  for (const r of rows.slice(1)) {
    const code = (r[iCode] ?? "").trim();
    if (!code) continue;
    const eco = parseFloat(r[iEco]);
    const std = parseFloat(r[iStd]);
    const pre = parseFloat(r[iPre]);
    if (![eco, std, pre].every(Number.isFinite)) {
      console.warn(`Skipping row with bad prices: ${code}`);
      continue;
    }
    csvByCode.set(normalize(code), { code, eco, std, pre });
  }
  console.log(`CSV rows with prices: ${csvByCode.size}`);

  const db = await pool.query(`SELECT id, code FROM adeko_products`);
  let updated = 0;
  const unmatchedDb: string[] = [];
  const matchedCsv = new Set<string>();

  for (const p of db.rows) {
    const key = normalize(p.code);
    const hit = csvByCode.get(key);
    if (!hit) {
      unmatchedDb.push(p.code);
      continue;
    }
    matchedCsv.add(key);
    await pool.query(
      `UPDATE adeko_products
       SET price_economy = $1, price_standard = $2, price_premium = $3,
           price_after_vat = $2
       WHERE id = $4`,
      [hit.eco, hit.std, hit.pre, p.id]
    );
    updated++;
  }

  const unmatchedCsv = [...csvByCode.entries()]
    .filter(([k]) => !matchedCsv.has(k))
    .map(([, v]) => v.code);

  const zero = await pool.query(
    `SELECT count(*)::int AS n FROM adeko_products
     WHERE active = TRUE AND (price_after_vat IS NULL OR price_after_vat = 0)`
  );

  console.log(`Updated products: ${updated} / ${db.rows.length} in DB`);
  if (unmatchedDb.length)
    console.log(`DB codes with no CSV match (${unmatchedDb.length}):`, unmatchedDb.join(" | "));
  if (unmatchedCsv.length)
    console.log(`CSV codes with no DB match (${unmatchedCsv.length}):`, unmatchedCsv.join(" | "));
  console.log(`Active products still priced 0: ${zero.rows[0].n}`);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
