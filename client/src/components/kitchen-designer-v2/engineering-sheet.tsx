import { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import {
  type KitchenLayout,
  type KitchenWall,
  type KitchenOpening,
  type KitchenUtility,
  type PlacedCabinetState,
} from "@/components/kitchen-designer-v2/store";
import {
  getWallSegments,
  wallLabelAr,
  wallLabelEn,
  type WallSegment,
} from "@/components/kitchen-designer-v2/plan-svg";
import {
  findCabinetDef,
  adekoPriceForGrade,
  type CabinetDef,
} from "@/components/kitchen-designer-v2/cabinets";

/* All colors are explicit (no Tailwind classes) so the SVG rasterizes
   identically when exported to PDF. */
const INK = "#1f2328";
const INK_SOFT = "#4b5259";
const TEAK_RED = "#d92626";
const PAPER = "#ffffff";
const GRID = "#eceef0";

interface SheetMaterial {
  id: number;
  nameAr: string;
  nameEn: string;
  grade?: "economy" | "standard" | "premium";
}

interface EngineeringSheetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layout: KitchenLayout;
  walls: KitchenWall[];
  openings: KitchenOpening[];
  utilities: KitchenUtility[];
  placedCabinets: PlacedCabinetState[];
  woodMaterials: SheetMaterial[];
  customerName?: string | null;
}

function pointAlong(seg: WallSegment, d: number) {
  const t = seg.length > 0 ? d / seg.length : 0;
  return { x: seg.x1 + (seg.x2 - seg.x1) * t, y: seg.y1 + (seg.y2 - seg.y1) * t };
}

function unitDir(seg: WallSegment) {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  const len = Math.hypot(dx, dy) || 1;
  return { ux: dx / len, uy: dy / len };
}

interface BomRow {
  no: number;
  cabinetId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  dims: string;
  approxDims: boolean;
  materialAr: string;
  materialEn: string;
  price: number;
  /** Footprint center in plan coordinates (cm) for the numbered bubble. */
  cx: number;
  cy: number;
  isUpper: boolean;
}

/** One tier of a dimension chain along a wall. */
interface ChainTick {
  d: number; // distance (cm) from wall start
}

const UTILITY_STYLE: Record<
  string,
  { letterAr: string; letterEn: string; color: string; labelAr: string; labelEn: string }
> = {
  water: { letterAr: "م", letterEn: "W", color: "#2673d9", labelAr: "نقطة ماء", labelEn: "Water point" },
  outlet: { letterAr: "ك", letterEn: "E", color: "#d97a26", labelAr: "مقبس كهرباء", labelEn: "Power outlet" },
  switch: { letterAr: "ف", letterEn: "S", color: "#7a26d9", labelAr: "مفتاح إنارة", labelEn: "Light switch" },
  drain: { letterAr: "ص", letterEn: "D", color: "#26a069", labelAr: "صرف", labelEn: "Drain" },
  gas: { letterAr: "غ", letterEn: "G", color: "#c9262f", labelAr: "نقطة غاز", labelEn: "Gas point" },
};

export default function EngineeringSheetDialog({
  open,
  onOpenChange,
  layout,
  walls,
  openings,
  utilities,
  placedCabinets,
  woodMaterials,
  customerName,
}: EngineeringSheetDialogProps) {
  const { t, isRTL } = useLanguage();
  const isAr = isRTL;
  const svgRef = useRef<SVGSVGElement>(null);
  const [exporting, setExporting] = useState<"a4" | "a3" | null>(null);

  const segments = useMemo(() => getWallSegments(layout, walls), [layout, walls]);

  /* ---------- BOM rows + bubbles ---------- */
  const bomRows = useMemo<BomRow[]>(() => {
    const segById = new Map(segments.map((s) => [s.id, s]));
    const wallOrder = new Map(segments.map((s, i) => [s.id, i]));
    const sorted = [...placedCabinets].sort((a, b) => {
      const wa = wallOrder.get(a.wallId) ?? 99;
      const wb = wallOrder.get(b.wallId) ?? 99;
      if (wa !== wb) return wa - wb;
      return a.offset - b.offset;
    });
    const rows: BomRow[] = [];
    let no = 1;
    for (const c of sorted) {
      const def = findCabinetDef(c.catalogId);
      const seg = segById.get(c.wallId);
      if (!def || !seg) continue;
      const offCm = c.offset * 100;
      const wCm = def.width * 100;
      const dCm = def.depth * 100;
      let cx: number;
      let cy: number;
      if (def.corner && def.cornerAcross) {
        // Bubble at the center of the corner square next to the junction.
        const atStart = offCm < seg.length - (offCm + wCm);
        const J = pointAlong(seg, atStart ? 0 : seg.length);
        const dx = seg.x2 - seg.x1;
        const dy = seg.y2 - seg.y1;
        const len = Math.hypot(dx, dy) || 1;
        const jx = (atStart ? -dx : dx) / len;
        const jy = (atStart ? -dy : dy) / len;
        cx = J.x - jx * (dCm / 2) - seg.nx * (dCm / 2);
        cy = J.y - jy * (dCm / 2) - seg.ny * (dCm / 2);
      } else {
        const P0 = pointAlong(seg, offCm + wCm / 2);
        cx = P0.x - seg.nx * (dCm / 2);
        cy = P0.y - seg.ny * (dCm / 2);
      }

      const mw = def.adeko?.manufacturingW;
      const mh = def.adeko?.manufacturingH;
      const md = def.adeko?.manufacturingD;
      const hasMfg = mw != null && mh != null && md != null && mw > 0 && mh > 0 && md > 0;
      const W = hasMfg ? mw : Math.round(def.width * 100);
      const H = hasMfg ? mh : Math.round(def.height * 100);
      const D = hasMfg ? md : Math.round(def.depth * 100);
      const dims = `${Math.round(W!)}×${Math.round(H!)}×${Math.round(D!)}`;

      const mat = woodMaterials.find((w) => w.id === c.finishWoodTypeId);
      const price = def.adeko ? adekoPriceForGrade(def.adeko, mat?.grade) : 0;

      rows.push({
        no: no++,
        cabinetId: c.id,
        code: def.adeko?.code ?? "—",
        nameAr: def.nameAr,
        nameEn: def.nameEn,
        dims,
        approxDims: !hasMfg,
        materialAr: mat?.nameAr ?? "—",
        materialEn: mat?.nameEn ?? "—",
        price,
        cx,
        cy,
        isUpper: def.level === "upper",
      });
    }
    return rows;
  }, [placedCabinets, segments, woodMaterials]);

  const totalPrice = bomRows.reduce((s, r) => s + r.price, 0);

  /* ---------- Plan geometry constants ---------- */
  const px: number[] = [];
  const py: number[] = [];
  for (const s of segments) {
    px.push(s.x1, s.x2);
    py.push(s.y1, s.y2);
  }
  const rawMinX = px.length ? Math.min(...px) : 0;
  const rawMaxX = px.length ? Math.max(...px) : 300;
  const rawMinY = py.length ? Math.min(...py) : 0;
  const rawMaxY = py.length ? Math.max(...py) : 300;
  const span = Math.max(rawMaxX - rawMinX, rawMaxY - rawMinY, 200);
  const k = Math.min(Math.max(span / 700, 0.5), 1.3);

  const WALL_T = 9 * k;
  const SYM = 1.7 * k;
  const DIM_F = 13.5 * k;
  const PAD = 130 * k;

  const minX = rawMinX - PAD;
  const maxX = rawMaxX + PAD;
  const minY = rawMinY - PAD;
  const maxY = rawMaxY + PAD;

  /* Sheet layout (viewBox units, A-landscape ratio 1.414) */
  const SHEET_W = 1404;
  const SHEET_H = 993;
  const M = 18; // sheet margin (frame)
  const RIGHT_W = 430; // right column width (BOM + legend + title block)
  const planX = M + 10;
  const planY = M + 34;
  const planW = SHEET_W - M * 2 - RIGHT_W - 26;
  const planH = SHEET_H - planY - M - 12;
  const colX = planX + planW + 14;
  const colW = RIGHT_W;

  /* Approximate printed scale (assumes A4 landscape 297mm wide) */
  const scaleRatio = useMemo(() => {
    const planCmSpanX = maxX - minX;
    const planCmSpanY = maxY - minY;
    const fit = Math.min(planW / planCmSpanX, planH / planCmSpanY);
    const mmPerSheetUnit = 297 / SHEET_W;
    const drawnMmPerCm = fit * mmPerSheetUnit;
    const ratio = 10 / drawnMmPerCm;
    const nice = [10, 15, 20, 25, 30, 40, 50, 75, 100, 125, 150, 200];
    return nice.find((n) => n >= ratio) ?? Math.ceil(ratio / 50) * 50;
  }, [minX, maxX, minY, maxY, planW, planH]);

  const today = new Date();
  const hijri = today.toLocaleDateString("ar-SA-u-ca-islamic-umalqura", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const greg = today.toLocaleDateString(isAr ? "ar-EG" : "en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  /* ---------- Dimension chain builders ---------- */
  function chainForWall(seg: WallSegment): ChainTick[] {
    const evts = new Set<number>([0, seg.length]);
    for (const c of placedCabinets) {
      if (c.wallId !== seg.id) continue;
      const def = findCabinetDef(c.catalogId);
      if (!def) continue;
      const a = c.offset * 100;
      const b = a + def.width * 100;
      if (a > 1 && a < seg.length - 1) evts.add(Math.round(a));
      if (b > 1 && b < seg.length - 1) evts.add(Math.round(b));
    }
    return Array.from(evts).sort((x, y) => x - y).map((d) => ({ d }));
  }

  /** Openings measured from the NEAREST corner: corner→near edge + width. */
  function openingSpans(seg: WallSegment): [number, number][] {
    const spans: [number, number][] = [];
    for (const o of openings) {
      if (o.wallId !== seg.id) continue;
      const a = Math.round(o.distanceFromWallStart);
      const b = Math.round(o.distanceFromWallStart + o.width);
      const fromStart = a <= seg.length - b;
      if (fromStart) {
        if (a > 0.5) spans.push([0, a]);
      } else if (b < seg.length - 0.5) {
        spans.push([b, seg.length]);
      }
      spans.push([a, b]);
    }
    return spans;
  }

  /** Renders one dimension tier at `offset` cm outside the wall. */
  function DimChain({
    seg,
    ticks,
    spans,
    offset,
    color = INK_SOFT,
  }: {
    seg: WallSegment;
    ticks?: ChainTick[];
    spans?: [number, number][];
    offset: number;
    color?: string;
  }) {
    const pairs: [number, number][] =
      spans ??
      (ticks && ticks.length >= 2
        ? ticks.slice(0, -1).map((tk, i) => [tk.d, ticks[i + 1].d] as [number, number])
        : []);
    if (pairs.length === 0) return null;
    const ox = seg.nx * offset;
    const oy = seg.ny * offset;
    const els: JSX.Element[] = [];
    const tickSet = new Set<number>();
    pairs.forEach(([d0, d1]) => {
      tickSet.add(d0);
      tickSet.add(d1);
    });
    for (let i = 0; i < pairs.length; i++) {
      const [d0, d1] = pairs[i];
      const len = d1 - d0;
      if (len < 0.5) continue;
      const A = pointAlong(seg, d0);
      const B = pointAlong(seg, d1);
      const mx = (A.x + B.x) / 2 + ox;
      const my = (A.y + B.y) / 2 + oy;
      const vertical = Math.abs(seg.x2 - seg.x1) < Math.abs(seg.y2 - seg.y1);
      els.push(
        <g key={i}>
          <line
            x1={A.x + ox}
            y1={A.y + oy}
            x2={B.x + ox}
            y2={B.y + oy}
            stroke={color}
            strokeWidth={1.1 * k}
            markerStart="url(#es-arrow)"
            markerEnd="url(#es-arrow)"
          />
          <text
            x={mx}
            y={my}
            fontSize={DIM_F}
            fontWeight={600}
            fill={color}
            textAnchor="middle"
            transform={
              vertical ? `rotate(-90 ${mx} ${my}) translate(0 ${-4 * k})` : `translate(0 ${-4 * k})`
            }
          >
            {Math.round(len)}
          </text>
        </g>
      );
    }
    // extension (witness) lines at each tick
    for (const d of Array.from(tickSet)) {
      const P = pointAlong(seg, d);
      els.push(
        <line
          key={`w${d}`}
          x1={P.x + seg.nx * (WALL_T * 0.7)}
          y1={P.y + seg.ny * (WALL_T * 0.7)}
          x2={P.x + ox + seg.nx * 6 * k}
          y2={P.y + oy + seg.ny * 6 * k}
          stroke={color}
          strokeWidth={0.7 * k}
        />
      );
    }
    return <g>{els}</g>;
  }

  const usedUtilKinds = Array.from(new Set(utilities.map((u) => u.kind)));

  /* ---------- PDF export ---------- */
  const handleExport = async (paper: "a4" | "a3") => {
    const svg = svgRef.current;
    if (!svg) return;
    setExporting(paper);
    try {
      const jsPDFModule = await import("jspdf");
      const jsPDF = jsPDFModule.default || jsPDFModule.jsPDF;

      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const xml = new XMLSerializer().serializeToString(clone);
      const svgUrl = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));

      const targetW = paper === "a3" ? 4200 : 3000; // ~250-300 dpi
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("svg render failed"));
        img.src = svgUrl;
      });
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = Math.round((targetW * SHEET_H) / SHEET_W);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas ctx");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(svgUrl);
      const png = canvas.toDataURL("image/png");

      const pageW = paper === "a3" ? 420 : 297;
      const pageH = paper === "a3" ? 297 : 210;
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: paper });
      doc.addImage(png, "PNG", 0, 0, pageW, pageH);
      doc.save(`teak-kitchen-plan-${paper}.pdf`);
    } catch {
      /* toast-free failure: keep dialog usable */
    } finally {
      setExporting(null);
    }
  };

  /* ---------- BOM table geometry (SVG) ---------- */
  const legendH = usedUtilKinds.length > 0 ? 34 + usedUtilKinds.length * 24 + 30 : 64;
  const titleBlockH = 148;
  const bomY = M + 34;
  const bomAvailH = SHEET_H - bomY - M - titleBlockH - legendH - 24;
  const headH = 26;
  const rowH = Math.max(15, Math.min(24, (bomAvailH - headH - 30) / Math.max(bomRows.length, 1)));
  const maxRows = Math.floor((bomAvailH - headH - 30) / rowH);
  const shownRows = bomRows.slice(0, maxRows);
  const bomFont = rowH >= 20 ? 11.5 : rowH >= 17 ? 10 : 9;

  // Column layout inside colW (RTL: rightmost = رقم)
  const cols = [
    { w: 26, ar: "م", en: "#" },
    { w: 62, ar: "الكود", en: "Code" },
    { w: 118, ar: "الاسم", en: "Name" },
    { w: 82, ar: "مقاس التصنيع", en: "Mfg W×H×D" },
    { w: 56, ar: "الخامة", en: "Material" },
    { w: 43, ar: "السعر", en: "Price" },
    { w: 43, ar: "الإجمالي", en: "Total" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[98vw] w-[98vw] h-[96vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogTitle className="sr-only">
          {t("المخطط الهندسي الرسمي", "Formal engineering drawing")}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t("عارض قراءة فقط للمخطط الهندسي مع جدول حصر الكميات", "Read-only engineering drawing viewer with BOM")}
        </DialogDescription>

        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-2 shrink-0">
          <span className="font-extrabold text-sm">
            {t("المخطط الهندسي — مسقط أفقي", "Engineering drawing — Floor plan")}
          </span>
          <span className="text-[11px] text-muted-foreground font-bold">
            {t("قراءة فقط", "Read-only")}
          </span>
          <div className="ms-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="font-bold"
              disabled={exporting !== null}
              onClick={() => handleExport("a4")}
              data-testid="button-export-plan-a4"
            >
              {exporting === "a4" ? (
                <Loader2 className="w-4 h-4 me-1 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4 me-1" />
              )}
              {t("تصدير PDF (A4)", "Export PDF (A4)")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="font-bold"
              disabled={exporting !== null}
              onClick={() => handleExport("a3")}
              data-testid="button-export-plan-a3"
            >
              {exporting === "a3" ? (
                <Loader2 className="w-4 h-4 me-1 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4 me-1" />
              )}
              {t("تصدير PDF (A3)", "Export PDF (A3)")}
            </Button>
          </div>
        </div>

        {/* Sheet */}
        <div className="flex-1 overflow-auto bg-muted/40 p-4 flex items-start justify-center">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${SHEET_W} ${SHEET_H}`}
            className="bg-white rounded shadow-lg max-w-full h-auto"
            style={{ aspectRatio: `${SHEET_W}/${SHEET_H}`, direction: "ltr" }}
            fontFamily="Zain, 'Segoe UI', Tahoma, sans-serif"
            data-testid="svg-engineering-sheet"
          >
            {/* Paper + frame */}
            <rect x={0} y={0} width={SHEET_W} height={SHEET_H} fill={PAPER} />
            <rect
              x={M}
              y={M}
              width={SHEET_W - M * 2}
              height={SHEET_H - M * 2}
              fill="none"
              stroke={INK}
              strokeWidth={2.2}
            />
            <rect
              x={M + 5}
              y={M + 5}
              width={SHEET_W - (M + 5) * 2}
              height={SHEET_H - (M + 5) * 2}
              fill="none"
              stroke={INK_SOFT}
              strokeWidth={0.7}
            />

            {/* Sheet header strip */}
            <text
              x={SHEET_W / 2}
              y={M + 24}
              textAnchor="middle"
              fontSize={17}
              fontWeight={800}
              fill={INK}
            >
              {isAr ? "مخطط مطبخ — مسقط أفقي" : "Kitchen plan — Top view"}
            </text>
            <text x={planX + 6} y={M + 24} fontSize={11} fontWeight={700} fill={TEAK_RED}>
              TEAK
            </text>

            {/* ======= Plan area (nested svg keeps its own scale) ======= */}
            <svg
              x={planX}
              y={planY}
              width={planW}
              height={planH}
              viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <marker
                  id="es-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="8"
                  markerHeight="8"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill={INK_SOFT} />
                </marker>
                <pattern
                  id="es-hatch"
                  width={7 * k}
                  height={7 * k}
                  patternTransform="rotate(45)"
                  patternUnits="userSpaceOnUse"
                >
                  <line x1="0" y1="0" x2="0" y2={7 * k} stroke="#c8ccd0" strokeWidth={1 * k} />
                </pattern>
              </defs>

              {/* Light reference grid (50cm) */}
              {Array.from(
                { length: Math.floor((maxX - minX) / 50) + 1 },
                (_, i) => Math.ceil(minX / 50) * 50 + i * 50
              ).map((gx) => (
                <line key={`gx${gx}`} x1={gx} y1={minY} x2={gx} y2={maxY} stroke={GRID} strokeWidth={0.6 * k} />
              ))}
              {Array.from(
                { length: Math.floor((maxY - minY) / 50) + 1 },
                (_, i) => Math.ceil(minY / 50) * 50 + i * 50
              ).map((gy) => (
                <line key={`gy${gy}`} x1={minX} y1={gy} x2={maxX} y2={gy} stroke={GRID} strokeWidth={0.6 * k} />
              ))}

              {/* Walls interrupted at openings */}
              {segments.map((seg) => {
                const segOpenings = openings
                  .filter((o) => o.wallId === seg.id)
                  .sort((a, b) => a.distanceFromWallStart - b.distanceFromWallStart);
                const pieces: [number, number][] = [];
                let cursor = 0;
                for (const o of segOpenings) {
                  if (o.distanceFromWallStart > cursor) pieces.push([cursor, o.distanceFromWallStart]);
                  cursor = Math.max(cursor, o.distanceFromWallStart + o.width);
                }
                if (cursor < seg.length) pieces.push([cursor, seg.length]);
                const mid = pointAlong(seg, seg.length / 2);
                return (
                  <g key={seg.id}>
                    {pieces.map(([d0, d1], i) => {
                      const p0 = pointAlong(seg, d0);
                      const p1 = pointAlong(seg, d1);
                      return (
                        <line
                          key={i}
                          x1={p0.x}
                          y1={p0.y}
                          x2={p1.x}
                          y2={p1.y}
                          stroke={INK}
                          strokeWidth={WALL_T}
                          strokeLinecap="butt"
                        />
                      );
                    })}
                    {/* Wall tag */}
                    <text
                      x={mid.x + seg.nx * 26 * k}
                      y={mid.y + seg.ny * 26 * k}
                      fontSize={12 * k}
                      fontWeight={800}
                      fill={TEAK_RED}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {isAr ? wallLabelAr(seg.id) : wallLabelEn(seg.id)}
                    </text>
                    {/* Tier 1: overall wall dimension */}
                    <DimChain
                      seg={seg}
                      ticks={[{ d: 0 }, { d: seg.length }]}
                      offset={86 * k}
                      color={INK}
                    />
                    {/* Tier 2: cabinet chain */}
                    <DimChain seg={seg} ticks={chainForWall(seg)} offset={56 * k} />
                    {/* Tier 3: opening positions from corners */}
                    {openings.some((o) => o.wallId === seg.id) && (
                      <DimChain
                        seg={seg}
                        spans={openingSpans(seg)}
                        offset={30 * k}
                        color="#b8860b"
                      />
                    )}
                  </g>
                );
              })}

              {/* Cabinet footprints: base solid + hatch, upper dashed, L-corners as L */}
              {placedCabinets.map((c) => {
                const seg = segments.find((s) => s.id === c.wallId);
                const def = findCabinetDef(c.catalogId);
                if (!seg || !def) return null;
                const offCm = c.offset * 100;
                const wCm = def.width * 100;
                const dCm = def.depth * 100;
                const ix = -seg.nx;
                const iy = -seg.ny;
                const isUpper = def.level === "upper";
                const style = {
                  fill: isUpper ? "none" : "url(#es-hatch)",
                  stroke: isUpper ? INK_SOFT : INK,
                  strokeWidth: SYM * (isUpper ? 0.8 : 1.1),
                  strokeDasharray: isUpper ? `${6 * k} ${4 * k}` : undefined,
                };
                if (def.corner && def.cornerAcross) {
                  // L-corner: arm 1 along this wall + arm 2 along the adjacent wall.
                  const acrossCm = def.cornerAcross * 100;
                  const { ux, uy } = unitDir(seg);
                  const atStart = offCm < seg.length - (offCm + wCm);
                  // u points from the cabinet body toward the junction.
                  const jx = atStart ? -ux : ux;
                  const jy = atStart ? -uy : uy;
                  const J = pointAlong(seg, atStart ? 0 : seg.length);
                  const pts = [
                    [J.x - jx * wCm, J.y - jy * wCm],
                    [J.x, J.y],
                    [J.x + ix * acrossCm, J.y + iy * acrossCm],
                    [J.x - jx * dCm + ix * acrossCm, J.y - jy * dCm + iy * acrossCm],
                    [J.x - jx * dCm + ix * dCm, J.y - jy * dCm + iy * dCm],
                    [J.x - jx * wCm + ix * dCm, J.y - jy * wCm + iy * dCm],
                  ]
                    .map((p) => p.join(","))
                    .join(" ");
                  return <polygon key={c.id} points={pts} {...style} />;
                }
                const P0 = pointAlong(seg, offCm);
                const P1 = pointAlong(seg, offCm + wCm);
                const pts = [
                  `${P0.x},${P0.y}`,
                  `${P1.x},${P1.y}`,
                  `${P1.x + ix * dCm},${P1.y + iy * dCm}`,
                  `${P0.x + ix * dCm},${P0.y + iy * dCm}`,
                ].join(" ");
                return <polygon key={c.id} points={pts} {...style} />;
              })}

              {/* Numbered bubbles */}
              {bomRows.map((r) => (
                <g key={r.cabinetId}>
                  <circle
                    cx={r.cx}
                    cy={r.cy}
                    r={13 * k}
                    fill={PAPER}
                    stroke={r.isUpper ? INK_SOFT : TEAK_RED}
                    strokeWidth={1.6 * k}
                  />
                  <text
                    x={r.cx}
                    y={r.cy + 0.5 * k}
                    fontSize={12.5 * k}
                    fontWeight={800}
                    fill={INK}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {r.no}
                  </text>
                </g>
              ))}

              {/* Openings symbols */}
              {openings.map((o) => {
                const seg = segments.find((s) => s.id === o.wallId);
                if (!seg) return null;
                const { ux, uy } = unitDir(seg);
                const swingOut = o.type === "door" && o.swing === "out";
                const ix = swingOut ? seg.nx : -seg.nx;
                const iy = swingOut ? seg.ny : -seg.ny;
                const S = pointAlong(seg, o.distanceFromWallStart);
                const E = pointAlong(seg, o.distanceFromWallStart + o.width);
                const w = o.width;
                const jamb = WALL_T * 0.9;
                const jambLine = (P: { x: number; y: number }, key: string) => (
                  <line
                    key={key}
                    x1={P.x + seg.nx * jamb * 0.6}
                    y1={P.y + seg.ny * jamb * 0.6}
                    x2={P.x - seg.nx * jamb * 0.6}
                    y2={P.y - seg.ny * jamb * 0.6}
                    stroke={INK}
                    strokeWidth={SYM}
                  />
                );
                if (o.type === "door") {
                  const hingeEnd = o.hinge === "end";
                  const H = hingeEnd ? E : S;
                  const J = hingeEnd ? S : E;
                  const tip = { x: H.x + ix * w, y: H.y + iy * w };
                  const cross = ux * iy - uy * ix;
                  let sweep = cross > 0 ? 0 : 1;
                  if (hingeEnd) sweep = sweep === 0 ? 1 : 0;
                  return (
                    <g key={o.id}>
                      {jambLine(S, "j1")}
                      {jambLine(E, "j2")}
                      <line x1={H.x} y1={H.y} x2={tip.x} y2={tip.y} stroke={INK} strokeWidth={SYM} />
                      <path
                        d={`M ${tip.x} ${tip.y} A ${w} ${w} 0 0 ${sweep} ${J.x} ${J.y}`}
                        fill="none"
                        stroke={INK_SOFT}
                        strokeWidth={SYM * 0.75}
                        strokeDasharray={`${4 * k} ${3 * k}`}
                      />
                    </g>
                  );
                }
                const off = WALL_T * 0.38;
                return (
                  <g key={o.id}>
                    {jambLine(S, "j1")}
                    {jambLine(E, "j2")}
                    {[-off, 0, off].map((d, i) => (
                      <line
                        key={i}
                        x1={S.x + seg.nx * d}
                        y1={S.y + seg.ny * d}
                        x2={E.x + seg.nx * d}
                        y2={E.y + seg.ny * d}
                        stroke="#2673d9"
                        strokeWidth={SYM * 0.7}
                      />
                    ))}
                  </g>
                );
              })}

              {/* Utility symbols */}
              {utilities.map((u) => {
                const style = UTILITY_STYLE[u.kind];
                if (!style) return null;
                const seg = u.wallId ? segments.find((s) => s.id === u.wallId) : undefined;
                const P = seg
                  ? pointAlong(seg, Math.min(Math.max(u.positionAlongWall ?? 0, 0), seg.length))
                  : { x: u.x ?? 0, y: u.y ?? 0 };
                const R = 12 * k;
                return (
                  <g key={u.id}>
                    <circle cx={P.x} cy={P.y} r={R} fill={PAPER} stroke={style.color} strokeWidth={1.6 * k} />
                    <text
                      x={P.x}
                      y={P.y + 0.5 * k}
                      fontSize={11 * k}
                      fontWeight={800}
                      fill={style.color}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {isAr ? style.letterAr : style.letterEn}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* ======= Right column ======= */}
            {/* BOM table */}
            <g>
              <text
                x={colX + colW}
                y={bomY - 8}
                fontSize={14}
                fontWeight={800}
                fill={INK}
                textAnchor="end"
              >
                {isAr ? "جدول حصر الكميات" : "Bill of quantities"}
              </text>
              {/* Header */}
              {(() => {
                const els: JSX.Element[] = [];
                let x = colX + colW; // draw right → left (RTL columns)
                cols.forEach((c, ci) => {
                  x -= c.w;
                  els.push(
                    <g key={`h${ci}`}>
                      <rect x={x} y={bomY} width={c.w} height={headH} fill="#f2f3f5" stroke={INK_SOFT} strokeWidth={0.7} />
                      <text
                        x={x + c.w / 2}
                        y={bomY + headH / 2 + 1}
                        fontSize={10.5}
                        fontWeight={800}
                        fill={INK}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        {isAr ? c.ar : c.en}
                      </text>
                    </g>
                  );
                });
                return els;
              })()}
              {/* Rows */}
              {shownRows.map((r, ri) => {
                const y = bomY + headH + ri * rowH;
                const cells = [
                  String(r.no),
                  r.code,
                  isAr ? r.nameAr : r.nameEn,
                  r.dims + (r.approxDims ? " *" : ""),
                  isAr ? r.materialAr : r.materialEn,
                  r.price > 0 ? Math.round(r.price).toLocaleString("en-US") : "—",
                  r.price > 0 ? Math.round(r.price).toLocaleString("en-US") : "—",
                ];
                const els: JSX.Element[] = [];
                let x = colX + colW;
                cols.forEach((c, ci) => {
                  x -= c.w;
                  const label = cells[ci];
                  const maxChars = Math.floor(c.w / (bomFont * 0.52));
                  const shown = label.length > maxChars ? label.slice(0, maxChars - 1) + "…" : label;
                  els.push(
                    <g key={`c${ci}`}>
                      <rect
                        x={x}
                        y={y}
                        width={c.w}
                        height={rowH}
                        fill={ri % 2 ? "#fafbfc" : PAPER}
                        stroke="#d7dadd"
                        strokeWidth={0.5}
                      />
                      <text
                        x={x + c.w / 2}
                        y={y + rowH / 2 + 0.5}
                        fontSize={bomFont}
                        fill={INK}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        {shown}
                      </text>
                    </g>
                  );
                });
                return <g key={r.cabinetId}>{els}</g>;
              })}
              {bomRows.length > shownRows.length && (
                <text
                  x={colX + colW}
                  y={bomY + headH + shownRows.length * rowH + 12}
                  fontSize={9.5}
                  fill={INK_SOFT}
                  textAnchor="end"
                >
                  {isAr
                    ? `+ ${bomRows.length - shownRows.length} صنف إضافي غير معروض`
                    : `+ ${bomRows.length - shownRows.length} more items not shown`}
                </text>
              )}
              {/* Total + footnote */}
              <text
                x={colX + colW}
                y={bomY + headH + shownRows.length * rowH + (bomRows.length > shownRows.length ? 30 : 18)}
                fontSize={12.5}
                fontWeight={800}
                fill={TEAK_RED}
                textAnchor="end"
              >
                {isAr
                  ? `الإجمالي التقديري: ${Math.round(totalPrice).toLocaleString("en-US")} ر.س`
                  : `Estimated total: ${Math.round(totalPrice).toLocaleString("en-US")} SAR`}
              </text>
              {bomRows.some((r) => r.approxDims) && (
                <text
                  x={colX + colW}
                  y={bomY + headH + shownRows.length * rowH + (bomRows.length > shownRows.length ? 46 : 34)}
                  fontSize={9.5}
                  fill={INK_SOFT}
                  textAnchor="end"
                >
                  {isAr
                    ? "* مقاسات تصميمية — مقاس التصنيع غير مسجل بعد"
                    : "* Design dims — manufacturing size not recorded yet"}
                </text>
              )}
            </g>

            {/* Legend */}
            <g>
              {(() => {
                const ly = SHEET_H - M - titleBlockH - legendH;
                const items: { color: string; ar: string; en: string; swatch: "circle" | "solid" | "dashed" }[] = [
                  { color: INK, ar: "خزانة سفلية", en: "Base cabinet", swatch: "solid" },
                  { color: INK_SOFT, ar: "خزانة علوية (متقطع)", en: "Wall cabinet (dashed)", swatch: "dashed" },
                  ...usedUtilKinds.map((kd) => ({
                    color: UTILITY_STYLE[kd]?.color ?? INK,
                    ar: UTILITY_STYLE[kd]?.labelAr ?? kd,
                    en: UTILITY_STYLE[kd]?.labelEn ?? kd,
                    swatch: "circle" as const,
                  })),
                ];
                return (
                  <g>
                    <rect x={colX} y={ly} width={colW} height={legendH} fill="none" stroke={INK_SOFT} strokeWidth={0.8} />
                    <text x={colX + colW - 8} y={ly + 18} fontSize={12} fontWeight={800} fill={INK} textAnchor="end">
                      {isAr ? "مفتاح الرموز" : "Legend"}
                    </text>
                    {items.map((it, i) => {
                      const iy = ly + 34 + i * 22;
                      return (
                        <g key={i}>
                          {it.swatch === "circle" ? (
                            <circle cx={colX + colW - 18} cy={iy} r={7} fill={PAPER} stroke={it.color} strokeWidth={1.6} />
                          ) : (
                            <line
                              x1={colX + colW - 30}
                              y1={iy}
                              x2={colX + colW - 8}
                              y2={iy}
                              stroke={it.color}
                              strokeWidth={2.4}
                              strokeDasharray={it.swatch === "dashed" ? "5 4" : undefined}
                            />
                          )}
                          <text x={colX + colW - 40} y={iy + 1} fontSize={10.5} fill={INK} textAnchor="end" dominantBaseline="middle">
                            {isAr ? it.ar : it.en}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              })()}
            </g>

            {/* Title block */}
            <g>
              {(() => {
                const ty = SHEET_H - M - titleBlockH;
                const rows: [string, string][] = [
                  [isAr ? "العنوان" : "Title", isAr ? "مخطط مطبخ — مسقط أفقي" : "Kitchen plan — top view"],
                  [isAr ? "العميل" : "Client", customerName || "—"],
                  [isAr ? "التاريخ" : "Date", isAr ? `${hijri}  (${greg})` : `${greg}`],
                  [isAr ? "المقياس" : "Scale", `1:${scaleRatio}`],
                  [isAr ? "رقم اللوحة" : "Sheet no.", "KT-01"],
                ];
                const rh = (titleBlockH - 34) / rows.length;
                return (
                  <g>
                    <rect x={colX} y={ty} width={colW} height={titleBlockH} fill="none" stroke={INK} strokeWidth={1.6} />
                    <rect x={colX} y={ty} width={colW} height={30} fill={TEAK_RED} />
                    <text x={colX + colW / 2} y={ty + 16} fontSize={13.5} fontWeight={800} fill="#ffffff" textAnchor="middle" dominantBaseline="middle">
                      {isAr ? "تيك للتصنيع — TEAK" : "TEAK Manufacturing"}
                    </text>
                    {rows.map(([lab, val], i) => {
                      const ry = ty + 30 + i * rh + 4;
                      return (
                        <g key={i}>
                          <line x1={colX} y1={ty + 30 + i * rh} x2={colX + colW} y2={ty + 30 + i * rh} stroke="#d7dadd" strokeWidth={0.6} />
                          <text x={colX + colW - 8} y={ry + rh / 2 - 2} fontSize={10.5} fontWeight={800} fill={INK_SOFT} textAnchor="end" dominantBaseline="middle">
                            {lab}
                          </text>
                          <text x={colX + 8} y={ry + rh / 2 - 2} fontSize={10.5} fontWeight={600} fill={INK} textAnchor="start" dominantBaseline="middle">
                            {val}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              })()}
            </g>
          </svg>
        </div>
      </DialogContent>
    </Dialog>
  );
}
