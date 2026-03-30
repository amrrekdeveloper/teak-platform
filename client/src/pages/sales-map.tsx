import { useState, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Map as MapIcon,
  BarChart3,
  Users,
  TrendingUp,
  CheckCircle,
  Clock,
  Building2,
  Construction,
  ThumbsDown,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
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
  visited_at: string;
  rep_name: string;
  rep_user_id: number;
}

interface MapStats {
  totalVisits: number;
  byStatus: { building_status: VisitStatus; count: string }[];
  byRep: { full_name: string; rep_id: number; visit_count: string; interested_count: string; follow_up_count: string }[];
}

interface SalesUser {
  id: number;
  fullNameAr: string | null;
  fullNameEn: string | null;
  username: string;
  role: string;
}

const STATUS_CONFIG: Record<VisitStatus, { ar: string; en: string; color: string; fillColor: string }> = {
  interested: { ar: "مهتم", en: "Interested", color: "#16a34a", fillColor: "#22c55e" },
  under_construction: { ar: "قيد الإنشاء", en: "Under Construction", color: "#ca8a04", fillColor: "#eab308" },
  not_suitable: { ar: "غير مناسب", en: "Not Suitable", color: "#dc2626", fillColor: "#ef4444" },
  follow_up: { ar: "متابعة", en: "Follow Up", color: "#2563eb", fillColor: "#3b82f6" },
};

const REP_COLORS = [
  "#e11d48", "#d97706", "#059669", "#2563eb", "#7c3aed",
  "#db2777", "#0891b2", "#16a34a", "#dc2626", "#9333ea",
  "#f97316", "#06b6d4", "#84cc16", "#a855f7", "#ef4444",
];

function createRepIcon(color: string, status: VisitStatus, size = 14) {
  const sColor = STATUS_CONFIG[status].fillColor;
  const html = `<div style="
    width:${size}px;height:${size}px;border-radius:50%;
    background:${color};border:3px solid white;
    box-shadow:0 2px 6px rgba(0,0,0,0.4);
    cursor:pointer;
  "></div>`;
  return L.divIcon({ html, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

export default function SalesMapPage() {
  const { t, lang } = useLanguage();
  const { user } = useAuth();

  const [repFilter, setRepFilter] = useState<string>("all");
  const [showStats, setShowStats] = useState(true);
  const [selectedVisit, setSelectedVisit] = useState<BuildingVisit | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const visitLayerRef = useRef<L.LayerGroup | null>(null);

  const visitsUrl = repFilter !== "all" ? `/api/map/visits?repId=${repFilter}` : "/api/map/visits";
  const { data: visits = [], isLoading: visitsLoading } = useQuery<BuildingVisit[]>({
    queryKey: [visitsUrl],
    refetchInterval: 60000,
  });

  const { data: stats } = useQuery<MapStats>({
    queryKey: ["/api/map/stats"],
  });

  const { data: usersData = [] } = useQuery<SalesUser[]>({
    queryKey: ["/api/users"],
    select: (data: any[]) => data.filter((u: any) => u.role === "sales"),
  });

  // Build rep color map
  const repColorMap: Record<number, string> = {};
  usersData.forEach((u, i) => {
    repColorMap[u.id] = REP_COLORS[i % REP_COLORS.length];
  });

  function renderVisits(visitsData: BuildingVisit[]) {
    const layer = visitLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();

    visitsData.forEach(v => {
      const lat = parseFloat(v.lat);
      const lng = parseFloat(v.lng);
      if (isNaN(lat) || isNaN(lng)) return;

      const repColor = repColorMap[v.rep_user_id || v.rep_id] || "#6366f1";
      const icon = createRepIcon(repColor, v.building_status);
      const marker = L.marker([lat, lng], { icon });

      const cfg = STATUS_CONFIG[v.building_status];
      const popupHtml = `
        <div style="min-width:200px;font-family:inherit;direction:rtl;text-align:right">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
            <div style="width:12px;height:12px;border-radius:50%;background:${repColor};border:2px solid white;flex-shrink:0"></div>
            <strong style="font-size:13px">${v.rep_name}</strong>
          </div>
          <div style="display:flex;align-items:center;gap:5px;margin-bottom:6px">
            <span style="width:8px;height:8px;border-radius:50%;background:${cfg.fillColor};flex-shrink:0"></span>
            <span style="font-size:12px;color:${cfg.color};font-weight:600">${lang === "ar" ? cfg.ar : cfg.en}</span>
          </div>
          ${v.address ? `<p style="font-size:11px;color:#666;margin:0 0 4px;line-height:1.4">${v.address.slice(0, 100)}</p>` : ""}
          ${v.city || v.district ? `<p style="font-size:11px;color:#888;margin:0 0 4px">${[v.city, v.district].filter(Boolean).join(" · ")}</p>` : ""}
          ${v.notes ? `<p style="font-size:12px;margin:0 0 6px;border-top:1px solid #eee;padding-top:5px">${v.notes}</p>` : ""}
          <p style="font-size:10px;color:#aaa;margin:0">${new Date(v.visited_at).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-GB", { year: "numeric", month: "short", day: "numeric" })}</p>
        </div>
      `;

      marker.bindPopup(popupHtml, { maxWidth: 240 });
      marker.addTo(layer);
    });

    // Fit map to all markers if we have visits
    if (visitsData.length > 0) {
      try {
        const latlngs = visitsData.map(v => [parseFloat(v.lat), parseFloat(v.lng)] as L.LatLngTuple);
        const validLatlngs = latlngs.filter(([lat, lng]) => !isNaN(lat) && !isNaN(lng));
        if (validLatlngs.length > 0) {
          const bounds = L.latLngBounds(validLatlngs);
          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
          }
        }
      } catch {
        // Ignore
      }
    }
  }

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
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      visitLayerRef.current = null;
    };
  }, []);

  // Re-render visits when data or filter changes
  useEffect(() => {
    renderVisits(visits);
  }, [visits, repColorMap]);

  const totalVisits = stats?.totalVisits ?? visits.length;
  const interestedCount = visits.filter(v => v.building_status === "interested").length;
  const conversionRate = totalVisits > 0 ? Math.round((interestedCount / totalVisits) * 100) : 0;

  return (
    <div className="-m-4 md:-m-6 flex flex-col" style={{ height: "calc(100dvh - 56px)" }}>
      {/* Header */}
      <div className="shrink-0 bg-card border-b border-border px-4 py-2 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <MapIcon className="w-5 h-5 text-primary" />
          <h1 className="font-bold text-base">{t("خريطة المبيعات", "Sales Map")}</h1>
        </div>

        {/* Rep filter */}
        <Select value={repFilter} onValueChange={setRepFilter}>
          <SelectTrigger className="w-44 h-8 text-xs" data-testid="select-rep-filter">
            <SelectValue placeholder={t("كل المناديب", "All Reps")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("كل المناديب", "All Reps")}</SelectItem>
            {usersData.map(u => (
              <SelectItem key={u.id} value={String(u.id)}>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: repColorMap[u.id] || "#6366f1" }} />
                  {lang === "ar" ? (u.fullNameAr || u.username) : (u.fullNameEn || u.username)}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-3 ms-auto text-xs text-muted-foreground">
          <span>{totalVisits} {t("زيارة", "visits")}</span>
          <span className="text-green-600 font-semibold">{conversionRate}% {t("اهتمام", "interest")}</span>
          <button
            onClick={() => setShowStats(s => !s)}
            className="flex items-center gap-1 bg-muted px-2 py-1 rounded-lg hover:bg-muted/70 transition-colors"
            data-testid="button-toggle-stats"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            {showStats ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Stats Panel (collapsible) */}
      {showStats && (
        <div className="shrink-0 bg-card/50 border-b border-border px-4 py-3 overflow-x-auto">
          <div className="flex gap-4 min-w-max">
            {/* Status breakdown */}
            <div className="flex gap-3">
              {(Object.entries(STATUS_CONFIG) as [VisitStatus, typeof STATUS_CONFIG[VisitStatus]][]).map(([key, cfg]) => {
                const count = visits.filter(v => v.building_status === key).length;
                const pct = totalVisits > 0 ? Math.round((count / totalVisits) * 100) : 0;
                return (
                  <div key={key} className="flex flex-col items-center gap-1 min-w-[72px]">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: cfg.fillColor }}>
                      {count}
                    </div>
                    <span className="text-[10px] text-muted-foreground text-center leading-tight">{lang === "ar" ? cfg.ar : cfg.en}</span>
                    <span className="text-[10px] font-medium" style={{ color: cfg.color }}>{pct}%</span>
                  </div>
                );
              })}
            </div>

            {/* Divider */}
            <div className="w-px bg-border self-stretch mx-1" />

            {/* Per-rep stats */}
            {(stats?.byRep ?? []).map((rep, i) => {
              const repColor = REP_COLORS[i % REP_COLORS.length];
              const visitCount = parseInt(rep.visit_count);
              const intCount = parseInt(rep.interested_count);
              const rate = visitCount > 0 ? Math.round((intCount / visitCount) * 100) : 0;
              return (
                <div key={rep.rep_id} className="flex items-center gap-2 min-w-[130px] bg-muted/50 rounded-xl px-3 py-2">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: repColor }} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{rep.full_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {visitCount} {t("زيارة", "visits")} · <span className="text-green-600">{rate}%</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Map */}
      <div className="flex-1 min-h-0 relative">
        <div ref={mapContainerRef} className="w-full h-full" />

        {visitsLoading && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-card/90 backdrop-blur border border-border rounded-full px-3 py-1.5 flex items-center gap-2 text-xs shadow">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {t("جاري التحميل...", "Loading...")}
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-10 start-3 z-[1000] bg-card/90 backdrop-blur border border-border rounded-xl p-3 shadow text-xs">
          <p className="font-semibold mb-2 text-muted-foreground">{t("دليل الألوان", "Legend")}</p>
          {/* By status */}
          <div className="space-y-1 mb-3">
            {(Object.entries(STATUS_CONFIG) as [VisitStatus, typeof STATUS_CONFIG[VisitStatus]][]).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full border border-white/50 shrink-0" style={{ background: cfg.fillColor }} />
                <span className="text-muted-foreground">{lang === "ar" ? cfg.ar : cfg.en}</span>
              </div>
            ))}
          </div>
          {/* By rep (outer ring) */}
          {usersData.slice(0, 5).length > 0 && (
            <>
              <p className="font-semibold mb-1 text-muted-foreground">{t("المناديب", "Reps")}</p>
              <div className="space-y-1">
                {usersData.slice(0, 5).map((u, i) => (
                  <div key={u.id} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full border-2 border-white shrink-0" style={{ background: repColorMap[u.id] || REP_COLORS[i] }} />
                    <span className="text-muted-foreground truncate max-w-[100px]">{lang === "ar" ? (u.fullNameAr || u.username) : (u.fullNameEn || u.username)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Empty state */}
        {!visitsLoading && visits.length === 0 && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] text-center pointer-events-none">
            <div className="bg-card/90 backdrop-blur border border-border rounded-2xl px-6 py-5 shadow-lg">
              <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium text-muted-foreground">{t("لا توجد زيارات مسجلة بعد", "No visits recorded yet")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("سيظهر هنا سجل زيارات المناديب", "Sales rep visits will appear here")}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
