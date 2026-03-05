import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { DesignAssignment, Customer } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, Pencil, Square, Minus, Type, Undo2, Redo2,
  Save, Send, Ruler, FileImage, Trash2, Palette, Eye,
  PenTool, Download,
} from "lucide-react";

const statusConfig: Record<string, { ar: string; en: string; color: string }> = {
  pending: { ar: "في الانتظار", en: "Pending", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  designing: { ar: "قيد التصميم", en: "Designing", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  completed: { ar: "مكتمل", en: "Completed", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  revision: { ar: "مراجعة", en: "Revision", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
};

type DrawTool = "select" | "rectangle" | "line" | "text" | "freehand" | "dimension";

interface DrawElement {
  id: string;
  type: "rectangle" | "line" | "text" | "freehand" | "dimension";
  x: number;
  y: number;
  width?: number;
  height?: number;
  x2?: number;
  y2?: number;
  text?: string;
  points?: { x: number; y: number }[];
  color: string;
  lineWidth: number;
  fontSize?: number;
}

interface HistoryState {
  elements: DrawElement[];
}

function SketchCanvas({
  initialData,
  onSave,
}: {
  initialData?: string;
  onSave: (data: string, imageDataUrl: string) => void;
}) {
  const { t } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<DrawTool>("rectangle");
  const [color, setColor] = useState("#1e293b");
  const [lineWidth, setLineWidth] = useState(2);
  const [fontSize, setFontSize] = useState(14);
  const [elements, setElements] = useState<DrawElement[]>([]);
  const [history, setHistory] = useState<HistoryState[]>([{ elements: [] }]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentElement, setCurrentElement] = useState<DrawElement | null>(null);
  const [textInput, setTextInput] = useState("");
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);

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

  const pushHistory = useCallback((newElements: DrawElement[]) => {
    setHistory(prev => {
      const trimmed = prev.slice(0, historyIndex + 1);
      return [...trimmed, { elements: newElements }];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setElements(history[newIndex].elements);
    }
  }, [historyIndex, history]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setElements(history[newIndex].elements);
    }
  }, [historyIndex, history]);

  const drawAll = useCallback((ctx: CanvasRenderingContext2D, els: DrawElement[], current?: DrawElement | null) => {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    const drawGrid = () => {
      ctx.strokeStyle = "#f0f0f0";
      ctx.lineWidth = 0.5;
      for (let x = 0; x < ctx.canvas.width; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, ctx.canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < ctx.canvas.height; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(ctx.canvas.width, y);
        ctx.stroke();
      }
    };
    drawGrid();

    const allEls = current ? [...els, current] : els;
    allEls.forEach(el => {
      ctx.strokeStyle = el.color;
      ctx.fillStyle = el.color;
      ctx.lineWidth = el.lineWidth;

      switch (el.type) {
        case "rectangle":
          ctx.strokeRect(el.x, el.y, el.width || 0, el.height || 0);
          break;
        case "line":
        case "dimension":
          ctx.beginPath();
          ctx.moveTo(el.x, el.y);
          ctx.lineTo(el.x2 || el.x, el.y2 || el.y);
          ctx.stroke();
          if (el.type === "dimension") {
            const dx = (el.x2 || el.x) - el.x;
            const dy = (el.y2 || el.y) - el.y;
            const len = Math.round(Math.sqrt(dx * dx + dy * dy));
            const mx = (el.x + (el.x2 || el.x)) / 2;
            const my = (el.y + (el.y2 || el.y)) / 2;
            ctx.font = "12px sans-serif";
            ctx.fillStyle = el.color;
            ctx.textAlign = "center";
            ctx.fillText(`${len}px`, mx, my - 5);

            const arrowSize = 8;
            const angle = Math.atan2(dy, dx);
            ctx.beginPath();
            ctx.moveTo(el.x, el.y);
            ctx.lineTo(el.x + arrowSize * Math.cos(angle - 0.4), el.y + arrowSize * Math.sin(angle - 0.4));
            ctx.moveTo(el.x, el.y);
            ctx.lineTo(el.x + arrowSize * Math.cos(angle + 0.4), el.y + arrowSize * Math.sin(angle + 0.4));
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(el.x2 || el.x, el.y2 || el.y);
            ctx.lineTo((el.x2 || el.x) - arrowSize * Math.cos(angle - 0.4), (el.y2 || el.y) - arrowSize * Math.sin(angle - 0.4));
            ctx.moveTo(el.x2 || el.x, el.y2 || el.y);
            ctx.lineTo((el.x2 || el.x) - arrowSize * Math.cos(angle + 0.4), (el.y2 || el.y) - arrowSize * Math.sin(angle + 0.4));
            ctx.stroke();
          }
          break;
        case "text":
          ctx.font = `${el.fontSize || 14}px sans-serif`;
          ctx.textBaseline = "top";
          ctx.fillText(el.text || "", el.x, el.y);
          break;
        case "freehand":
          if (el.points && el.points.length > 1) {
            ctx.beginPath();
            ctx.moveTo(el.points[0].x, el.points[0].y);
            el.points.forEach(p => ctx.lineTo(p.x, p.y));
            ctx.stroke();
          }
          break;
      }
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawAll(ctx, elements, currentElement);
  }, [elements, currentElement, drawAll]);

  const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === "select") return;
    if (tool === "text") {
      setTextPos(getCanvasPos(e));
      return;
    }
    const pos = getCanvasPos(e);
    setIsDrawing(true);
    setStartPos(pos);

    if (tool === "freehand") {
      setCurrentElement({
        id: crypto.randomUUID(),
        type: "freehand",
        x: pos.x,
        y: pos.y,
        points: [pos],
        color,
        lineWidth,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPos) return;
    const pos = getCanvasPos(e);

    if (tool === "freehand" && currentElement) {
      setCurrentElement({
        ...currentElement,
        points: [...(currentElement.points || []), pos],
      });
      return;
    }

    const el: DrawElement = {
      id: crypto.randomUUID(),
      type: tool === "dimension" ? "dimension" : tool as any,
      x: startPos.x,
      y: startPos.y,
      color,
      lineWidth,
    };

    if (tool === "rectangle") {
      el.width = pos.x - startPos.x;
      el.height = pos.y - startPos.y;
    } else if (tool === "line" || tool === "dimension") {
      el.x2 = pos.x;
      el.y2 = pos.y;
    }
    setCurrentElement(el);
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentElement) {
      setIsDrawing(false);
      return;
    }
    const newElements = [...elements, currentElement];
    setElements(newElements);
    pushHistory(newElements);
    setCurrentElement(null);
    setIsDrawing(false);
    setStartPos(null);
  };

  const addText = () => {
    if (!textPos || !textInput.trim()) return;
    const el: DrawElement = {
      id: crypto.randomUUID(),
      type: "text",
      x: textPos.x,
      y: textPos.y,
      text: textInput,
      color,
      lineWidth,
      fontSize,
    };
    const newElements = [...elements, el];
    setElements(newElements);
    pushHistory(newElements);
    setTextInput("");
    setTextPos(null);
  };

  const clearCanvas = () => {
    setElements([]);
    pushHistory([]);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const jsonData = JSON.stringify(elements);
    onSave(jsonData, dataUrl);
  };

  const downloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "sketch.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const tools: { id: DrawTool; icon: any; labelAr: string; labelEn: string }[] = [
    { id: "rectangle", icon: Square, labelAr: "مستطيل", labelEn: "Rectangle" },
    { id: "line", icon: Minus, labelAr: "خط", labelEn: "Line" },
    { id: "dimension", icon: Ruler, labelAr: "أبعاد", labelEn: "Dimension" },
    { id: "text", icon: Type, labelAr: "نص", labelEn: "Text" },
    { id: "freehand", icon: PenTool, labelAr: "حر", labelEn: "Freehand" },
  ];

  const colorPalette = ["#1e293b", "#dc2626", "#2563eb", "#16a34a", "#ca8a04", "#9333ea", "#0891b2", "#e11d48"];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {tools.map(({ id, icon: Icon, labelAr, labelEn }) => (
          <Button
            key={id}
            size="sm"
            variant={tool === id ? "default" : "outline"}
            onClick={() => setTool(id)}
            className="toggle-elevate"
            data-testid={`button-tool-${id}`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline ms-1">{t(labelAr, labelEn)}</span>
          </Button>
        ))}

        <div className="border-s border-border ps-2 ms-1 flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={undo} disabled={historyIndex <= 0} data-testid="button-undo">
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={redo} disabled={historyIndex >= history.length - 1} data-testid="button-redo">
            <Redo2 className="w-4 h-4" />
          </Button>
        </div>

        <div className="border-s border-border ps-2 ms-1 flex items-center gap-1">
          {colorPalette.map(c => (
            <button
              key={c}
              className={`w-6 h-6 rounded-md border-2 ${color === c ? "border-foreground" : "border-transparent"}`}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
              data-testid={`button-color-${c.replace("#", "")}`}
            />
          ))}
        </div>

        <div className="border-s border-border ps-2 ms-1 flex items-center gap-2">
          <Label className="text-xs">{t("السمك", "Width")}</Label>
          <Input
            type="number"
            min={1}
            max={10}
            value={lineWidth}
            onChange={e => setLineWidth(Number(e.target.value))}
            className="w-16"
            data-testid="input-line-width"
          />
        </div>

        <div className="border-s border-border ps-2 ms-1 flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={clearCanvas} data-testid="button-clear">
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={downloadImage} data-testid="button-download-sketch">
            <Download className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="default" onClick={handleSave} data-testid="button-save-sketch">
            <Save className="w-4 h-4" />
            <span className="ms-1">{t("حفظ", "Save")}</span>
          </Button>
        </div>
      </div>

      {textPos && (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            placeholder={t("اكتب النص...", "Type text...")}
            value={textInput}
            onChange={e => setTextInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addText()}
            data-testid="input-text-tool"
          />
          <Label className="text-xs">{t("الحجم", "Size")}</Label>
          <Input
            type="number"
            min={10}
            max={48}
            value={fontSize}
            onChange={e => setFontSize(Number(e.target.value))}
            className="w-16"
            data-testid="input-font-size"
          />
          <Button size="sm" onClick={addText} data-testid="button-add-text">
            {t("إضافة", "Add")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setTextPos(null)} data-testid="button-cancel-text">
            {t("إلغاء", "Cancel")}
          </Button>
        </div>
      )}

      <div className="border border-border rounded-md overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          width={900}
          height={500}
          className="w-full cursor-crosshair"
          style={{ maxWidth: "100%", height: "auto", aspectRatio: "900/500" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          data-testid="canvas-sketch"
        />
      </div>
    </div>
  );
}

export default function DesignerBoardPage() {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedAssignment, setSelectedAssignment] = useState<DesignAssignment | null>(null);
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [activeTab, setActiveTab] = useState("assignments");

  const { data: assignments = [], isLoading } = useQuery<DesignAssignment[]>({
    queryKey: ["/api/design-assignments"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest("PATCH", `/api/design-assignments/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/design-assignments"] });
      toast({ title: t("تم الحفظ بنجاح", "Saved successfully") });
    },
    onError: () => {
      toast({ title: t("حدث خطأ", "Error occurred"), variant: "destructive" });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/design-assignments/${id}/submit`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/design-assignments"] });
      toast({ title: t("تم إرسال التصميم للمبيعات بنجاح", "Design submitted to sales successfully") });
      setSelectedAssignment(null);
      setActiveTab("assignments");
    },
    onError: () => {
      toast({ title: t("حدث خطأ", "Error occurred"), variant: "destructive" });
    },
  });

  const getCustomerName = (customerId: number) => {
    return customers.find(c => c.id === customerId)?.fullName || `#${customerId}`;
  };

  const selectAssignment = (a: DesignAssignment) => {
    setSelectedAssignment(a);
    setMeasurements(typeof a.measurements === "object" && a.measurements ? a.measurements as Record<string, string> : {});
    setNotes(a.notes || "");
    setActiveTab("design");
    if (a.status === "pending") {
      updateMutation.mutate({ id: a.id, data: { status: "designing" } });
    }
  };

  const handleSketchSave = (jsonData: string, imageDataUrl: string) => {
    if (!selectedAssignment) return;
    updateMutation.mutate({
      id: selectedAssignment.id,
      data: {
        sketchData: jsonData,
        sketchImage: imageDataUrl,
        measurements,
        notes,
      },
    });
  };

  const handleSubmitToSales = () => {
    if (!selectedAssignment) return;
    updateMutation.mutate({
      id: selectedAssignment.id,
      data: {
        measurements,
        notes,
      },
    }, {
      onSuccess: () => {
        submitMutation.mutate(selectedAssignment.id);
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" data-testid="loading-designer-board">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const pendingAssignments = assignments.filter(a => a.status === "pending" || a.status === "revision");
  const activeAssignments = assignments.filter(a => a.status === "designing");
  const completedAssignments = assignments.filter(a => a.status === "completed");

  const isRTL = lang === "ar";

  return (
    <div className="space-y-6 p-4 md:p-6" dir={isRTL ? "rtl" : "ltr"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={isRTL ? "text-right" : "text-left"}>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            {t("لوحة المصمم", "Designer Board")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1" data-testid="text-page-subtitle">
            {t("إدارة طلبات التصميم والرسومات", "Manage design assignments and sketches")}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="no-default-active-elevate" data-testid="badge-pending-count">
            {t("معلق", "Pending")}: {pendingAssignments.length}
          </Badge>
          <Badge className="no-default-active-elevate" data-testid="badge-active-count">
            {t("نشط", "Active")}: {activeAssignments.length}
          </Badge>
          <Badge className="no-default-active-elevate" data-testid="badge-completed-count">
            {t("مكتمل", "Done")}: {completedAssignments.length}
          </Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-designer-board">
          <TabsTrigger value="assignments" data-testid="tab-assignments">
            {t("الطلبات", "Assignments")}
          </TabsTrigger>
          <TabsTrigger value="design" disabled={!selectedAssignment} data-testid="tab-design">
            {t("التصميم", "Design")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assignments" className="space-y-4">
          {assignments.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <div className="text-center">
                  <Pencil className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground" data-testid="text-no-assignments">
                    {t("لا توجد طلبات تصميم حالياً", "No design assignments at the moment")}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {assignments.map(a => {
                const status = statusConfig[a.status] || statusConfig.pending;
                return (
                  <Card key={a.id} className="hover-elevate cursor-pointer" onClick={() => selectAssignment(a)} data-testid={`card-assignment-${a.id}`}>
                    <CardHeader className={`flex items-center justify-between gap-2 pb-2 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                      <Badge className={`${status.color} no-default-active-elevate shrink-0`} data-testid={`badge-status-${a.id}`}>
                        {t(status.ar, status.en)}
                      </Badge>
                      <CardTitle className={`text-base truncate ${isRTL ? "text-right" : "text-left"}`}>
                        {getCustomerName(a.customerId)}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {a.productDescription && (
                        <p className={`text-sm text-muted-foreground line-clamp-2 ${isRTL ? "text-right" : "text-left"}`} data-testid={`text-description-${a.id}`}>
                          {a.productDescription}
                        </p>
                      )}
                      {a.notes && (
                        <p className={`text-xs text-muted-foreground line-clamp-1 ${isRTL ? "text-right" : "text-left"}`}>
                          {a.notes}
                        </p>
                      )}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-xs text-muted-foreground" data-testid={`text-date-${a.id}`}>
                          {new Date(a.createdAt).toLocaleDateString(isRTL ? "ar-SA" : "en-US")}
                        </span>
                        {a.sketchImage && (
                          <Badge variant="outline" className="no-default-active-elevate">
                            <FileImage className="w-3 h-3 me-1" />
                            {t("يوجد رسم", "Has sketch")}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="design" className="space-y-4">
          {selectedAssignment && (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <div className={isRTL ? "text-right" : "text-left"}>
                    <CardTitle className="text-lg" data-testid="text-design-customer">
                      {t("تصميم لـ", "Design for")} {getCustomerName(selectedAssignment.customerId)}
                    </CardTitle>
                    {selectedAssignment.productDescription && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {selectedAssignment.productDescription}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <Button
                      variant="default"
                      onClick={handleSubmitToSales}
                      disabled={submitMutation.isPending || updateMutation.isPending}
                      data-testid="button-submit-to-sales"
                    >
                      {submitMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      <span className="ms-1">{t("إرسال للمبيعات", "Send to Sales")}</span>
                    </Button>
                  </div>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Pencil className="w-4 h-4" />
                    {t("أداة الرسم", "Sketch Tool")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div dir="ltr">
                    <SketchCanvas
                      initialData={selectedAssignment.sketchData || undefined}
                      onSave={handleSketchSave}
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Ruler className="w-4 h-4" />
                      {t("المقاسات", "Measurements")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {["width", "height", "depth", "custom1", "custom2"].map(key => (
                      <div key={key} className="flex items-center gap-2">
                        <Label className={`w-24 text-sm ${isRTL ? "text-right" : "text-left"}`}>
                          {key === "width" ? t("العرض", "Width") :
                           key === "height" ? t("الارتفاع", "Height") :
                           key === "depth" ? t("العمق", "Depth") :
                           key === "custom1" ? t("مخصص 1", "Custom 1") :
                           t("مخصص 2", "Custom 2")}
                        </Label>
                        <Input
                          value={measurements[key] || ""}
                          onChange={e => setMeasurements(prev => ({ ...prev, [key]: e.target.value }))}
                          placeholder={t("سم", "cm")}
                          dir="ltr"
                          data-testid={`input-measurement-${key}`}
                        />
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className={`text-base ${isRTL ? "text-right" : "text-left"}`}>{t("ملاحظات المصمم", "Designer Notes")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      rows={8}
                      placeholder={t("أضف ملاحظاتك هنا...", "Add your notes here...")}
                      className={isRTL ? "text-right" : "text-left"}
                      data-testid="textarea-designer-notes"
                    />
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
