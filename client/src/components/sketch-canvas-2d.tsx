import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Stage, Layer, Rect, Line, Text, Group, Arrow, Circle, Transformer } from "react-konva";
import Konva from "konva";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Square,
  Minus,
  Type,
  Undo2,
  Redo2,
  Save,
  Ruler,
  Trash2,
  PenTool,
  Download,
  ZoomIn,
  ZoomOut,
  Move,
  MousePointer,
  RotateCcw,
  Grid3X3,
  Maximize2,
  Library,
  ChevronDown,
  ChevronUp,
  Search,
  X,
} from "lucide-react";
import { DOOR_PATTERNS } from "@/lib/product-specs";

type FixtureCategory = "kitchen" | "bathroom" | "plants" | "door_patterns" | "furniture";

interface FixtureDefinition {
  id: string;
  category: FixtureCategory;
  labelAr: string;
  labelEn: string;
  widthGrid: number;
  heightGrid: number;
  symbol: string;
  color: string;
}

const FIXTURE_CATEGORIES: { id: FixtureCategory; labelAr: string; labelEn: string }[] = [
  { id: "kitchen", labelAr: "مطبخ", labelEn: "Kitchen" },
  { id: "bathroom", labelAr: "حمام", labelEn: "Bathroom" },
  { id: "plants", labelAr: "نباتات", labelEn: "Plants" },
  { id: "door_patterns", labelAr: "أنماط أبواب", labelEn: "Door Patterns" },
  { id: "furniture", labelAr: "أثاث", labelEn: "Furniture" },
];

const FIXTURE_LIBRARY: FixtureDefinition[] = [
  { id: "sink", category: "kitchen", labelAr: "حوض", labelEn: "Sink", widthGrid: 3, heightGrid: 2, symbol: "S", color: "#3b82f6" },
  { id: "stove", category: "kitchen", labelAr: "فرن", labelEn: "Stove", widthGrid: 3, heightGrid: 3, symbol: "St", color: "#ef4444" },
  { id: "refrigerator", category: "kitchen", labelAr: "ثلاجة", labelEn: "Refrigerator", widthGrid: 3, heightGrid: 3, symbol: "R", color: "#6366f1" },
  { id: "dishwasher", category: "kitchen", labelAr: "غسالة أطباق", labelEn: "Dishwasher", widthGrid: 3, heightGrid: 3, symbol: "DW", color: "#8b5cf6" },
  { id: "microwave", category: "kitchen", labelAr: "مايكروويف", labelEn: "Microwave", widthGrid: 2, heightGrid: 2, symbol: "MW", color: "#f59e0b" },
  { id: "oven", category: "kitchen", labelAr: "فرن كبير", labelEn: "Oven", widthGrid: 3, heightGrid: 3, symbol: "Ov", color: "#dc2626" },
  { id: "range_hood", category: "kitchen", labelAr: "شفاط", labelEn: "Range Hood", widthGrid: 4, heightGrid: 2, symbol: "RH", color: "#71717a" },

  { id: "toilet", category: "bathroom", labelAr: "مرحاض", labelEn: "Toilet", widthGrid: 2, heightGrid: 3, symbol: "T", color: "#06b6d4" },
  { id: "bathtub", category: "bathroom", labelAr: "بانيو", labelEn: "Bathtub", widthGrid: 4, heightGrid: 8, symbol: "BT", color: "#0ea5e9" },
  { id: "shower", category: "bathroom", labelAr: "دوش", labelEn: "Shower", widthGrid: 4, heightGrid: 4, symbol: "Sh", color: "#22d3ee" },
  { id: "wash_basin", category: "bathroom", labelAr: "مغسلة", labelEn: "Wash Basin", widthGrid: 2, heightGrid: 2, symbol: "WB", color: "#14b8a6" },

  { id: "palm_tree", category: "plants", labelAr: "نخلة داخلية", labelEn: "Palm Tree", widthGrid: 2, heightGrid: 2, symbol: "Pa", color: "#22c55e" },
  { id: "fern", category: "plants", labelAr: "سرخس", labelEn: "Fern", widthGrid: 2, heightGrid: 2, symbol: "Fe", color: "#16a34a" },
  { id: "monstera", category: "plants", labelAr: "مونستيرا", labelEn: "Monstera", widthGrid: 2, heightGrid: 2, symbol: "Mo", color: "#15803d" },
  { id: "cactus", category: "plants", labelAr: "صبار", labelEn: "Cactus", widthGrid: 1, heightGrid: 2, symbol: "Ca", color: "#65a30d" },
  { id: "bonsai", category: "plants", labelAr: "بونساي", labelEn: "Bonsai", widthGrid: 2, heightGrid: 2, symbol: "Bo", color: "#4d7c0f" },
  { id: "bamboo", category: "plants", labelAr: "خيزران", labelEn: "Bamboo", widthGrid: 1, heightGrid: 3, symbol: "Bb", color: "#84cc16" },
  { id: "ivy", category: "plants", labelAr: "لبلاب", labelEn: "Ivy", widthGrid: 2, heightGrid: 1, symbol: "Iv", color: "#34d399" },

  ...DOOR_PATTERNS.map(dp => ({
    id: `door_${dp.value}`,
    category: "door_patterns" as FixtureCategory,
    labelAr: dp.labelAr,
    labelEn: dp.labelEn,
    widthGrid: 4,
    heightGrid: 8,
    symbol: "D",
    color: "#78350f",
  })),

  { id: "table", category: "furniture", labelAr: "طاولة", labelEn: "Table", widthGrid: 4, heightGrid: 4, symbol: "Tb", color: "#a16207" },
  { id: "chair", category: "furniture", labelAr: "كرسي", labelEn: "Chair", widthGrid: 2, heightGrid: 2, symbol: "Ch", color: "#ca8a04" },
  { id: "sofa", category: "furniture", labelAr: "أريكة", labelEn: "Sofa", widthGrid: 6, heightGrid: 3, symbol: "So", color: "#b45309" },
  { id: "shelf_unit", category: "furniture", labelAr: "رف", labelEn: "Shelf Unit", widthGrid: 4, heightGrid: 1, symbol: "Sf", color: "#92400e" },
  { id: "bed", category: "furniture", labelAr: "سرير", labelEn: "Bed", widthGrid: 6, heightGrid: 8, symbol: "Bd", color: "#78716c" },
];

type DrawTool = "select" | "wall" | "cabinet" | "line" | "dimension" | "text" | "freehand" | "fixture";

interface SketchElement {
  id: string;
  type: "wall" | "cabinet" | "line" | "dimension" | "text" | "freehand" | "fixture";
  x: number;
  y: number;
  width?: number;
  height?: number;
  points?: number[];
  text?: string;
  fontSize?: number;
  color: string;
  strokeWidth: number;
  rotation?: number;
  label?: string;
  dimensionMM?: number;
  fixtureType?: string;
  fixtureSymbol?: string;
}

interface HistoryEntry {
  elements: SketchElement[];
}

const COLORS = {
  wall: "#1e293b",
  cabinet: "#92400e",
  countertop: "#6b7280",
  dimension: "#dc2626",
  text: "#1e293b",
  freehand: "#2563eb",
  grid: "#e5e7eb",
  gridMajor: "#d1d5db",
};

const GRID_SIZE_OPTIONS = [10, 20, 25, 50];
const SCALE_PX_PER_CM = 2;

function snapToGrid(val: number, gridSize: number): number {
  return Math.round(val / gridSize) * gridSize;
}

function pxToMM(px: number): number {
  return Math.round((px / SCALE_PX_PER_CM) * 10);
}

function pxToCM(px: number): number {
  return Math.round((px / SCALE_PX_PER_CM) * 10) / 10;
}

function formatDimension(px: number): string {
  const mm = Math.abs(pxToMM(px));
  if (mm >= 10) {
    return `${(mm / 10).toFixed(1)} cm`;
  }
  return `${mm} mm`;
}

function GridBackground({
  width,
  height,
  gridSize,
  scale,
  offsetX,
  offsetY,
}: {
  width: number;
  height: number;
  gridSize: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}) {
  const lines = useMemo(() => {
    const result: JSX.Element[] = [];
    const effectiveGrid = gridSize;
    const majorGrid = effectiveGrid * 5;

    const startX = Math.floor(-offsetX / scale / effectiveGrid) * effectiveGrid - effectiveGrid;
    const endX = startX + width / scale + effectiveGrid * 2;
    const startY = Math.floor(-offsetY / scale / effectiveGrid) * effectiveGrid - effectiveGrid;
    const endY = startY + height / scale + effectiveGrid * 2;

    for (let x = startX; x <= endX; x += effectiveGrid) {
      const isMajor = x % majorGrid === 0;
      result.push(
        <Line
          key={`gv-${x}`}
          points={[x, startY, x, endY]}
          stroke={isMajor ? COLORS.gridMajor : COLORS.grid}
          strokeWidth={(isMajor ? 1 : 0.5) / scale}
          listening={false}
        />
      );
    }
    for (let y = startY; y <= endY; y += effectiveGrid) {
      const isMajor = y % majorGrid === 0;
      result.push(
        <Line
          key={`gh-${y}`}
          points={[startX, y, endX, y]}
          stroke={isMajor ? COLORS.gridMajor : COLORS.grid}
          strokeWidth={(isMajor ? 1 : 0.5) / scale}
          listening={false}
        />
      );
    }
    return result;
  }, [width, height, gridSize, scale, offsetX, offsetY]);

  return <>{lines}</>;
}

function DimensionLine({
  element,
  scale,
  onSelect,
  onDragEnd,
  isDraggable,
}: {
  element: SketchElement;
  scale: number;
  onSelect?: () => void;
  onDragEnd?: (id: string, deltaX: number, deltaY: number) => void;
  isDraggable?: boolean;
}) {
  if (!element.points || element.points.length < 4) return null;
  const [x1, y1, x2, y2] = element.points;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const angle = Math.atan2(dy, dx);
  const perpAngle = angle + Math.PI / 2;
  const offsetDist = 12 / scale;
  const textX = midX + Math.cos(perpAngle) * offsetDist;
  const textY = midY + Math.sin(perpAngle) * offsetDist;
  const dimText = element.dimensionMM
    ? `${element.dimensionMM} mm`
    : formatDimension(length);
  const arrowLen = 8 / scale;

  return (
    <Group
      id={element.id}
      draggable={isDraggable}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e) => {
        if (onDragEnd) {
          onDragEnd(element.id, e.target.x(), e.target.y());
          e.target.x(0);
          e.target.y(0);
        }
      }}
    >
      <Arrow
        points={[x1, y1, x2, y2]}
        stroke={element.color}
        strokeWidth={element.strokeWidth / scale}
        fill={element.color}
        pointerLength={arrowLen}
        pointerWidth={arrowLen * 0.6}
        pointerAtBeginning
        pointerAtEnding
        hitStrokeWidth={12}
      />
      <Line
        points={[
          x1 + Math.cos(perpAngle) * 6 / scale,
          y1 + Math.sin(perpAngle) * 6 / scale,
          x1 - Math.cos(perpAngle) * 6 / scale,
          y1 - Math.sin(perpAngle) * 6 / scale,
        ]}
        stroke={element.color}
        strokeWidth={element.strokeWidth / scale}
        listening={false}
      />
      <Line
        points={[
          x2 + Math.cos(perpAngle) * 6 / scale,
          y2 + Math.sin(perpAngle) * 6 / scale,
          x2 - Math.cos(perpAngle) * 6 / scale,
          y2 - Math.sin(perpAngle) * 6 / scale,
        ]}
        stroke={element.color}
        strokeWidth={element.strokeWidth / scale}
        listening={false}
      />
      <Text
        x={textX}
        y={textY}
        text={dimText}
        fontSize={11 / scale}
        fill={element.color}
        fontFamily="monospace"
        fontStyle="bold"
        align="center"
        offsetX={0}
        offsetY={6 / scale}
        rotation={(angle * 180) / Math.PI}
        listening={false}
      />
    </Group>
  );
}

interface SketchCanvas2DProps {
  initialData?: string;
  onSave?: (jsonData: string, imageDataUrl: string) => void;
  width?: number;
  height?: number;
  roomDimensions?: { width: number; height: number };
}

export default function SketchCanvas2D({
  initialData,
  onSave,
  width: containerWidth = 1200,
  height: containerHeight = 700,
  roomDimensions,
}: SketchCanvas2DProps) {
  const { t } = useLanguage();
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

  const [tool, setTool] = useState<DrawTool>("select");
  const [elements, setElements] = useState<SketchElement[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([{ elements: [] }]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [currentElement, setCurrentElement] = useState<SketchElement | null>(null);
  const [gridSize, setGridSize] = useState(20);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [textInput, setTextInput] = useState("");
  const [textInputPos, setTextInputPos] = useState<{ x: number; y: number } | null>(null);
  const [wallThickness, setWallThickness] = useState(4);
  const [cabinetColor, setCabinetColor] = useState(COLORS.cabinet);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryCategory, setLibraryCategory] = useState<FixtureCategory>("kitchen");
  const [librarySearch, setLibrarySearch] = useState("");
  const [pendingFixture, setPendingFixture] = useState<FixtureDefinition | null>(null);

  const filteredFixtures = useMemo(() => {
    let items = FIXTURE_LIBRARY.filter(f => f.category === libraryCategory);
    if (librarySearch.trim()) {
      const q = librarySearch.trim().toLowerCase();
      items = FIXTURE_LIBRARY.filter(f =>
        f.labelAr.includes(q) ||
        f.labelEn.toLowerCase().includes(q) ||
        f.id.includes(q)
      );
    }
    return items;
  }, [libraryCategory, librarySearch]);

  const selectFixtureFromLibrary = (fixture: FixtureDefinition) => {
    setPendingFixture(fixture);
    setTool("fixture");
    setSelectedId(null);
  };

  const cabinetColorOptions = [
    { value: "#92400e", label: "Oak" },
    { value: "#78350f", label: "Walnut" },
    { value: "#f5f0e8", label: "MDF White" },
    { value: "#d4c5a9", label: "Beech" },
    { value: "#6b7280", label: "Gray" },
  ];

  useEffect(() => {
    if (initialData) {
      try {
        const parsed = JSON.parse(initialData);
        if (Array.isArray(parsed)) {
          setElements(parsed);
          setHistory([{ elements: parsed }]);
          setHistoryIndex(0);
        }
      } catch {}
    }
  }, [initialData]);

  useEffect(() => {
    if (roomDimensions && elements.length === 0 && !initialData) {
      const rw = roomDimensions.width * SCALE_PX_PER_CM * 10;
      const rh = roomDimensions.height * SCALE_PX_PER_CM * 10;
      const ox = 100;
      const oy = 100;
      const wallEls: SketchElement[] = [
        {
          id: crypto.randomUUID(),
          type: "wall",
          x: ox,
          y: oy,
          points: [ox, oy, ox + rw, oy],
          color: COLORS.wall,
          strokeWidth: wallThickness,
          label: `${roomDimensions.width}m`,
        },
        {
          id: crypto.randomUUID(),
          type: "wall",
          x: ox + rw,
          y: oy,
          points: [ox + rw, oy, ox + rw, oy + rh],
          color: COLORS.wall,
          strokeWidth: wallThickness,
        },
        {
          id: crypto.randomUUID(),
          type: "wall",
          x: ox,
          y: oy + rh,
          points: [ox, oy + rh, ox + rw, oy + rh],
          color: COLORS.wall,
          strokeWidth: wallThickness,
        },
        {
          id: crypto.randomUUID(),
          type: "wall",
          x: ox,
          y: oy,
          points: [ox, oy, ox, oy + rh],
          color: COLORS.wall,
          strokeWidth: wallThickness,
        },
      ];
      setElements(wallEls);
      pushHistoryDirect(wallEls);
    }
  }, [roomDimensions]);

  const pushHistoryDirect = (newElements: SketchElement[]) => {
    setHistory(prev => {
      const trimmed = prev.slice(0, historyIndex + 1);
      return [...trimmed, { elements: newElements }];
    });
    setHistoryIndex(prev => prev + 1);
  };

  const pushHistory = useCallback(
    (newElements: SketchElement[]) => {
      setHistory(prev => {
        const trimmed = prev.slice(0, historyIndex + 1);
        return [...trimmed, { elements: newElements }];
      });
      setHistoryIndex(prev => prev + 1);
    },
    [historyIndex]
  );

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setElements(history[newIndex].elements);
      setSelectedId(null);
    }
  }, [historyIndex, history]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setElements(history[newIndex].elements);
      setSelectedId(null);
    }
  }, [historyIndex, history]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z") {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
        }
        if (e.key === "y") {
          e.preventDefault();
          redo();
        }
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId && !textInputPos) {
          e.preventDefault();
          const newEls = elements.filter(el => el.id !== selectedId);
          setElements(newEls);
          pushHistory(newEls);
          setSelectedId(null);
        }
      }
      if (e.key === "Escape") {
        setSelectedId(null);
        setTool("select");
        setTextInputPos(null);
        setIsDrawing(false);
        setCurrentElement(null);
        setPendingFixture(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, selectedId, elements, pushHistory, textInputPos]);

  useEffect(() => {
    if (transformerRef.current && stageRef.current) {
      if (selectedId) {
        const node = stageRef.current.findOne(`#${selectedId}`);
        if (node) {
          transformerRef.current.nodes([node]);
          transformerRef.current.getLayer()?.batchDraw();
        }
      } else {
        transformerRef.current.nodes([]);
        transformerRef.current.getLayer()?.batchDraw();
      }
    }
  }, [selectedId, elements]);

  const getPointerPos = (): { x: number; y: number } | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;
    const transform = stage.getAbsoluteTransform().copy().invert();
    const pos = transform.point(pointer);
    if (snapEnabled) {
      return { x: snapToGrid(pos.x, gridSize), y: snapToGrid(pos.y, gridSize) };
    }
    return { x: Math.round(pos.x), y: Math.round(pos.y) };
  };

  const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.evt.button === 1) return;

    if (tool === "select") {
      const clickedOnEmpty = e.target === e.target.getStage();
      if (clickedOnEmpty) {
        setSelectedId(null);
      }
      return;
    }

    const pos = getPointerPos();
    if (!pos) return;

    if (tool === "fixture" && pendingFixture) {
      const fw = pendingFixture.widthGrid * gridSize;
      const fh = pendingFixture.heightGrid * gridSize;
      const fixtureEl: SketchElement = {
        id: crypto.randomUUID(),
        type: "fixture",
        x: pos.x,
        y: pos.y,
        width: fw,
        height: fh,
        color: pendingFixture.color,
        strokeWidth: 2,
        label: t(pendingFixture.labelAr, pendingFixture.labelEn),
        fixtureType: pendingFixture.id,
        fixtureSymbol: pendingFixture.symbol,
      };
      const newEls = [...elements, fixtureEl];
      setElements(newEls);
      pushHistory(newEls);
      return;
    }

    if (tool === "text") {
      setTextInputPos(pos);
      return;
    }

    setIsDrawing(true);
    setDrawStart(pos);

    const newEl: SketchElement = {
      id: crypto.randomUUID(),
      type: tool === "cabinet" ? "cabinet" : tool as SketchElement["type"],
      x: pos.x,
      y: pos.y,
      color:
        tool === "wall"
          ? COLORS.wall
          : tool === "cabinet"
          ? cabinetColor
          : tool === "dimension"
          ? COLORS.dimension
          : tool === "freehand"
          ? COLORS.freehand
          : COLORS.text,
      strokeWidth: tool === "wall" ? wallThickness : 2,
    };

    if (tool === "freehand") {
      newEl.points = [pos.x, pos.y];
    } else if (tool === "wall" || tool === "line" || tool === "dimension") {
      newEl.points = [pos.x, pos.y, pos.x, pos.y];
    } else if (tool === "cabinet") {
      newEl.width = 0;
      newEl.height = 0;
    }

    setCurrentElement(newEl);
  };

  const handleStageMouseMove = () => {
    if (!isDrawing || !drawStart || !currentElement) return;
    const pos = getPointerPos();
    if (!pos) return;

    const updated = { ...currentElement };

    if (currentElement.type === "freehand") {
      updated.points = [...(currentElement.points || []), pos.x, pos.y];
    } else if (
      currentElement.type === "wall" ||
      currentElement.type === "line" ||
      currentElement.type === "dimension"
    ) {
      let endX = pos.x;
      let endY = pos.y;
      const dx = Math.abs(endX - drawStart.x);
      const dy = Math.abs(endY - drawStart.y);
      if (currentElement.type === "wall" || currentElement.type === "dimension") {
        if (dx > dy * 2) {
          endY = drawStart.y;
        } else if (dy > dx * 2) {
          endX = drawStart.x;
        }
      }
      updated.points = [drawStart.x, drawStart.y, endX, endY];
    } else if (currentElement.type === "cabinet") {
      updated.width = pos.x - drawStart.x;
      updated.height = pos.y - drawStart.y;
    }

    setCurrentElement(updated);
  };

  const handleStageMouseUp = () => {
    if (!isDrawing || !currentElement) {
      setIsDrawing(false);
      return;
    }

    let finalEl = { ...currentElement };

    if (finalEl.type === "cabinet" && finalEl.width && finalEl.height) {
      if (finalEl.width < 0) {
        finalEl.x = finalEl.x + finalEl.width;
        finalEl.width = Math.abs(finalEl.width);
      }
      if (finalEl.height < 0) {
        finalEl.y = finalEl.y + finalEl.height;
        finalEl.height = Math.abs(finalEl.height);
      }
      if (finalEl.width < 5 && finalEl.height < 5) {
        setIsDrawing(false);
        setCurrentElement(null);
        setDrawStart(null);
        return;
      }
      finalEl.label = `${formatDimension(finalEl.width)} x ${formatDimension(finalEl.height)}`;
    }

    if (finalEl.type === "wall" && finalEl.points && finalEl.points.length >= 4) {
      const [x1, y1, x2, y2] = finalEl.points;
      const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      if (len < 5) {
        setIsDrawing(false);
        setCurrentElement(null);
        setDrawStart(null);
        return;
      }
      finalEl.label = formatDimension(len);
    }

    if (finalEl.type === "dimension" && finalEl.points && finalEl.points.length >= 4) {
      const [x1, y1, x2, y2] = finalEl.points;
      const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      if (len < 5) {
        setIsDrawing(false);
        setCurrentElement(null);
        setDrawStart(null);
        return;
      }
      finalEl.dimensionMM = pxToMM(len);
    }

    const newEls = [...elements, finalEl];
    setElements(newEls);
    pushHistory(newEls);
    setCurrentElement(null);
    setIsDrawing(false);
    setDrawStart(null);
  };

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = stageScale;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const scaleBy = 1.08;
    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    const clampedScale = Math.max(0.1, Math.min(5, newScale));

    const mousePointTo = {
      x: (pointer.x - stagePos.x) / oldScale,
      y: (pointer.y - stagePos.y) / oldScale,
    };

    setStageScale(clampedScale);
    setStagePos({
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    });
  };

  const addTextElement = () => {
    if (!textInputPos || !textInput.trim()) return;
    const el: SketchElement = {
      id: crypto.randomUUID(),
      type: "text",
      x: textInputPos.x,
      y: textInputPos.y,
      text: textInput.trim(),
      fontSize: 14,
      color: COLORS.text,
      strokeWidth: 1,
    };
    const newEls = [...elements, el];
    setElements(newEls);
    pushHistory(newEls);
    setTextInput("");
    setTextInputPos(null);
  };

  const clearCanvas = () => {
    setElements([]);
    pushHistory([]);
    setSelectedId(null);
  };

  const resetView = () => {
    setStageScale(1);
    setStagePos({ x: 0, y: 0 });
  };

  const zoomIn = () => {
    const newScale = Math.min(5, stageScale * 1.3);
    setStageScale(newScale);
  };

  const zoomOut = () => {
    const newScale = Math.max(0.1, stageScale / 1.3);
    setStageScale(newScale);
  };

  const exportPNG = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = stageScale;
    const oldPos = { ...stagePos };

    stage.scale({ x: 2, y: 2 });
    stage.position({ x: 0, y: 0 });
    stage.batchDraw();

    const dataURL = stage.toDataURL({
      pixelRatio: 2,
      mimeType: "image/png",
      width: containerWidth,
      height: containerHeight,
    });

    stage.scale({ x: oldScale, y: oldScale });
    stage.position(oldPos);
    stage.batchDraw();

    const link = document.createElement("a");
    link.download = "sketch-2d.png";
    link.href = dataURL;
    link.click();
  };

  const handleSave = () => {
    if (!onSave) return;
    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = stageScale;
    const oldPos = { ...stagePos };
    stage.scale({ x: 1, y: 1 });
    stage.position({ x: 0, y: 0 });
    stage.batchDraw();

    const imageDataUrl = stage.toDataURL({ pixelRatio: 2, mimeType: "image/png" });

    stage.scale({ x: oldScale, y: oldScale });
    stage.position(oldPos);
    stage.batchDraw();

    const jsonData = JSON.stringify(elements);
    onSave(jsonData, imageDataUrl);
  };

  const handleTransformEnd = (id: string) => {
    const stage = stageRef.current;
    if (!stage) return;
    const node = stage.findOne(`#${id}`);
    if (!node) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const newX = Math.round(node.x());
    const newY = Math.round(node.y());
    const newRotation = Math.round(node.rotation());

    const newEls = elements.map(el => {
      if (el.id !== id) return el;

      if (el.type === "cabinet" || el.type === "fixture") {
        const newW = Math.round((el.width || 0) * scaleX);
        const newH = Math.round((el.height || 0) * scaleY);
        node.scaleX(1);
        node.scaleY(1);
        return {
          ...el,
          x: newX,
          y: newY,
          width: newW,
          height: newH,
          rotation: newRotation,
          label: el.type === "fixture" ? el.label : `${formatDimension(newW)} x ${formatDimension(newH)}`,
        };
      }

      if (el.type === "text") {
        const newFontSize = Math.round((el.fontSize || 14) * scaleY);
        node.scaleX(1);
        node.scaleY(1);
        return {
          ...el,
          x: newX,
          y: newY,
          fontSize: Math.max(8, newFontSize),
          rotation: newRotation,
        };
      }

      if ((el.type === "wall" || el.type === "line" || el.type === "dimension" || el.type === "freehand") && el.points) {
        const avgX = scaleX !== 1 || scaleY !== 1 ? true : false;
        if (avgX) {
          const newPoints = [];
          for (let i = 0; i < el.points.length; i += 2) {
            newPoints.push(Math.round(el.points[i] * scaleX));
            newPoints.push(Math.round(el.points[i + 1] * scaleY));
          }
          node.scaleX(1);
          node.scaleY(1);
          return {
            ...el,
            points: newPoints,
            x: newX,
            y: newY,
            rotation: newRotation,
          };
        }
      }

      node.scaleX(1);
      node.scaleY(1);
      return {
        ...el,
        x: newX,
        y: newY,
        rotation: newRotation,
      };
    });
    setElements(newEls);
    pushHistory(newEls);
  };

  const handleDragEnd = (id: string, newX: number, newY: number) => {
    const sx = snapEnabled ? snapToGrid(newX, gridSize) : Math.round(newX);
    const sy = snapEnabled ? snapToGrid(newY, gridSize) : Math.round(newY);
    const newEls = elements.map(el => (el.id === id ? { ...el, x: sx, y: sy } : el));
    setElements(newEls);
    pushHistory(newEls);
  };

  const handlePointsDragEnd = (id: string, deltaX: number, deltaY: number) => {
    const dx = snapEnabled ? snapToGrid(deltaX, gridSize) : Math.round(deltaX);
    const dy = snapEnabled ? snapToGrid(deltaY, gridSize) : Math.round(deltaY);
    if (dx === 0 && dy === 0) return;
    const newEls = elements.map(el => {
      if (el.id !== id || !el.points) return el;
      const newPoints = el.points.map((v, i) => v + (i % 2 === 0 ? dx : dy));
      return { ...el, points: newPoints, x: el.x + dx, y: el.y + dy };
    });
    setElements(newEls);
    pushHistory(newEls);
  };

  const renderElement = (el: SketchElement) => {
    const isSelected = selectedId === el.id;

    switch (el.type) {
      case "wall":
        if (!el.points || el.points.length < 4) return null;
        return (
          <Group
            key={el.id}
            id={el.id}
            draggable={tool === "select"}
            onClick={() => tool === "select" && setSelectedId(el.id)}
            onTap={() => tool === "select" && setSelectedId(el.id)}
            onDragEnd={(e) => {
              handlePointsDragEnd(el.id, e.target.x(), e.target.y());
              e.target.x(0);
              e.target.y(0);
            }}
          >
            <Line
              points={el.points}
              stroke={el.color}
              strokeWidth={el.strokeWidth}
              lineCap="round"
              lineJoin="round"
              hitStrokeWidth={12}
            />
            {el.label && (
              <Text
                x={(el.points[0] + el.points[2]) / 2}
                y={(el.points[1] + el.points[3]) / 2 - 16 / stageScale}
                text={el.label}
                fontSize={11 / stageScale}
                fill={COLORS.dimension}
                fontFamily="monospace"
                fontStyle="bold"
                align="center"
                listening={false}
              />
            )}
          </Group>
        );

      case "cabinet":
        return (
          <Group
            key={el.id}
            id={el.id}
            x={el.x}
            y={el.y}
            rotation={el.rotation || 0}
            draggable={tool === "select"}
            onClick={() => tool === "select" && setSelectedId(el.id)}
            onTap={() => tool === "select" && setSelectedId(el.id)}
            onDragEnd={(e) => handleDragEnd(el.id, e.target.x(), e.target.y())}
            onTransformEnd={() => handleTransformEnd(el.id)}
          >
            <Rect
              width={Math.abs(el.width || 0)}
              height={Math.abs(el.height || 0)}
              fill={el.color + "33"}
              stroke={el.color}
              strokeWidth={2 / stageScale}
              cornerRadius={Math.min(2, Math.abs(el.width || 0) / 2, Math.abs(el.height || 0) / 2)}
            />
            <Line
              points={[0, 0, Math.abs(el.width || 0), Math.abs(el.height || 0)]}
              stroke={el.color + "44"}
              strokeWidth={0.5 / stageScale}
              listening={false}
            />
            <Line
              points={[Math.abs(el.width || 0), 0, 0, Math.abs(el.height || 0)]}
              stroke={el.color + "44"}
              strokeWidth={0.5 / stageScale}
              listening={false}
            />
            {el.label && (
              <Text
                x={4}
                y={4}
                text={el.label}
                fontSize={10 / stageScale}
                fill={el.color}
                fontFamily="monospace"
                width={Math.max(0, Math.abs(el.width || 0) - 8)}
                listening={false}
              />
            )}
          </Group>
        );

      case "line":
        if (!el.points || el.points.length < 4) return null;
        return (
          <Group
            key={el.id}
            id={el.id}
            draggable={tool === "select"}
            onClick={() => tool === "select" && setSelectedId(el.id)}
            onTap={() => tool === "select" && setSelectedId(el.id)}
            onDragEnd={(e) => {
              handlePointsDragEnd(el.id, e.target.x(), e.target.y());
              e.target.x(0);
              e.target.y(0);
            }}
          >
            <Line
              points={el.points}
              stroke={el.color}
              strokeWidth={el.strokeWidth}
              lineCap="round"
              hitStrokeWidth={10}
            />
          </Group>
        );

      case "dimension":
        return (
          <DimensionLine
            key={el.id}
            element={el}
            scale={stageScale}
            isDraggable={tool === "select"}
            onSelect={() => tool === "select" && setSelectedId(el.id)}
            onDragEnd={handlePointsDragEnd}
          />
        );

      case "text":
        return (
          <Text
            key={el.id}
            id={el.id}
            x={el.x}
            y={el.y}
            text={el.text || ""}
            fontSize={(el.fontSize || 14)}
            fill={el.color}
            fontFamily="sans-serif"
            rotation={el.rotation || 0}
            draggable={tool === "select"}
            onClick={() => tool === "select" && setSelectedId(el.id)}
            onTap={() => tool === "select" && setSelectedId(el.id)}
            onDragEnd={(e) => handleDragEnd(el.id, e.target.x(), e.target.y())}
            onTransformEnd={() => handleTransformEnd(el.id)}
          />
        );

      case "freehand":
        if (!el.points || el.points.length < 4) return null;
        return (
          <Group
            key={el.id}
            id={el.id}
            draggable={tool === "select"}
            onClick={() => tool === "select" && setSelectedId(el.id)}
            onTap={() => tool === "select" && setSelectedId(el.id)}
            onDragEnd={(e) => {
              handlePointsDragEnd(el.id, e.target.x(), e.target.y());
              e.target.x(0);
              e.target.y(0);
            }}
          >
            <Line
              points={el.points}
              stroke={el.color}
              strokeWidth={el.strokeWidth}
              lineCap="round"
              lineJoin="round"
              tension={0.5}
              hitStrokeWidth={10}
            />
          </Group>
        );

      case "fixture": {
        const fw = Math.abs(el.width || 40);
        const fh = Math.abs(el.height || 40);
        return (
          <Group
            key={el.id}
            id={el.id}
            x={el.x}
            y={el.y}
            rotation={el.rotation || 0}
            draggable={tool === "select"}
            onClick={() => tool === "select" && setSelectedId(el.id)}
            onTap={() => tool === "select" && setSelectedId(el.id)}
            onDragEnd={(e) => handleDragEnd(el.id, e.target.x(), e.target.y())}
            onTransformEnd={() => handleTransformEnd(el.id)}
          >
            <Rect
              width={fw}
              height={fh}
              fill={el.color + "22"}
              stroke={el.color}
              strokeWidth={2 / stageScale}
              cornerRadius={3}
              dash={[4 / stageScale, 2 / stageScale]}
            />
            <Rect
              x={2}
              y={2}
              width={fw - 4}
              height={fh - 4}
              fill={el.color + "11"}
              stroke={el.color + "44"}
              strokeWidth={1 / stageScale}
              cornerRadius={2}
              listening={false}
            />
            {el.fixtureSymbol && (
              <Text
                x={0}
                y={fh / 2 - 8 / stageScale}
                width={fw}
                text={el.fixtureSymbol}
                fontSize={16 / stageScale}
                fill={el.color}
                fontStyle="bold"
                fontFamily="monospace"
                align="center"
                listening={false}
              />
            )}
            {el.label && (
              <Text
                x={2}
                y={fh - 14 / stageScale}
                width={fw - 4}
                text={el.label}
                fontSize={9 / stageScale}
                fill={el.color}
                fontFamily="sans-serif"
                align="center"
                listening={false}
              />
            )}
          </Group>
        );
      }

      default:
        return null;
    }
  };

  const renderCurrentElement = () => {
    if (!currentElement) return null;
    return renderElement(currentElement);
  };

  const tools_list: {
    id: DrawTool;
    icon: any;
    labelAr: string;
    labelEn: string;
  }[] = [
    { id: "select", icon: MousePointer, labelAr: "تحديد", labelEn: "Select" },
    { id: "wall", icon: Minus, labelAr: "جدار", labelEn: "Wall" },
    { id: "cabinet", icon: Square, labelAr: "خزانة", labelEn: "Cabinet" },
    { id: "line", icon: Minus, labelAr: "خط", labelEn: "Line" },
    { id: "dimension", icon: Ruler, labelAr: "أبعاد", labelEn: "Dimension" },
    { id: "text", icon: Type, labelAr: "نص", labelEn: "Text" },
    { id: "freehand", icon: PenTool, labelAr: "رسم حر", labelEn: "Freehand" },
  ];

  const cursorStyle =
    tool === "select"
      ? "default"
      : tool === "text"
      ? "text"
      : tool === "fixture"
      ? "copy"
      : "crosshair";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {tools_list.map(({ id, icon: Icon, labelAr, labelEn }) => (
          <Button
            key={id}
            size="sm"
            variant={tool === id ? "default" : "outline"}
            onClick={() => {
              setTool(id);
              if (id !== "select") setSelectedId(null);
            }}
            className="toggle-elevate"
            data-testid={`button-tool-${id}`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline ms-1">{t(labelAr, labelEn)}</span>
          </Button>
        ))}

        <Separator orientation="vertical" className="h-6 mx-1" />

        <Button
          size="icon"
          variant="ghost"
          onClick={undo}
          disabled={historyIndex <= 0}
          data-testid="button-undo"
        >
          <Undo2 className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={redo}
          disabled={historyIndex >= history.length - 1}
          data-testid="button-redo"
        >
          <Redo2 className="w-4 h-4" />
        </Button>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <Button size="icon" variant="ghost" onClick={zoomIn} data-testid="button-zoom-in">
          <ZoomIn className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={zoomOut} data-testid="button-zoom-out">
          <ZoomOut className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={resetView} data-testid="button-reset-view">
          <Maximize2 className="w-4 h-4" />
        </Button>
        <Badge className="no-default-active-elevate text-xs" data-testid="badge-zoom-level">
          {Math.round(stageScale * 100)}%
        </Badge>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <div className="flex items-center gap-1">
          <Label className="text-xs whitespace-nowrap">{t("الشبكة", "Grid")}</Label>
          <Select
            value={String(gridSize)}
            onValueChange={(v) => setGridSize(Number(v))}
          >
            <SelectTrigger className="w-20" data-testid="select-grid-size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GRID_SIZE_OPTIONS.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}px
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          size="sm"
          variant={snapEnabled ? "default" : "outline"}
          onClick={() => setSnapEnabled(!snapEnabled)}
          className="toggle-elevate"
          data-testid="button-snap-toggle"
        >
          <Grid3X3 className="w-4 h-4" />
          <span className="hidden sm:inline ms-1">{t("مغناطيس", "Snap")}</span>
        </Button>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <Button
          size="sm"
          variant={libraryOpen ? "default" : "outline"}
          onClick={() => setLibraryOpen(!libraryOpen)}
          className="toggle-elevate"
          data-testid="button-library-toggle"
        >
          <Library className="w-4 h-4" />
          <span className="hidden sm:inline ms-1">{t("المكتبة", "Library")}</span>
          {libraryOpen ? <ChevronUp className="w-3 h-3 ms-1" /> : <ChevronDown className="w-3 h-3 ms-1" />}
        </Button>
      </div>

      {pendingFixture && (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="no-default-active-elevate" data-testid="badge-pending-fixture">
            {t("وضع التثبيت:", "Placement mode:")} {t(pendingFixture.labelAr, pendingFixture.labelEn)}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {t("انقر على اللوحة لوضع العنصر", "Click on canvas to place")}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setPendingFixture(null);
              setTool("select");
            }}
            data-testid="button-cancel-fixture"
          >
            <X className="w-3 h-3" />
            <span className="ms-1">{t("إلغاء", "Cancel")}</span>
          </Button>
        </div>
      )}

      {libraryOpen && (
        <div className="border border-border rounded-md bg-card" data-testid="panel-fixture-library">
          <div className="p-2 space-y-2">
            <div className="relative">
              <Search className="absolute start-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t("بحث في المكتبة...", "Search library...")}
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
                className="ps-8"
                data-testid="input-library-search"
              />
            </div>

            {!librarySearch.trim() && (
              <div className="flex gap-1 overflow-x-auto pb-1">
                {FIXTURE_CATEGORIES.map(cat => (
                  <Button
                    key={cat.id}
                    size="sm"
                    variant={libraryCategory === cat.id ? "default" : "outline"}
                    onClick={() => setLibraryCategory(cat.id)}
                    className="toggle-elevate whitespace-nowrap flex-shrink-0"
                    data-testid={`button-fixture-category-${cat.id}`}
                  >
                    {t(cat.labelAr, cat.labelEn)}
                  </Button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5 max-h-48 overflow-y-auto">
              {filteredFixtures.map(fixture => (
                <button
                  key={fixture.id}
                  className={`flex flex-col items-center gap-0.5 p-2 rounded-md border transition-colors ${
                    pendingFixture?.id === fixture.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover-elevate"
                  }`}
                  onClick={() => selectFixtureFromLibrary(fixture)}
                  data-testid={`button-fixture-${fixture.id}`}
                >
                  <div
                    className="flex items-center justify-center rounded-md text-sm font-bold"
                    style={{
                      width: 32,
                      height: 32,
                      backgroundColor: fixture.color + "22",
                      color: fixture.color,
                      border: `1.5px solid ${fixture.color}`,
                    }}
                  >
                    {fixture.symbol}
                  </div>
                  <span className="text-[10px] text-center leading-tight text-foreground truncate w-full">
                    {t(fixture.labelAr, fixture.labelEn)}
                  </span>
                  <span className="text-[9px] text-muted-foreground">
                    {fixture.widthGrid}x{fixture.heightGrid}
                  </span>
                </button>
              ))}
              {filteredFixtures.length === 0 && (
                <div className="col-span-full text-center text-xs text-muted-foreground py-4" data-testid="text-no-fixtures">
                  {t("لا توجد نتائج", "No results found")}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tool === "wall" && (
        <div className="flex items-center gap-2 flex-wrap">
          <Label className="text-xs">{t("سمك الجدار", "Wall Thickness")}</Label>
          <Input
            type="number"
            min={2}
            max={12}
            value={wallThickness}
            onChange={(e) => setWallThickness(Number(e.target.value))}
            className="w-20"
            data-testid="input-wall-thickness"
          />
        </div>
      )}

      {tool === "cabinet" && (
        <div className="flex items-center gap-2 flex-wrap">
          <Label className="text-xs">{t("لون الخزانة", "Cabinet Color")}</Label>
          <div className="flex items-center gap-1">
            {cabinetColorOptions.map((opt) => (
              <button
                key={opt.value}
                className={`w-6 h-6 rounded-md border-2 ${
                  cabinetColor === opt.value
                    ? "border-foreground"
                    : "border-transparent"
                }`}
                style={{ backgroundColor: opt.value }}
                onClick={() => setCabinetColor(opt.value)}
                title={opt.label}
                data-testid={`button-cabinet-color-${opt.label.toLowerCase().replace(/\s/g, "-")}`}
              />
            ))}
          </div>
        </div>
      )}

      {textInputPos && (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            placeholder={t("اكتب النص...", "Type text...")}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTextElement()}
            data-testid="input-text-tool"
          />
          <Button size="sm" onClick={addTextElement} data-testid="button-add-text">
            {t("إضافة", "Add")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setTextInputPos(null)}
            data-testid="button-cancel-text"
          >
            {t("إلغاء", "Cancel")}
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="icon"
          variant="ghost"
          onClick={clearCanvas}
          data-testid="button-clear"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={exportPNG}
          data-testid="button-download-sketch"
        >
          <Download className="w-4 h-4" />
        </Button>
        {onSave && (
          <Button size="sm" variant="default" onClick={handleSave} data-testid="button-save-sketch">
            <Save className="w-4 h-4" />
            <span className="ms-1">{t("حفظ", "Save")}</span>
          </Button>
        )}
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground" data-testid="text-element-count">
          {t("العناصر", "Elements")}: {elements.length}
        </span>
      </div>

      <div
        className="border border-border rounded-md overflow-hidden bg-white dark:bg-gray-50"
        style={{ cursor: cursorStyle }}
      >
        <Stage
          ref={stageRef}
          width={containerWidth}
          height={containerHeight}
          scaleX={stageScale}
          scaleY={stageScale}
          x={stagePos.x}
          y={stagePos.y}
          draggable={tool === "select" && !selectedId}
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          onWheel={handleWheel}
          onDragEnd={(e) => {
            if (e.target === stageRef.current) {
              setStagePos({ x: e.target.x(), y: e.target.y() });
            }
          }}
          style={{ width: "100%", height: "auto", maxWidth: "100%" }}
        >
          <Layer>
            <GridBackground
              width={containerWidth}
              height={containerHeight}
              gridSize={gridSize}
              scale={stageScale}
              offsetX={stagePos.x}
              offsetY={stagePos.y}
            />
          </Layer>
          <Layer>
            {elements.map(renderElement)}
            {renderCurrentElement()}
            <Transformer
              ref={transformerRef}
              boundBoxFunc={(oldBox, newBox) => {
                if (newBox.width < 10 || newBox.height < 10) return oldBox;
                return newBox;
              }}
              rotateEnabled={true}
              enabledAnchors={[
                "top-left",
                "top-right",
                "bottom-left",
                "bottom-right",
                "middle-left",
                "middle-right",
                "top-center",
                "bottom-center",
              ]}
            />
          </Layer>
        </Stage>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span>{t("عجلة الفأرة: تكبير/تصغير", "Mouse wheel: Zoom in/out")}</span>
        <span>{t("سحب (وضع التحديد): تحريك اللوحة", "Drag (select mode): Pan canvas")}</span>
        <span>{t("Ctrl+Z: تراجع | Ctrl+Y: إعادة", "Ctrl+Z: Undo | Ctrl+Y: Redo")}</span>
        <span>{t("Delete: حذف العنصر المحدد", "Delete: Remove selected element")}</span>
      </div>
    </div>
  );
}