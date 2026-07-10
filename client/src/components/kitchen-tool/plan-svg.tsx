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

const WALL_THICKNESS = 14;
const OPENING_THICKNESS = 26;
const DIM_OFFSET = 55;
const PADDING = 110;

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

  const minX = Math.min(...segments.map((s) => Math.min(s.x1, s.x2))) - PADDING;
  const maxX = Math.max(...segments.map((s) => Math.max(s.x1, s.x2))) + PADDING;
  const minY = Math.min(...segments.map((s) => Math.min(s.y1, s.y2))) - PADDING;
  const maxY = Math.max(...segments.map((s) => Math.max(s.y1, s.y2))) + PADDING;

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

  return (
    <svg
      ref={svgRef}
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      className={className}
      data-testid="svg-kitchen-plan"
    >
      {/* Floor area hint */}
      <rect
        x={Math.min(...segments.map((s) => Math.min(s.x1, s.x2)))}
        y={Math.min(...segments.map((s) => Math.min(s.y1, s.y2)))}
        width={
          Math.max(...segments.map((s) => Math.max(s.x1, s.x2))) -
          Math.min(...segments.map((s) => Math.min(s.x1, s.x2)))
        }
        height={Math.max(
          Math.max(...segments.map((s) => Math.max(s.y1, s.y2))) -
            Math.min(...segments.map((s) => Math.min(s.y1, s.y2))),
          120
        )}
        className="fill-muted/40"
        rx={8}
      />

      {/* Walls */}
      {segments.map((seg) => (
        <g key={seg.id}>
          <line
            x1={seg.x1}
            y1={seg.y1}
            x2={seg.x2}
            y2={seg.y2}
            strokeWidth={WALL_THICKNESS}
            strokeLinecap="square"
            className="stroke-foreground/80"
          />
          {/* Dimension line */}
          <DimensionLabel seg={seg} t={t} />
        </g>
      ))}

      {/* Openings */}
      {openings.map((o) => {
        const seg = segById.get(o.wallId);
        if (!seg) return null;
        const start = pointAlong(seg, o.distanceFromWallStart);
        const end = pointAlong(seg, o.distanceFromWallStart + o.width);
        const cx = (start.x + end.x) / 2;
        const cy = (start.y + end.y) / 2;
        const isSelected = o.id === selectedOpeningId;
        const isDragged = o.id === draggingOpeningId || (isDraggingNow && dragRef.current?.id === o.id);
        const horizontal = Math.abs(seg.y2 - seg.y1) < 0.001;
        const colorClass =
          o.type === "door"
            ? isSelected
              ? "fill-primary"
              : "fill-primary/70"
            : isSelected
              ? "fill-sky-500"
              : "fill-sky-500/70";
        const rectProps = horizontal
          ? {
              x: Math.min(start.x, end.x),
              y: cy - OPENING_THICKNESS / 2,
              width: Math.abs(end.x - start.x),
              height: OPENING_THICKNESS,
            }
          : {
              x: cx - OPENING_THICKNESS / 2,
              y: Math.min(start.y, end.y),
              width: OPENING_THICKNESS,
              height: Math.abs(end.y - start.y),
            };
        return (
          <g key={o.id}>
            <rect
              {...rectProps}
              rx={4}
              className={colorClass}
              stroke={isSelected ? "currentColor" : "none"}
              strokeWidth={isSelected ? 4 : 0}
              onPointerDown={(e) => handlePointerDown(e, o)}
              onClick={(e) => {
                e.stopPropagation();
                onSelectOpening?.(o.id);
              }}
              style={{ cursor: onDragOpening ? "grab" : "default", touchAction: "none" }}
              data-testid={`opening-${o.id}`}
            />
            {/* Type glyph */}
            <text
              x={horizontal ? cx : cx + seg.nx * -46}
              y={horizontal ? cy + seg.ny * -46 : cy}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={26}
              className="fill-foreground/70 select-none"
              style={{ pointerEvents: "none" }}
            >
              {o.type === "door" ? t("باب", "Door") : t("نافذة", "Window")}
            </text>
            {/* Live distance labels while selected/dragging */}
            {(isSelected || isDragged) && (
              <OpeningDistanceLabels seg={seg} opening={o} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

function DimensionLabel({ seg, t }: { seg: WallSegment; t: (ar: string, en: string) => string }) {
  const midX = (seg.x1 + seg.x2) / 2 + seg.nx * DIM_OFFSET;
  const midY = (seg.y1 + seg.y2) / 2 + seg.ny * DIM_OFFSET;
  const dx1 = seg.x1 + seg.nx * (DIM_OFFSET - 12);
  const dy1 = seg.y1 + seg.ny * (DIM_OFFSET - 12);
  const dx2 = seg.x2 + seg.nx * (DIM_OFFSET - 12);
  const dy2 = seg.y2 + seg.ny * (DIM_OFFSET - 12);
  return (
    <g data-testid={`dim-wall-${seg.id}`}>
      <line x1={dx1} y1={dy1} x2={dx2} y2={dy2} strokeWidth={2} className="stroke-primary/60" />
      <line x1={seg.x1 + seg.nx * 10} y1={seg.y1 + seg.ny * 10} x2={dx1} y2={dy1} strokeWidth={2} className="stroke-primary/40" />
      <line x1={seg.x2 + seg.nx * 10} y1={seg.y2 + seg.ny * 10} x2={dx2} y2={dy2} strokeWidth={2} className="stroke-primary/40" />
      <text
        x={midX + seg.nx * 26}
        y={midY + seg.ny * 26}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={30}
        fontWeight={700}
        className="fill-primary select-none"
        style={{ pointerEvents: "none" }}
      >
        {`${Math.round(seg.length)} ${t("سم", "cm")} — ${t(wallLabelAr(seg.id), wallLabelEn(seg.id))}`}
      </text>
    </g>
  );
}

function OpeningDistanceLabels({ seg, opening }: { seg: WallSegment; opening: KitchenOpening }) {
  const start = pointAlong(seg, 0);
  const oStart = pointAlong(seg, opening.distanceFromWallStart);
  const horizontal = Math.abs(seg.y2 - seg.y1) < 0.001;
  const inward = 60;
  const midX = (start.x + oStart.x) / 2 - seg.nx * inward;
  const midY = (start.y + oStart.y) / 2 - seg.ny * inward;
  const d = Math.round(opening.distanceFromWallStart);
  return (
    <g style={{ pointerEvents: "none" }} data-testid={`label-distance-${opening.id}`}>
      <line
        x1={start.x - seg.nx * inward * 0.6}
        y1={start.y - seg.ny * inward * 0.6}
        x2={oStart.x - seg.nx * inward * 0.6}
        y2={oStart.y - seg.ny * inward * 0.6}
        strokeWidth={3}
        strokeDasharray="10 6"
        className="stroke-amber-500"
      />
      <rect
        x={midX - 55}
        y={midY - 22}
        width={110}
        height={44}
        rx={8}
        className="fill-background stroke-amber-500"
        strokeWidth={2}
      />
      <text
        x={midX}
        y={midY + 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={26}
        fontWeight={700}
        className="fill-amber-600"
      >
        {`${d} سم`}
      </text>
      {horizontal ? null : null}
    </g>
  );
}
