/// <reference types="google.maps" />
import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { MapPin, Plus, Trash2, Edit2, CheckCircle2, AlertCircle } from "lucide-react";

interface LocationZone {
  id: number;
  nameAr: string;
  nameEn: string;
  type: "factory" | "showroom" | "other";
  centerLat: string | null;
  centerLng: string | null;
  radiusMeters: number | null;
  polygonCoords: unknown;
  isActive: boolean;
  createdAt: string;
}

const ZONE_TYPE_COLORS: Record<string, string> = {
  factory: "#f59e0b",
  showroom: "#3b82f6",
  other: "#8b5cf6",
};

const ZONE_TYPE_LABELS: Record<string, string> = {
  factory: "مصنع",
  showroom: "معرض",
  other: "أخرى",
};

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string;

export default function AttendanceZonesMap() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);
  const circleRefs = useRef<Map<number, google.maps.Circle>>(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [drawingCircle, setDrawingCircle] = useState<google.maps.Circle | null>(null);
  const drawingCircleRef = useRef<google.maps.Circle | null>(null);
  const [drawingRect, setDrawingRect] = useState<google.maps.Rectangle | null>(null);
  const drawingRectRef = useRef<google.maps.Rectangle | null>(null);
  const rectRefs = useRef<Map<number, google.maps.Rectangle>>(new Map());
  const [addDialog, setAddDialog] = useState(false);
  const [editZone, setEditZone] = useState<LocationZone | null>(null);
  const [formData, setFormData] = useState({
    nameAr: "",
    nameEn: "",
    type: "factory" as "factory" | "showroom" | "other",
    radiusMeters: 200,
  });
  const [pendingCenter, setPendingCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [pendingRadius, setPendingRadius] = useState<number>(200);
  const [pendingBounds, setPendingBounds] = useState<{ north: number; south: number; east: number; west: number } | null>(null);

  const { data: zones = [], isLoading } = useQuery<LocationZone[]>({
    queryKey: ["/api/attendance/zones"],
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/attendance/zones", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/attendance/zones"] });
      setAddDialog(false);
      if (drawingCircleRef.current) {
        drawingCircleRef.current.setMap(null);
        drawingCircleRef.current = null;
      }
      if (drawingRectRef.current) {
        drawingRectRef.current.setMap(null);
        drawingRectRef.current = null;
      }
      setDrawingCircle(null);
      setDrawingRect(null);
      setPendingCenter(null);
      setPendingBounds(null);
      setFormData({ nameAr: "", nameEn: "", type: "factory", radiusMeters: 200 });
      toast({ title: "تم إضافة المنطقة بنجاح" });
    },
    onError: () => toast({ title: "خطأ", description: "تعذّر إضافة المنطقة", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...rest }: { id: number; nameAr: string; nameEn: string; type: string; radiusMeters: number | null }) =>
      apiRequest("PATCH", `/api/attendance/zones/${id}`, rest),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/attendance/zones"] });
      setEditZone(null);
      toast({ title: "تم تحديث المنطقة" });
    },
    onError: () => toast({ title: "خطأ", description: "تعذّر تحديث المنطقة", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/attendance/zones/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/attendance/zones"] });
      toast({ title: "تم حذف المنطقة" });
    },
    onError: () => toast({ title: "خطأ", description: "تعذّر حذف المنطقة", variant: "destructive" }),
  });

  const initMap = useCallback(async () => {
    if (!mapRef.current || mapInstanceRef.current) return;
    if (!MAPS_KEY) {
      setMapError("مفتاح Google Maps غير مضبوط. أضف VITE_GOOGLE_MAPS_KEY في متغيرات البيئة.");
      return;
    }
    try {
      setOptions({ key: MAPS_KEY, v: "weekly" });
      const { Map } = await importLibrary("maps") as google.maps.MapsLibrary;
      const { DrawingManager, OverlayType } = await importLibrary("drawing") as google.maps.DrawingLibrary;

      const map = new Map(mapRef.current, {
        center: { lat: 24.7136, lng: 46.6753 },
        zoom: 13,
        mapTypeId: "roadmap",
        gestureHandling: "cooperative",
        streetViewControl: false,
        fullscreenControl: true,
      });
      mapInstanceRef.current = map;

      const shapeOptions = {
        fillColor: "#3b82f6",
        fillOpacity: 0.2,
        strokeWeight: 2,
        strokeColor: "#3b82f6",
        clickable: false,
        editable: true,
        zIndex: 1,
      };
      const drawingManager = new DrawingManager({
        drawingMode: null,
        drawingControl: true,
        drawingControlOptions: {
          position: google.maps.ControlPosition.TOP_CENTER,
          drawingModes: [OverlayType.CIRCLE, OverlayType.RECTANGLE],
        },
        circleOptions: shapeOptions,
        rectangleOptions: shapeOptions,
      });
      drawingManager.setMap(map);
      drawingManagerRef.current = drawingManager;

      google.maps.event.addListener(drawingManager, "circlecomplete", (circle: google.maps.Circle) => {
        const center = circle.getCenter();
        const radius = circle.getRadius();
        if (center && radius) {
          setPendingCenter({ lat: center.lat(), lng: center.lng() });
          setPendingRadius(Math.round(radius));
          setPendingBounds(null);
          drawingCircleRef.current = circle;
          setDrawingCircle(circle);
          setFormData(prev => ({ ...prev, radiusMeters: Math.round(radius) }));
          setAddDialog(true);
          drawingManager.setDrawingMode(null);
        }
      });

      google.maps.event.addListener(drawingManager, "rectanglecomplete", (rect: google.maps.Rectangle) => {
        const bounds = rect.getBounds();
        if (bounds) {
          const ne = bounds.getNorthEast();
          const sw = bounds.getSouthWest();
          const centerLat = (ne.lat() + sw.lat()) / 2;
          const centerLng = (ne.lng() + sw.lng()) / 2;
          setPendingCenter({ lat: centerLat, lng: centerLng });
          setPendingBounds({ north: ne.lat(), east: ne.lng(), south: sw.lat(), west: sw.lng() });
          setPendingRadius(0);
          drawingRectRef.current = rect;
          setDrawingRect(rect);
          setAddDialog(true);
          drawingManager.setDrawingMode(null);
        }
      });

      setMapLoaded(true);
    } catch (err) {
      setMapError("تعذّر تحميل خريطة Google. تحقق من مفتاح API.");
      console.error("Map load error:", err);
    }
  }, []);

  useEffect(() => {
    initMap();
    return () => {
      circleRefs.current.forEach(c => c.setMap(null));
      circleRefs.current.clear();
      rectRefs.current.forEach(r => r.setMap(null));
      rectRefs.current.clear();
      if (drawingManagerRef.current) {
        drawingManagerRef.current.setMap(null);
        drawingManagerRef.current = null;
      }
      mapInstanceRef.current = null;
    };
  }, [initMap]);

  useEffect(() => {
    if (!mapInstanceRef.current || !mapLoaded || isLoading) return;

    circleRefs.current.forEach(c => c.setMap(null));
    circleRefs.current.clear();
    rectRefs.current.forEach(r => r.setMap(null));
    rectRefs.current.clear();

    zones.forEach(zone => {
      if (!zone.centerLat || !zone.centerLng) return;
      const lat = parseFloat(zone.centerLat);
      const lng = parseFloat(zone.centerLng);
      const color = ZONE_TYPE_COLORS[zone.type] || "#6b7280";

      const polyCoords = Array.isArray(zone.polygonCoords) ? zone.polygonCoords as { lat: number; lng: number }[] : [];
      const isRect = polyCoords.length === 4 && !zone.radiusMeters;

      const infoContent = `<div style="direction:rtl;padding:4px 8px;font-family:sans-serif">
        <strong>${zone.nameAr}</strong><br/>
        <span style="color:#666;font-size:12px">${ZONE_TYPE_LABELS[zone.type] || zone.type}${isRect ? " · مستطيل" : ` · ${zone.radiusMeters || 200}م`}</span>
      </div>`;
      const infoWindow = new google.maps.InfoWindow({ content: infoContent });

      if (isRect) {
        const north = Math.max(...polyCoords.map(p => p.lat));
        const south = Math.min(...polyCoords.map(p => p.lat));
        const east = Math.max(...polyCoords.map(p => p.lng));
        const west = Math.min(...polyCoords.map(p => p.lng));
        const rect = new google.maps.Rectangle({
          bounds: { north, south, east, west },
          fillColor: color,
          fillOpacity: 0.15,
          strokeColor: color,
          strokeWeight: 2,
          map: mapInstanceRef.current,
          clickable: true,
        });
        rect.addListener("click", () => {
          infoWindow.setPosition({ lat, lng });
          infoWindow.open(mapInstanceRef.current);
        });
        rectRefs.current.set(zone.id, rect);
      } else {
        const circle = new google.maps.Circle({
          center: { lat, lng },
          radius: zone.radiusMeters || 200,
          fillColor: color,
          fillOpacity: 0.15,
          strokeColor: color,
          strokeWeight: 2,
          map: mapInstanceRef.current,
          clickable: true,
        });
        circle.addListener("click", () => {
          infoWindow.setPosition({ lat, lng });
          infoWindow.open(mapInstanceRef.current);
        });
        circleRefs.current.set(zone.id, circle);
      }
    });

    if (zones.length > 0 && zones[0].centerLat && zones[0].centerLng) {
      mapInstanceRef.current.setCenter({
        lat: parseFloat(zones[0].centerLat),
        lng: parseFloat(zones[0].centerLng),
      });
    }
  }, [zones, mapLoaded, isLoading]);

  const handleCancelDraw = () => {
    if (drawingCircleRef.current) {
      drawingCircleRef.current.setMap(null);
      drawingCircleRef.current = null;
    }
    if (drawingRectRef.current) {
      drawingRectRef.current.setMap(null);
      drawingRectRef.current = null;
    }
    setDrawingCircle(null);
    setDrawingRect(null);
    setPendingCenter(null);
    setPendingBounds(null);
    setAddDialog(false);
  };

  const handleSaveZone = () => {
    if (!pendingCenter) return;
    const isRect = !!pendingBounds;
    createMutation.mutate({
      nameAr: formData.nameAr,
      nameEn: formData.nameEn || formData.nameAr,
      type: formData.type,
      centerLat: String(pendingCenter.lat),
      centerLng: String(pendingCenter.lng),
      radiusMeters: isRect ? null : pendingRadius,
      polygonCoords: isRect
        ? [
            { lat: pendingBounds!.north, lng: pendingBounds!.east },
            { lat: pendingBounds!.north, lng: pendingBounds!.west },
            { lat: pendingBounds!.south, lng: pendingBounds!.west },
            { lat: pendingBounds!.south, lng: pendingBounds!.east },
          ]
        : [],
      isActive: true,
    });
  };

  const handleUpdateZone = () => {
    if (!editZone) return;
    const isRectZone = Array.isArray(editZone.polygonCoords) && (editZone.polygonCoords as unknown[]).length === 4 && !editZone.radiusMeters;
    updateMutation.mutate({
      id: editZone.id,
      nameAr: formData.nameAr,
      nameEn: formData.nameEn || formData.nameAr,
      type: formData.type,
      radiusMeters: isRectZone ? null : formData.radiusMeters,
    });
  };

  const openEdit = (zone: LocationZone) => {
    setEditZone(zone);
    setFormData({ nameAr: zone.nameAr, nameEn: zone.nameEn, type: zone.type, radiusMeters: zone.radiusMeters || 200 });
  };

  const focusZone = (zone: LocationZone) => {
    if (!mapInstanceRef.current || !zone.centerLat || !zone.centerLng) return;
    mapInstanceRef.current.setCenter({ lat: parseFloat(zone.centerLat), lng: parseFloat(zone.centerLng) });
    mapInstanceRef.current.setZoom(16);
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">مناطق الدوام الجغرافية</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            ارسم دائرة على الخريطة لإضافة منطقة دوام جديدة
          </p>
        </div>
        <Badge variant="outline" className="gap-1">
          <MapPin className="w-3 h-3" />
          {zones.length} منطقة
        </Badge>
      </div>

      {mapError ? (
        <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-destructive text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{mapError}</span>
        </div>
      ) : (
        <div
          className="relative w-full rounded-xl border overflow-hidden bg-muted/20"
          style={{ height: "440px" }}
        >
          <div
            ref={mapRef}
            className="absolute inset-0 w-full h-full"
            data-testid="map-zones"
          />
          {!mapLoaded && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm animate-pulse bg-muted/20 pointer-events-none">
              جاري تحميل الخريطة...
            </div>
          )}
        </div>
      )}

      {mapLoaded && !mapError && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Plus className="w-3 h-3" />
          استخدم أداة الرسم في أعلى الخريطة لرسم دائرة حول موقع الدوام
        </p>
      )}

      {zones.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">المناطق المحفوظة</h4>
          <div className="grid gap-2">
            {zones.map(zone => (
              <div
                key={zone.id}
                className="flex items-center gap-3 bg-muted/20 border rounded-lg px-3 py-2.5"
                data-testid={`zone-item-${zone.id}`}
              >
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: ZONE_TYPE_COLORS[zone.type] || "#6b7280" }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{zone.nameAr}</p>
                  <p className="text-xs text-muted-foreground">
                    {ZONE_TYPE_LABELS[zone.type]} · {
                      Array.isArray(zone.polygonCoords) && (zone.polygonCoords as unknown[]).length === 4 && !zone.radiusMeters
                        ? "مستطيل"
                        : `نصف قطر ${zone.radiusMeters || 200}م`
                    }
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  {zone.centerLat && zone.centerLng && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => focusZone(zone)}
                      data-testid={`button-focus-zone-${zone.id}`}
                    >
                      <MapPin className="w-3.5 h-3.5 text-primary" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => openEdit(zone)}
                    data-testid={`button-edit-zone-${zone.id}`}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 hover:text-destructive"
                    onClick={() => deleteMutation.mutate(zone.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-zone-${zone.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {zones.length === 0 && !isLoading && (
        <div className="text-center py-8 text-muted-foreground">
          <MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">لا توجد مناطق دوام محددة بعد</p>
          <p className="text-xs mt-1">ارسم دائرة أو مستطيلاً على الخريطة لإضافة أول منطقة</p>
        </div>
      )}

      <Dialog open={addDialog} onOpenChange={open => !open && handleCancelDraw()}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>إضافة منطقة دوام جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            {pendingCenter && (
              <div className="bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 rounded-lg px-3 py-2 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  {pendingBounds
                    ? `مستطيل · المركز: ${pendingCenter.lat.toFixed(4)}, ${pendingCenter.lng.toFixed(4)}`
                    : `الموقع: ${pendingCenter.lat.toFixed(5)}, ${pendingCenter.lng.toFixed(5)} · نصف القطر: ${pendingRadius}م`
                  }
                </span>
              </div>
            )}
            <div className="space-y-1">
              <label className="text-sm font-medium">اسم المنطقة (عربي)</label>
              <Input
                placeholder="مثال: المصنع الرئيسي"
                value={formData.nameAr}
                onChange={e => setFormData(p => ({ ...p, nameAr: e.target.value }))}
                data-testid="input-zone-name-ar"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">اسم المنطقة (إنجليزي)</label>
              <Input
                placeholder="e.g. Main Factory"
                value={formData.nameEn}
                onChange={e => setFormData(p => ({ ...p, nameEn: e.target.value }))}
                data-testid="input-zone-name-en"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">نوع المنطقة</label>
              <Select value={formData.type} onValueChange={v => setFormData(p => ({ ...p, type: v as "factory" | "showroom" | "other" }))}>
                <SelectTrigger data-testid="select-zone-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="factory">مصنع</SelectItem>
                  <SelectItem value="showroom">معرض</SelectItem>
                  <SelectItem value="other">أخرى</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!pendingBounds && (
              <div className="space-y-1">
                <label className="text-sm font-medium">نصف القطر (متر)</label>
                <Input
                  type="number"
                  min={50}
                  max={5000}
                  value={pendingRadius}
                  onChange={e => setPendingRadius(parseInt(e.target.value) || 200)}
                  data-testid="input-zone-radius"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelDraw}>إلغاء</Button>
            <Button
              onClick={handleSaveZone}
              disabled={!formData.nameAr || createMutation.isPending}
              data-testid="button-save-zone"
            >
              {createMutation.isPending ? "جاري الحفظ..." : "حفظ المنطقة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editZone} onOpenChange={open => !open && setEditZone(null)}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>تعديل منطقة الدوام</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1">
              <label className="text-sm font-medium">اسم المنطقة (عربي)</label>
              <Input
                value={formData.nameAr}
                onChange={e => setFormData(p => ({ ...p, nameAr: e.target.value }))}
                data-testid="input-edit-zone-name-ar"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">اسم المنطقة (إنجليزي)</label>
              <Input
                value={formData.nameEn}
                onChange={e => setFormData(p => ({ ...p, nameEn: e.target.value }))}
                data-testid="input-edit-zone-name-en"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">نوع المنطقة</label>
              <Select value={formData.type} onValueChange={v => setFormData(p => ({ ...p, type: v as "factory" | "showroom" | "other" }))}>
                <SelectTrigger data-testid="select-edit-zone-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="factory">مصنع</SelectItem>
                  <SelectItem value="showroom">معرض</SelectItem>
                  <SelectItem value="other">أخرى</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editZone && !(Array.isArray(editZone.polygonCoords) && (editZone.polygonCoords as unknown[]).length === 4 && !editZone.radiusMeters) && (
              <div className="space-y-1">
                <label className="text-sm font-medium">نصف القطر (متر)</label>
                <Input
                  type="number"
                  min={50}
                  max={5000}
                  value={formData.radiusMeters}
                  onChange={e => setFormData(p => ({ ...p, radiusMeters: parseInt(e.target.value) || 200 }))}
                  data-testid="input-edit-zone-radius"
                />
              </div>
            )}
            {editZone && Array.isArray(editZone.polygonCoords) && (editZone.polygonCoords as unknown[]).length === 4 && !editZone.radiusMeters && (
              <div className="text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1.5">
                منطقة مستطيلة — لتغيير الشكل، احذف هذه المنطقة وارسم جديدة
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditZone(null)}>إلغاء</Button>
            <Button
              onClick={handleUpdateZone}
              disabled={!formData.nameAr || updateMutation.isPending}
              data-testid="button-update-zone"
            >
              {updateMutation.isPending ? "جاري الحفظ..." : "حفظ التعديل"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
