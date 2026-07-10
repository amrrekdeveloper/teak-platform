import { useRef, useState, useCallback } from "react";
import {
  type KitchenLayout,
  type KitchenWall,
  type KitchenOpening,
  clampWallLength,
} from "@/components/kitchen-tool/store";

export interface WallSegment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  length: number;
  nx: number;
  ny: number;
}

const PARALLEL_GAP = 300;

export function getWallSegments(layout: KitchenLayout, walls: KitchenWall[]): WallSegment[] {
  const len = (i: number) => clampWallLength(walls[i]?.length ?? NaN);
  switch (layout) {
    case "I": {
      const a = len(0);
      return [{ id: "A", x1: 0, y1: 0, x2: a, y2: 0, length: a, nx: 0, ny: -1 }];
    }
    case "L": {
      const a = len(0);
      const b = len(1);
      return [
        { id: "A", x1: 0, y1: 0, x2: a, y2: 0, length: a, nx: 0, ny: -1 },
        { id: "B", x1: a, y1: 0, x2: a, y2: b, length: b, nx: 1, ny: 0 },
      ];
    }
    case "U": {
      const a = len(0);
      const b = len(1);
      const c = len(2);
      return [
        { id: "A", x1: 0, y1: 0, x2: a, y2: 0, length: a, nx: 0, ny: -1 },
        { id: "B", x1: a, y1: 0, x2: a, y2: b, length: b, nx: 1, ny: 0 },
        { id: "C", x1: 0, y1: 0, x2: 0, y2: c, length: c, nx: -1, ny: 0 },
      ];
    }
    case "parallel": {
      const a = len(0);
      const b = len(1);
      return [
        { id: "A", x1: 0, y1: 0, x2: a, y2: 0, length: a, nx: 0, ny: -1 },
        { id: "B", x1: 0, y1: PARALLEL_GAP, x2: b, y2: PARALLEL_GAP, length: b, nx: 0, ny: 1 },
      ];
    }
  }
}

export function wallLabelAr(id: string): string {
  switch (id) {
    case "A":
      return "الجدار أ";
    case "B":
      return "الجدار ب";
    case "C":
      return "الجدار ج";
    default:
      return `الجدار ${id}`;
  }
}

export function wallLabelEn(id: string): string {
  return `Wall ${id}`;
}

function pointAlong(seg: WallSegment, d: number): { x: number; y: number } {
  const t = seg.length > 0 ? d / seg.length : 0;
  return { x: seg.x1 + (seg.x2 - seg.x1) * t, y: seg.y1 + (seg.y2 - seg.y1) * t };
}

/** Unit direction vector along the wall (start → end). */
function unitDir(seg: WallSegment): { ux: number; uy: number } {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  const len = Math.hypot(dx, dy) || 1;
  return { ux: dx / len, uy: dy / len };
}

interface PlanSvgProps {
  layout: KitchenLayout;
  walls: KitchenWall[];
  openings?: KitchenOpening[];
  selectedOpeningId?: string | null;
  draggingOpeningId?: string | null;
  onSelectOpening?: (id: string) => void;
  onDragOpening?: (id: string, desiredDistance: number) => void;
  onDragEnd?: () => void;
  className?: string;
  t: (ar: string, en: string) => string;
}

export default function KitchenPlanSvg({
  layout,
  walls,
  openings = [],
  selectedOpeningId = null,
  draggingOpeningId = null,
  onSelectOpening,
  onDragOpening,
  onDragEnd,
  className,
  t,
}: PlanSvgProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ id: string; offset: number; wallId: string } | null>(null);
  const [, forceRender] = useState(0);

  const segments = getWallSegments(layout, walls);
  const segById = new Map(segments.map((s) => [s.id, s]));

  const dragCbRef = useRef(onDragOpening);
  dragCbRef.current = onDragOpening;
  const dragEndCbRef = useRef(onDragEnd);
  dragEndCbRef.current = onDragEnd;
  const segByIdRef = useRef(segById);
  segByIdRef.current = segById;

  // Content bounds: wall endpoints + inward reach of door swing arcs
  const px: number[] = [];
  const py: number[] = [];
  for (const s of segments) {
    px.push(s.x1, s.x2);
    py.push(s.y1, s.y2);
  }
  for (const o of openings) {
    const seg = segById.get(o.wallId);
    if (!seg) continue;
    const reach = o.type === "door" ? o.width : 12;
    // Door swing side: "out" mirrors the symbol to the outside of the room
    const sideSign = o.type === "door" && o.swing === "out" ? 1 : -1;
    const a = pointAlong(seg, o.distanceFromWallStart);
    const b = pointAlong(seg, o.distanceFromWallStart + o.width);
    px.push(a.x + sideSign * seg.nx * reach, b.x + sideSign * seg.nx * reach);
    py.push(a.y + sideSign * seg.ny * reach, b.y + sideSign * seg.ny * reach);
  }
  const rawMinX = Math.min(...px);
  const rawMaxX = Math.max(...px);
  const rawMinY = Math.min(...py);
  const rawMaxY = Math.max(...py);

  // Scale factor: keeps text/stroke sizes visually consistent for small and large kitchens
  const span = Math.max(rawMaxX - rawMinX, rawMaxY - rawMinY, 200);
  const k = Math.min(Math.max(span / 700, 0.5), 1.3);

  const PADDING = 92 * k;
  const WALL_T = 9 * k;
  const DIM_OFFSET = 44 * k;
  const DIM_FONT = 15 * k;
  const SYM_STROKE = 1.8 * k;
  const HIT_BAND = 17 * k;

  const minX = rawMinX - PADDING;
  const maxX = rawMaxX + PADDING;
  const minY = rawMinY - PADDING;
  const maxY = rawMaxY + PADDING;

  const toSvgPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  }, []);

  const distanceAlongWall = useCallback(
    (seg: WallSegment, x: number, y: number) => {
      const dx = seg.x2 - seg.x1;
      const dy = seg.y2 - seg.y1;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) return 0;
      const tRaw = ((x - seg.x1) * dx + (y - seg.y1) * dy) / lenSq;
      return tRaw * seg.length;
    },
    []
  );

  const handlePointerDown = (e: React.PointerEvent, opening: KitchenOpening) => {
    if (!onDragOpening) return;
    const seg = segById.get(opening.wallId);
    const pt = toSvgPoint(e.clientX, e.clientY);
    if (!seg || !pt) return;
    e.stopPropagation();
    e.preventDefault();
    const along = distanceAlongWall(seg, pt.x, pt.y);
    dragRef.current = {
      id: opening.id,
      offset: along - opening.distanceFromWallStart,
      wallId: opening.wallId,
    };
    onSelectOpening?.(opening.id);
    forceRender((n) => n + 1);

    const onWindowMove = (ev: PointerEvent) => {
      const drag = dragRef.current;
      const cb = dragCbRef.current;
      if (!drag || !cb) return;
      const s = segByIdRef.current.get(drag.wallId);
      const p = toSvgPoint(ev.clientX, ev.clientY);
      if (!s || !p) return;
      const alongNow = distanceAlongWall(s, p.x, p.y);
      cb(drag.id, alongNow - drag.offset);
    };
    const onWindowUp = () => {
      window.removeEventListener("pointermove", onWindowMove);
      window.removeEventListener("pointerup", onWindowUp);
      window.removeEventListener("pointercancel", onWindowUp);
      if (dragRef.current) {
        dragRef.current = null;
        dragEndCbRef.current?.();
        forceRender((n) => n + 1);
      }
    };
    window.addEventListener("pointermove", onWindowMove);
    window.addEventListener("pointerup", onWindowUp);
    window.addEventListener("pointercancel", onWindowUp);
  };

  const isDraggingNow = dragRef.current !== null;

  const floorMinX = Math.min(...segments.map((s) => Math.min(s.x1, s.x2)));
  const floorMinY = Math.min(...segments.map((s) => Math.min(s.y1, s.y2)));
  const floorW =
    Math.max(...segments.map((s) => Math.max(s.x1, s.x2))) - floorMinX;
  const floorH = Math.max(
    Math.max(...segments.map((s) => Math.max(s.y1, s.y2))) - floorMinY,
    120
  );

  return (
    <svg
      ref={svgRef}
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      className={className}
      data-testid="svg-kitchen-plan"
    >
      <defs>
        <marker
          id="kt-dim-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 10 5 L 0 9 z" className="fill-muted-foreground" />
        </marker>
      </defs>

      {/* Floor */}
      <rect
        x={floorMinX}
        y={floorMinY}
        width={Math.max(floorW, 120)}
        height={floorH}
        className="fill-muted/30"
      />

      {/* Walls drawn as pieces interrupted by openings */}
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
                  strokeWidth={WALL_T}
                  strokeLinecap="butt"
                  className="stroke-foreground/60"
                />
              );
            })}
            <DimensionLabel seg={seg} t={t} k={k} dimOffset={DIM_OFFSET} font={DIM_FONT} />
          </g>
        );
      })}

      {/* Openings as architectural symbols */}
      {openings.map((o) => {
        const seg = segById.get(o.wallId);
        if (!seg) return null;
        const { ux, uy } = unitDir(seg);
        // Symbol side: inward by default, mirrored outward when door swing = "out"
        const swingOut = o.type === "door" && o.swing === "out";
        const ix = swingOut ? seg.nx : -seg.nx;
        const iy = swingOut ? seg.ny : -seg.ny;
        const S = pointAlong(seg, o.distanceFromWallStart);
        const E = pointAlong(seg, o.distanceFromWallStart + o.width);
        const w = o.width;
        const isSelected = o.id === selectedOpeningId;
        const isDragged =
          o.id === draggingOpeningId || (isDraggingNow && dragRef.current?.id === o.id);

        // Jamb caps (wall ends at the gap)
        const jamb = WALL_T * 0.9;
        const jambLine = (P: { x: number; y: number }, key: string) => (
          <line
            key={key}
            x1={P.x + seg.nx * jamb * 0.6}
            y1={P.y + seg.ny * jamb * 0.6}
            x2={P.x - seg.nx * jamb * 0.6}
            y2={P.y - seg.ny * jamb * 0.6}
            strokeWidth={SYM_STROKE}
            className="stroke-foreground/70"
          />
        );

        let symbol: JSX.Element;
        if (o.type === "door") {
          // Door leaf from hinge S into the room + quarter-circle swing arc to E
          const tip = { x: S.x + ix * w, y: S.y + iy * w };
          const cross = ux * iy - uy * ix;
          const sweep = cross > 0 ? 0 : 1;
          symbol = (
            <g style={{ pointerEvents: "none" }}>
              {jambLine(S, "j1")}
              {jambLine(E, "j2")}
              <line
                x1={S.x}
                y1={S.y}
                x2={tip.x}
                y2={tip.y}
                strokeWidth={SYM_STROKE}
                className="stroke-foreground/70"
              />
              <path
                d={`M ${tip.x} ${tip.y} A ${w} ${w} 0 0 ${sweep} ${E.x} ${E.y}`}
                fill="none"
                strokeWidth={SYM_STROKE * 0.8}
                strokeDasharray={`${4 * k} ${3 * k}`}
                className="stroke-foreground/50"
              />
            </g>
          );
        } else {
          // Window: triple parallel thin lines across the gap
          const off = WALL_T * 0.38;
          const lines = [-off, 0, off].map((d, i) => (
            <line
              key={i}
              x1={S.x + seg.nx * d}
              y1={S.y + seg.ny * d}
              x2={E.x + seg.nx * d}
              y2={E.y + seg.ny * d}
              strokeWidth={SYM_STROKE * 0.8}
              className="stroke-sky-600/80"
            />
          ));
          symbol = (
            <g style={{ pointerEvents: "none" }}>
              {jambLine(S, "j1")}
              {jambLine(E, "j2")}
              {lines}
            </g>
          );
        }

        // Selection outline (subtle Teak red)
        const selMargin = HIT_BAND * 0.85;
        const selRect = (() => {
          const xs = [
            S.x + seg.nx * selMargin,
            S.x - seg.nx * selMargin,
            E.x + seg.nx * selMargin,
            E.x - seg.nx * selMargin,
          ];
          const ys = [
            S.y + seg.ny * selMargin,
            S.y - seg.ny * selMargin,
            E.y + seg.ny * selMargin,
            E.y - seg.ny * selMargin,
          ];
          return {
            x: Math.min(...xs),
            y: Math.min(...ys),
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys),
          };
        })();

        return (
          <g key={o.id}>
            {symbol}
            {isSelected && (
              <rect
                {...selRect}
                rx={4 * k}
                fill="none"
                strokeWidth={SYM_STROKE * 0.9}
                strokeDasharray={`${5 * k} ${4 * k}`}
                className="stroke-primary/80"
                style={{ pointerEvents: "none" }}
              />
            )}
            {/* Invisible drag/click hit zone over the gap */}
            <rect
              x={selRect.x}
              y={selRect.y}
              width={selRect.width}
              height={selRect.height}
              fill="transparent"
              onPointerDown={(e) => handlePointerDown(e, o)}
              onClick={(e) => {
                e.stopPropagation();
                onSelectOpening?.(o.id);
              }}
              style={{ cursor: onDragOpening ? "grab" : "default", touchAction: "none" }}
              data-testid={`opening-${o.id}`}
            />
            {(isSelected || isDragged) && (
              <OpeningDistanceLabels seg={seg} opening={o} k={k} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

function DimensionLabel({
  seg,
  t,
  k,
  dimOffset,
  font,
}: {
  seg: WallSegment;
  t: (ar: string, en: string) => string;
  k: number;
  dimOffset: number;
  font: number;
}) {
  const dx1 = seg.x1 + seg.nx * dimOffset;
  const dy1 = seg.y1 + seg.ny * dimOffset;
  const dx2 = seg.x2 + seg.nx * dimOffset;
  const dy2 = seg.y2 + seg.ny * dimOffset;
  const midX = (dx1 + dx2) / 2;
  const midY = (dy1 + dy2) / 2;
  const vertical = Math.abs(seg.x2 - seg.x1) < 0.001;
  // Text sits slightly beyond the dimension line, rotated along vertical walls
  const tx = midX + seg.nx * font * 0.9;
  const ty = midY + seg.ny * font * 0.9;
  const rotate = vertical ? (seg.nx > 0 ? 90 : -90) : 0;
  const label = `${Math.round(seg.length)} ${t("سم", "cm")} — ${t(
    wallLabelAr(seg.id),
    wallLabelEn(seg.id)
  )}`;
  return (
    <g data-testid={`dim-wall-${seg.id}`} style={{ pointerEvents: "none" }}>
      {/* Extension lines */}
      <line
        x1={seg.x1 + seg.nx * 8 * k}
        y1={seg.y1 + seg.ny * 8 * k}
        x2={dx1 + seg.nx * 4 * k}
        y2={dy1 + seg.ny * 4 * k}
        strokeWidth={1 * k}
        className="stroke-muted-foreground/50"
      />
      <line
        x1={seg.x2 + seg.nx * 8 * k}
        y1={seg.y2 + seg.ny * 8 * k}
        x2={dx2 + seg.nx * 4 * k}
        y2={dy2 + seg.ny * 4 * k}
        strokeWidth={1 * k}
        className="stroke-muted-foreground/50"
      />
      {/* Dimension line with arrowheads */}
      <line
        x1={dx1}
        y1={dy1}
        x2={dx2}
        y2={dy2}
        strokeWidth={1.1 * k}
        className="stroke-muted-foreground"
        markerStart="url(#kt-dim-arrow)"
        markerEnd="url(#kt-dim-arrow)"
      />
      <text
        x={tx}
        y={ty}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={font}
        fontWeight={500}
        transform={rotate ? `rotate(${rotate} ${tx} ${ty})` : undefined}
        className="fill-muted-foreground select-none"
      >
        {label}
      </text>
    </g>
  );
}

function OpeningDistanceLabels({
  seg,
  opening,
  k,
}: {
  seg: WallSegment;
  opening: KitchenOpening;
  k: number;
}) {
  const start = pointAlong(seg, 0);
  const oStart = pointAlong(seg, opening.distanceFromWallStart);
  const inward = 34 * k;
  const midX = (start.x + oStart.x) / 2 - seg.nx * inward;
  const midY = (start.y + oStart.y) / 2 - seg.ny * inward;
  const d = Math.round(opening.distanceFromWallStart);
  const boxW = 52 * k;
  const boxH = 22 * k;
  return (
    <g style={{ pointerEvents: "none" }} data-testid={`label-distance-${opening.id}`}>
      <line
        x1={start.x - seg.nx * inward * 0.65}
        y1={start.y - seg.ny * inward * 0.65}
        x2={oStart.x - seg.nx * inward * 0.65}
        y2={oStart.y - seg.ny * inward * 0.65}
        strokeWidth={1.2 * k}
        strokeDasharray={`${6 * k} ${4 * k}`}
        className="stroke-amber-500"
      />
      <rect
        x={midX - boxW / 2}
        y={midY - boxH / 2}
        width={boxW}
        height={boxH}
        rx={4 * k}
        strokeWidth={1 * k}
        className="fill-background stroke-amber-500"
      />
      <text
        x={midX}
        y={midY + 1 * k}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={11.5 * k}
        fontWeight={600}
        className="fill-amber-600"
      >
        {`${d} سم`}
      </text>
    </g>
  );
}
