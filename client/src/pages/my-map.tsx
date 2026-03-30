import { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/components/language-provider";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Map as MapIcon,
  List,
  Plus,
  X,
  CheckCircle,
  Clock,
  Building2,
  Construction,
  ThumbsDown,
  Trash2,
  Navigation,
  Loader2,
  PenLine,
  Save,
  RotateCcw,
} from "lucide-react";

type VisitStatus = "interested" | "under_construction" | "not_suitable" | "follow_up";

interface BuildingVisit {
  id: number;
  rep_id: number;
  lat: string;
  lng: string;
  address: string | null;
  city: string | null;
  district: string | null;
  building_status: VisitStatus;
  notes: string | null;
  quotation_id: number | null;
  visited_at: string;
  created_at: string;
  rep_name?: string;
}

interface OsmBuilding {
  id: number;
  lat: number;
  lon: number;
  name: string | null;
  type: string;
}

interface MarketingZone {
  id: number;
  rep_id: number;
  name: string;
  polygon: [number, number][];
  target_count: number;
  created_at: string;
}

const STATUS_CONFIG: Record<VisitStatus, { ar: string; en: string; color: string; fillColor: string; icon: any }> = {
  interested: {
    ar: "مهتم",
    en: "Interested",
    color: "#16a34a",
    fillColor: "#22c55e",
    icon: CheckCircle,
  },
  under_construction: {
    ar: "قيد الإنشاء",
    en: "Under Construction",
    color: "#ca8a04",
    fillColor: "#eab308",
    icon: Construction,
  },
  not_suitable: {
    ar: "غير مناسب",
    en: "Not Suitable",
    color: "#dc2626",
    fillColor: "#ef4444",
    icon: ThumbsDown,
  },
  follow_up: {
    ar: "متابعة",
    en: "Follow Up",
    color: "#2563eb",
    fillColor: "#3b82f6",
    icon: Clock,
  },
};

const REP_COLORS = [
  "#e11d48", "#d97706", "#16a34a", "#2563eb", "#7c3aed",
  "#db2777", "#0891b2", "#059669", "#dc2626", "#9333ea",
];

function createVisitIcon(status: VisitStatus, isOwn = true) {
  const cfg = STATUS_CONFIG[status];
  const size = isOwn ? 20 : 16;
  const html = `<div style="
    width:${size}px;height:${size}px;border-radius:50%;
    background:${cfg.fillColor};border:2.5px solid ${cfg.color};
    box-shadow:0 2px 6px rgba(0,0,0,0.35);
    cursor:pointer;transition:transform 0.15s;
  "></div>`;
  return L.divIcon({ html, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

function createBuildingIcon() {
  return L.divIcon({
    html: `<div style="width:8px;height:8px;border-radius:2px;background:#94a3b8;border:1px solid #64748b;opacity:0.7;"></div>`,
    className: "",
    iconSize: [8, 8],
    iconAnchor: [4, 4],
  });
}

function createClickMarkerIcon() {
  return L.divIcon({
    html: `<div style="width:24px;height:24px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 2px 8px rgba(59,130,246,0.6);animation:ping 1s ease-in-out infinite;"></div>
    <style>@keyframes ping{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.3);opacity:0.7}}</style>`,
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

export default function MyMapPage() {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();

  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [visitForm, setVisitForm] = useState<{
    open: boolean;
    lat: number | null;
    lng: number | null;
    address: string;
    city: string;
    district: string;
    buildingStatus: VisitStatus;
    notes: string;
    editingId: number | null;
  }>({
    open: false,
    lat: null,
    lng: null,
    address: "",
    city: "",
    district: "",
    buildingStatus: "follow_up",
    notes: "",
    editingId: null,
  });
  const [listFilter, setListFilter] = useState<VisitStatus | "all">("all");
  const [drawingMode, setDrawingMode] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([]);
  const [zoneName, setZoneName] = useState("");
  const [savingZone, setSavingZone] = useState(false);
  const [reverseGeocoding, setReverseGeocoding] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const visitLayerRef = useRef<L.LayerGroup | null>(null);
  const buildingLayerRef = useRef<L.LayerGroup | null>(null);
  const zoneLayerRef = useRef<L.LayerGroup | null>(null);
  const drawingLayerRef = useRef<L.LayerGroup | null>(null);
  const clickMarkerRef = useRef<L.Marker | null>(null);
  const buildingFetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawingModeRef = useRef(false);
  const drawingPointsRef = useRef<[number, number][]>([]);
  const onMarkerClickRef = useRef<((visit: BuildingVisit) => void) | null>(null);

  const { data: visits = [], isLoading: visitsLoading } = useQuery<BuildingVisit[]>({
    queryKey: ["/api/map/visits"],
    refetchInterval: 30000,
  });

  const { data: zones = [] } = useQuery<MarketingZone[]>({
    queryKey: ["/api/map/zones"],
  });

  type CreateVisitPayload = { lat: number; lng: number; address: string; city: string; district: string; buildingStatus: VisitStatus; notes: string; quotationId?: number | null };
  type UpdateVisitPayload = { buildingStatus: VisitStatus; notes: string };

  const createVisitMutation = useMutation({
    mutationFn: async (data: CreateVisitPayload) => {
      const res = await apiRequest("POST", "/api/map/visits", data);
      return res.json() as Promise<BuildingVisit>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/map/visits"] });
      closeVisitForm();
      toast({ title: t("تم تسجيل الزيارة بنجاح", "Visit recorded successfully") });
    },
    onError: () => {
      toast({ title: t("فشل تسجيل الزيارة", "Failed to record visit"), variant: "destructive" });
    },
  });

  const updateVisitMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateVisitPayload }) => {
      const res = await apiRequest("PATCH", `/api/map/visits/${id}`, data);
      return res.json() as Promise<BuildingVisit>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/map/visits"] });
      closeVisitForm();
      toast({ title: t("تم تحديث الزيارة", "Visit updated") });
    },
    onError: () => {
      toast({ title: t("فشل التحديث", "Update failed"), variant: "destructive" });
    },
  });

  const deleteVisitMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/map/visits/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/map/visits"] });
      closeVisitForm();
      toast({ title: t("تم حذف الزيارة", "Visit deleted") });
    },
    onError: () => {
      toast({ title: t("فشل الحذف", "Delete failed"), variant: "destructive" });
    },
  });

  type CreateZonePayload = { name: string; polygon: [number, number][]; targetCount: number };

  const createZoneMutation = useMutation({
    mutationFn: async (data: CreateZonePayload) => {
      const res = await apiRequest("POST", "/api/map/zones", data);
      return res.json() as Promise<MarketingZone>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/map/zones"] });
      cancelDrawing();
      toast({ title: t("تم حفظ المنطقة", "Zone saved") });
    },
    onError: () => {
      toast({ title: t("فشل حفظ المنطقة", "Failed to save zone"), variant: "destructive" });
    },
  });

  const deleteZoneMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/map/zones/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/map/zones"] });
      toast({ title: t("تم حذف المنطقة", "Zone deleted") });
    },
  });

  function closeVisitForm() {
    setVisitForm({
      open: false, lat: null, lng: null, address: "", city: "", district: "",
      buildingStatus: "follow_up", notes: "", editingId: null,
    });
    if (clickMarkerRef.current) {
      clickMarkerRef.current.remove();
      clickMarkerRef.current = null;
    }
  }

  function cancelDrawing() {
    setDrawingMode(false);
    setDrawingPoints([]);
    setZoneName("");
    setSavingZone(false);
    drawingLayerRef.current?.clearLayers();
    if (mapRef.current) mapRef.current.doubleClickZoom.enable();
  }

  async function reverseGeocode(lat: number, lng: number) {
    setReverseGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ar`,
        { headers: { "User-Agent": "TeakApp/1.0" } }
      );
      const data = await res.json();
      const addr = data.address || {};
      const address = data.display_name || "";
      const city = addr.city || addr.town || addr.state_district || addr.state || "";
      const district = addr.suburb || addr.neighbourhood || addr.quarter || addr.residential ||
        addr.city_district || addr.county || addr.village || addr.municipality || addr.locality || "";
      setVisitForm(f => ({ ...f, address: address.slice(0, 200), city, district }));
    } catch {
      // Ignore geocoding errors
    } finally {
      setReverseGeocoding(false);
    }
  }

  const fetchBuildings = useCallback(async () => {
    const map = mapRef.current;
    const layer = buildingLayerRef.current;
    if (!map || !layer) return;
    if (map.getZoom() < 16) {
      layer.clearLayers();
      return;
    }
    const b = map.getBounds();
    const bbox = `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
    try {
      const res = await fetch(`/api/map/buildings?bbox=${bbox}`);
      if (!res.ok) return;
      const buildings: OsmBuilding[] = await res.json();
      layer.clearLayers();
      buildings.forEach(b => {
        const icon = createBuildingIcon();
        L.marker([b.lat, b.lon], { icon, zIndexOffset: -100 })
          .bindTooltip(b.name || t("مبنى", "Building"), { permanent: false, direction: "top" })
          .addTo(layer);
      });
    } catch {
      // Ignore
    }
  }, [t]);

  function renderVisits(visitsData: BuildingVisit[]) {
    const layer = visitLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();
    visitsData.forEach(v => {
      const lat = parseFloat(v.lat);
      const lng = parseFloat(v.lng);
      if (isNaN(lat) || isNaN(lng)) return;
      const icon = createVisitIcon(v.building_status);
      const cfg = STATUS_CONFIG[v.building_status];
      const marker = L.marker([lat, lng], { icon, zIndexOffset: 100 });
      const popupContent = `
        <div style="min-width:180px;font-family:inherit;direction:rtl;text-align:right">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
            <span style="width:10px;height:10px;border-radius:50%;background:${cfg.fillColor};display:inline-block;flex-shrink:0"></span>
            <strong style="font-size:13px">${lang === "ar" ? cfg.ar : cfg.en}</strong>
          </div>
          ${v.address ? `<p style="font-size:11px;color:#666;margin:0 0 4px">${v.address.slice(0, 80)}</p>` : ""}
          ${v.notes ? `<p style="font-size:12px;margin:0 0 6px">${v.notes}</p>` : ""}
          <p style="font-size:10px;color:#999;margin:0">${new Date(v.visited_at).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-GB")}</p>
        </div>
      `;
      marker.bindPopup(popupContent, { maxWidth: 220 });
      marker.on("popupopen", () => {
        if (onMarkerClickRef.current) onMarkerClickRef.current(v);
      });
      marker.addTo(layer);
    });
  }

  function renderZones(zonesData: MarketingZone[]) {
    const layer = zoneLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();
    zonesData.forEach(z => {
      if (!Array.isArray(z.polygon) || z.polygon.length < 3) return;
      const polygon = L.polygon(z.polygon as L.LatLngExpression[], {
        color: "#8b5cf6",
        fillColor: "#8b5cf6",
        fillOpacity: 0.12,
        weight: 2,
        dashArray: "6,4",
      });
      polygon.bindTooltip(z.name, { permanent: false, direction: "center" });
      polygon.addTo(layer);
    });
  }

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [23.8859, 45.0792],
      zoom: 6,
      zoomControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    visitLayerRef.current = L.layerGroup().addTo(map);
    buildingLayerRef.current = L.layerGroup().addTo(map);
    zoneLayerRef.current = L.layerGroup().addTo(map);
    drawingLayerRef.current = L.layerGroup().addTo(map);

    mapRef.current = map;

    map.on("click", (e) => {
      if (drawingModeRef.current) {
        const latlng: [number, number] = [e.latlng.lat, e.latlng.lng];
        const newPoints = [...drawingPointsRef.current, latlng];
        drawingPointsRef.current = newPoints;

        drawingLayerRef.current?.clearLayers();
        newPoints.forEach((pt, i) => {
          L.circleMarker(pt, { radius: 5, color: "#7c3aed", fillColor: "#a78bfa", fillOpacity: 1, weight: 2 })
            .bindTooltip(String(i + 1))
            .addTo(drawingLayerRef.current!);
        });
        if (newPoints.length >= 3) {
          L.polygon(newPoints, { color: "#7c3aed", fillOpacity: 0.15, weight: 2, dashArray: "6,3" })
            .addTo(drawingLayerRef.current!);
        } else if (newPoints.length >= 2) {
          L.polyline(newPoints, { color: "#7c3aed", weight: 2 })
            .addTo(drawingLayerRef.current!);
        }
        setDrawingPoints([...newPoints]);
        return;
      }

      if (clickMarkerRef.current) {
        clickMarkerRef.current.remove();
        clickMarkerRef.current = null;
      }
      const marker = L.marker(e.latlng, { icon: createClickMarkerIcon() }).addTo(map);
      clickMarkerRef.current = marker;

      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      setVisitForm(f => ({
        ...f,
        open: true,
        lat,
        lng,
        address: "",
        city: "",
        district: "",
        editingId: null,
      }));
      reverseGeocode(lat, lng);
    });

    map.on("zoomend moveend", () => {
      if (buildingFetchTimeoutRef.current) clearTimeout(buildingFetchTimeoutRef.current);
      buildingFetchTimeoutRef.current = setTimeout(fetchBuildings, 600);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      visitLayerRef.current = null;
      buildingLayerRef.current = null;
      zoneLayerRef.current = null;
      drawingLayerRef.current = null;
      if (buildingFetchTimeoutRef.current) clearTimeout(buildingFetchTimeoutRef.current);
    };
  }, []);

  // Sync drawing mode to refs (used by Leaflet click handler)
  useEffect(() => {
    drawingModeRef.current = drawingMode;
    drawingPointsRef.current = drawingPoints;
    if (!mapRef.current) return;
    if (drawingMode) {
      mapRef.current.doubleClickZoom.disable();
      mapRef.current.getContainer().style.cursor = "crosshair";
    } else {
      mapRef.current.doubleClickZoom.enable();
      mapRef.current.getContainer().style.cursor = "";
    }
  }, [drawingMode, drawingPoints]);

  // Keep marker click callback in sync so the handler always has latest visits + form setter
  onMarkerClickRef.current = (visit: BuildingVisit) => {
    setVisitForm({
      open: true,
      lat: parseFloat(visit.lat),
      lng: parseFloat(visit.lng),
      address: visit.address || "",
      city: visit.city || "",
      district: visit.district || "",
      buildingStatus: visit.building_status,
      notes: visit.notes || "",
      editingId: visit.id,
    });
  };

  // Render visits when data changes
  useEffect(() => {
    renderVisits(visits);
  }, [visits, lang]);

  // Render zones when data changes
  useEffect(() => {
    renderZones(zones);
  }, [zones]);

  function handleSaveVisit() {
    if (!visitForm.buildingStatus || !visitForm.lat || !visitForm.lng) return;
    if (visitForm.editingId) {
      updateVisitMutation.mutate({
        id: visitForm.editingId,
        data: { buildingStatus: visitForm.buildingStatus, notes: visitForm.notes },
      });
    } else {
      createVisitMutation.mutate({
        lat: visitForm.lat,
        lng: visitForm.lng,
        address: visitForm.address,
        city: visitForm.city,
        district: visitForm.district,
        buildingStatus: visitForm.buildingStatus,
        notes: visitForm.notes,
      });
    }
  }

  function handleSaveZone() {
    if (!zoneName.trim() || drawingPoints.length < 3) return;
    setSavingZone(true);
    createZoneMutation.mutate({ name: zoneName, polygon: drawingPoints, targetCount: 0 });
  }

  function goToVisit(v: BuildingVisit) {
    const lat = parseFloat(v.lat);
    const lng = parseFloat(v.lng);
    if (isNaN(lat) || isNaN(lng)) return;
    setViewMode("map");
    setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.setView([lat, lng], 17, { animate: true });
      }
    }, 100);
  }

  const filteredVisits = listFilter === "all" ? visits : visits.filter(v => v.building_status === listFilter);

  const statusCounts = {
    interested: visits.filter(v => v.building_status === "interested").length,
    under_construction: visits.filter(v => v.building_status === "under_construction").length,
    not_suitable: visits.filter(v => v.building_status === "not_suitable").length,
    follow_up: visits.filter(v => v.building_status === "follow_up").length,
  };

  return (
    <div className="-m-4 md:-m-6 flex flex-col" style={{ height: "calc(100dvh - 56px)" }}>
      {/* Header */}
      <div className="shrink-0 bg-card border-b border-border px-4 py-2 flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          <MapIcon className="w-5 h-5 text-primary" />
          <h1 className="font-bold text-base">{t("خريطتي التسويقية", "My Marketing Map")}</h1>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          <button
            onClick={() => setViewMode("map")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === "map" ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            data-testid="button-map-view"
          >
            <MapIcon className="w-4 h-4" />
            <span className="hidden sm:inline">{t("خريطة", "Map")}</span>
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === "list" ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            data-testid="button-list-view"
          >
            <List className="w-4 h-4" />
            <span className="hidden sm:inline">{t("قائمة", "List")}</span>
          </button>
        </div>
        <div className="text-xs text-muted-foreground hidden sm:block">
          {visits.length} {t("زيارة", "visits")}
        </div>
      </div>

      {/* Stats mini-bar */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 bg-card/50 border-b border-border overflow-x-auto">
        {(Object.entries(STATUS_CONFIG) as [VisitStatus, typeof STATUS_CONFIG[VisitStatus]][]).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <div key={key} className="flex items-center gap-1.5 shrink-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cfg.fillColor }} />
              <span className="text-xs text-muted-foreground">{lang === "ar" ? cfg.ar : cfg.en}:</span>
              <span className="text-xs font-semibold">{statusCounts[key]}</span>
            </div>
          );
        })}
        {drawingMode && (
          <div className="ms-auto flex items-center gap-2 shrink-0">
            <span className="text-xs text-violet-600 font-medium animate-pulse">
              {t(`انقر لإضافة نقطة (${drawingPoints.length} نقطة)`, `Click to add point (${drawingPoints.length})`)}
            </span>
            {drawingPoints.length >= 3 && (
              <button
                onClick={() => setSavingZone(true)}
                className="text-xs bg-violet-600 text-white px-2 py-1 rounded flex items-center gap-1"
              >
                <Save className="w-3 h-3" />
                {t("حفظ", "Save")}
              </button>
            )}
            <button onClick={cancelDrawing} className="text-xs text-muted-foreground hover:text-foreground">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Map View */}
      {viewMode === "map" && (
        <div className="flex-1 min-h-0 relative">
          <div ref={mapContainerRef} className="w-full h-full" />

          {/* Draw zone button */}
          {!drawingMode && (
            <button
              onClick={() => setDrawingMode(true)}
              className="absolute top-3 start-3 z-[1000] bg-card border border-border shadow rounded-lg px-3 py-2 flex items-center gap-2 text-sm hover:bg-muted transition-colors"
              data-testid="button-draw-zone"
            >
              <PenLine className="w-4 h-4 text-violet-600" />
              <span className="hidden sm:inline">{t("رسم منطقة", "Draw Zone")}</span>
            </button>
          )}

          {/* Zones list button */}
          {zones.length > 0 && !drawingMode && (
            <div className="absolute top-3 start-3 mt-11 z-[1000] bg-card border border-border shadow rounded-lg p-2 max-w-[200px]">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">{t("مناطقي", "My Zones")}</p>
              {zones.slice(0, 3).map(z => (
                <div key={z.id} className="flex items-center justify-between gap-2 py-0.5">
                  <span className="text-xs truncate">{z.name}</span>
                  <button onClick={() => deleteZoneMutation.mutate(z.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Map tip */}
          {visits.length === 0 && !visitForm.open && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-[1000] bg-card/90 backdrop-blur border border-border shadow-lg rounded-xl px-4 py-2.5 text-sm text-center pointer-events-none">
              <Navigation className="w-5 h-5 text-primary mx-auto mb-1" />
              <p className="font-medium">{t("انقر على الخريطة لتسجيل زيارة", "Click on the map to record a visit")}</p>
            </div>
          )}
        </div>
      )}

      {/* List View */}
      {viewMode === "list" && (
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {/* Filter tabs */}
          <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
            {[{ key: "all" as const, ar: "الكل", en: "All" }, ...Object.entries(STATUS_CONFIG).map(([k, v]) => ({ key: k as VisitStatus, ar: v.ar, en: v.en }))]
              .map(s => (
                <button
                  key={s.key}
                  onClick={() => setListFilter(s.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${listFilter === s.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                  data-testid={`filter-status-${s.key}`}
                >
                  {lang === "ar" ? s.ar : s.en}
                  {s.key !== "all" && ` (${statusCounts[s.key as VisitStatus]})`}
                  {s.key === "all" && ` (${visits.length})`}
                </button>
              ))}
          </div>

          {visitsLoading && (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          )}

          {!visitsLoading && filteredVisits.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{t("لا توجد زيارات مسجلة", "No visits recorded yet")}</p>
              <p className="text-xs mt-1">{t("انتقل للخريطة وانقر لتسجيل زيارة", "Go to map and click to record a visit")}</p>
            </div>
          )}

          <div className="space-y-2">
            {filteredVisits.map(v => {
              const cfg = STATUS_CONFIG[v.building_status];
              const Icon = cfg.icon;
              return (
                <div
                  key={v.id}
                  className="bg-card border border-border rounded-xl p-3 flex items-start gap-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => goToVisit(v)}
                  data-testid={`visit-card-${v.id}`}
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: cfg.fillColor + "22", border: `2px solid ${cfg.fillColor}` }}>
                    <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0" style={{ borderColor: cfg.fillColor, color: cfg.color }}>
                        {lang === "ar" ? cfg.ar : cfg.en}
                      </Badge>
                      {v.city && <span className="text-xs text-muted-foreground">{v.city}</span>}
                      {v.district && <span className="text-xs text-muted-foreground">· {v.district}</span>}
                    </div>
                    {v.address && <p className="text-xs text-muted-foreground truncate">{v.address}</p>}
                    {v.notes && <p className="text-sm mt-0.5 line-clamp-2">{v.notes}</p>}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(v.visited_at).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-GB", { year: "numeric", month: "short", day: "numeric" })}
                    </p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setVisitForm({ open: true, lat: parseFloat(v.lat), lng: parseFloat(v.lng), address: v.address || "", city: v.city || "", district: v.district || "", buildingStatus: v.building_status, notes: v.notes || "", editingId: v.id }); setViewMode("map"); }}
                    className="text-muted-foreground hover:text-foreground p-1 rounded"
                    data-testid={`button-edit-visit-${v.id}`}
                  >
                    <PenLine className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Save Zone Dialog */}
      {savingZone && (
        <div className="fixed inset-0 z-[2000] bg-black/60 flex items-end sm:items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setSavingZone(false); }}>
          <div className="bg-card rounded-2xl w-full max-w-md p-5 shadow-2xl">
            <h3 className="font-bold text-base mb-4">{t("حفظ المنطقة التسويقية", "Save Marketing Zone")}</h3>
            <div className="mb-4">
              <Label className="text-sm mb-1 block">{t("اسم المنطقة", "Zone Name")}</Label>
              <input
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder={t("مثال: حي النزهة - شمال الرياض", "e.g. Al-Nuzha District")}
                value={zoneName}
                onChange={e => setZoneName(e.target.value)}
                data-testid="input-zone-name"
              />
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              {t(`تضم ${drawingPoints.length} نقطة`, `${drawingPoints.length} points`)}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setSavingZone(false)}>
                {t("إلغاء", "Cancel")}
              </Button>
              <Button
                className="flex-1"
                disabled={!zoneName.trim() || createZoneMutation.isPending}
                onClick={handleSaveZone}
                data-testid="button-save-zone"
              >
                {createZoneMutation.isPending && <Loader2 className="w-4 h-4 me-2 animate-spin" />}
                {t("حفظ المنطقة", "Save Zone")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Visit Form Bottom Sheet */}
      {visitForm.open && (
        <div className="fixed inset-0 z-[1500] bg-black/40" onClick={e => { if (e.target === e.currentTarget) closeVisitForm(); }}>
          <div className="absolute bottom-0 start-0 end-0 bg-card rounded-t-2xl shadow-2xl p-4 pb-safe-area-inset-bottom sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:start-auto sm:end-4 sm:w-80 sm:rounded-2xl">
            {/* Handle bar */}
            <div className="w-10 h-1 bg-border rounded-full mx-auto mb-4 sm:hidden" />

            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm">
                {visitForm.editingId ? t("تعديل الزيارة", "Edit Visit") : t("تسجيل زيارة", "Record Visit")}
              </h3>
              <button onClick={closeVisitForm} className="text-muted-foreground hover:text-foreground p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Location info */}
            {reverseGeocoding ? (
              <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t("جاري تحديد العنوان...", "Getting address...")}
              </div>
            ) : visitForm.address ? (
              <div className="mb-3 p-2.5 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{visitForm.address}</p>
              </div>
            ) : null}

            {/* Status selector */}
            <div className="mb-3">
              <Label className="text-xs mb-2 block">{t("حالة المبنى", "Building Status")}</Label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.entries(STATUS_CONFIG) as [VisitStatus, typeof STATUS_CONFIG[VisitStatus]][]).map(([key, cfg]) => {
                  const Icon = cfg.icon;
                  const isSelected = visitForm.buildingStatus === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setVisitForm(f => ({ ...f, buildingStatus: key }))}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border-2 text-xs font-medium transition-all ${isSelected ? "border-2" : "border-border hover:border-muted-foreground/30"}`}
                      style={isSelected ? { borderColor: cfg.fillColor, background: cfg.fillColor + "18", color: cfg.color } : {}}
                      data-testid={`status-option-${key}`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{lang === "ar" ? cfg.ar : cfg.en}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Notes */}
            <div className="mb-4">
              <Label className="text-xs mb-1.5 block">{t("ملاحظات (اختياري)", "Notes (optional)")}</Label>
              <Textarea
                className="text-sm resize-none"
                rows={2}
                placeholder={t("اكتب ملاحظات عن المبنى أو العميل...", "Add notes about the building or customer...")}
                value={visitForm.notes}
                onChange={e => setVisitForm(f => ({ ...f, notes: e.target.value }))}
                data-testid="textarea-visit-notes"
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
              {visitForm.editingId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => deleteVisitMutation.mutate(visitForm.editingId!)}
                  disabled={deleteVisitMutation.isPending}
                  data-testid="button-delete-visit"
                >
                  {deleteVisitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={closeVisitForm}
              >
                {t("إلغاء", "Cancel")}
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={handleSaveVisit}
                disabled={createVisitMutation.isPending || updateVisitMutation.isPending}
                data-testid="button-save-visit"
              >
                {(createVisitMutation.isPending || updateVisitMutation.isPending) && <Loader2 className="w-4 h-4 me-1.5 animate-spin" />}
                {visitForm.editingId ? t("حفظ التعديل", "Save") : t("تسجيل", "Record")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
