import { useState, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
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
  ChevronDown,
  ChevronUp,
  Loader2,
  CalendarDays,
  X,
  UserCircle,
} from "lucide-react";

interface UserRecord {
  id: number;
  username: string;
  full_name_ar: string | null;
  full_name_en: string | null;
  role: string;
}

const REP_COLORS = [
  "#e11d48", "#d97706", "#16a34a", "#2563eb", "#7c3aed",
  "#db2777", "#0891b2", "#059669", "#dc2626", "#9333ea",
];

type VisitStatus = "interested" | "under_construction" | "not_suitable" | "follow_up";

interface VisitHistoryItem {
  id: number;
  rep_name: string;
  rep_id: number;
  building_status: VisitStatus;
  notes: string | null;
  visited_at: string;
}

interface BuildingCluster {
  cluster_lat: string;
  cluster_lng: string;
  address: string | null;
  city: string | null;
  district: string | null;
  total_visits: string;
  rep_count: string;
  interested_count: string;
  follow_up_count: string;
  not_suitable_count: string;
  under_construction_count: string;
  visit_history: VisitHistoryItem[];
}

interface ManagerOverviewResponse {
  clusters: BuildingCluster[];
  cities: string[];
}

interface MapStats {
  totalVisits: number;
  byStatus: { building_status: VisitStatus; count: string }[];
  byRep: { full_name: string; rep_id: number; visit_count: string; interested_count: string; follow_up_count: string }[];
}

interface SalesZone {
  id: number;
  rep_id: number;
  name: string;
  polygon: [number, number][];
  target_count: number;
  rep_name: string;
  created_at: string;
}

/** Ray-casting point-in-polygon (2D). polygon is array of [lat, lng] pairs. */
function pointInPolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if (((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

const STATUS_CONFIG: Record<VisitStatus, { ar: string; en: string; color: string; fillColor: string }> = {
  interested: { ar: "مهتم", en: "Interested", color: "#16a34a", fillColor: "#22c55e" },
  under_construction: { ar: "قيد الإنشاء", en: "Under Construction", color: "#ca8a04", fillColor: "#eab308" },
  not_suitable: { ar: "غير مناسب", en: "Not Suitable", color: "#dc2626", fillColor: "#ef4444" },
  follow_up: { ar: "متابعة", en: "Follow Up", color: "#2563eb", fillColor: "#3b82f6" },
};

function getDominantStatus(cluster: BuildingCluster): VisitStatus {
  const counts: Record<VisitStatus, number> = {
    interested: parseInt(cluster.interested_count) || 0,
    follow_up: parseInt(cluster.follow_up_count) || 0,
    not_suitable: parseInt(cluster.not_suitable_count) || 0,
    under_construction: parseInt(cluster.under_construction_count) || 0,
  };
  return (Object.entries(counts).sort(([, a], [, b]) => b - a)[0][0] as VisitStatus);
}

function createClusterIcon(cluster: BuildingCluster, repColor?: string) {
  const total = parseInt(cluster.total_visits) || 1;
  const dominant = getDominantStatus(cluster);
  const cfg = STATUS_CONFIG[dominant];
  const size = Math.min(14 + total * 4, 40);
  const bgColor = repColor ?? cfg.fillColor;
  const borderColor = repColor ?? cfg.color;
  const html = `<div style="
    width:${size}px;height:${size}px;border-radius:50%;
    background:${bgColor};border:2.5px solid ${borderColor};
    box-shadow:0 2px 8px rgba(0,0,0,0.4);
    display:flex;align-items:center;justify-content:center;
    color:white;font-size:${size > 24 ? 11 : 9}px;font-weight:700;
    cursor:pointer;
  ">${total > 1 ? total : ""}</div>`;
  return L.divIcon({ html, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

export default function SalesMapPage() {
  const { t, lang } = useLanguage();
  const { user } = useAuth();

  const [cityFilter, setCityFilter] = useState<string>("all");
  const [repIdFilter, setRepIdFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [showStats, setShowStats] = useState(true);

  const { data: allUsers = [] } = useQuery<UserRecord[]>({
    queryKey: ["/api/users"],
  });
  const salesReps = allUsers.filter(u => u.role === "sales");
  const repColorMap: Record<number, string> = {};
  salesReps.forEach((rep, i) => { repColorMap[rep.id] = REP_COLORS[i % REP_COLORS.length]; });

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterLayerRef = useRef<L.LayerGroup | null>(null);

  const overviewParams = new URLSearchParams();
  if (cityFilter !== "all") overviewParams.set("city", cityFilter);
  if (dateFrom) overviewParams.set("dateFrom", dateFrom);
  if (dateTo) overviewParams.set("dateTo", dateTo);
  if (repIdFilter !== "all") overviewParams.set("repId", repIdFilter);
  const overviewUrl = `/api/map/manager-overview${overviewParams.toString() ? "?" + overviewParams.toString() : ""}`;

  const { data: overview, isLoading } = useQuery<ManagerOverviewResponse>({
    queryKey: [overviewUrl],
    refetchInterval: 60000,
  });

  const { data: stats } = useQuery<MapStats>({
    queryKey: ["/api/map/stats"],
  });

  const { data: zones = [] } = useQuery<SalesZone[]>({
    queryKey: ["/api/map/zones"],
  });

  const clusters = overview?.clusters ?? [];
  const cities = overview?.cities ?? [];

  const totalVisits = clusters.reduce((sum, c) => sum + parseInt(c.total_visits), 0);
  const totalInterested = clusters.reduce((sum, c) => sum + parseInt(c.interested_count), 0);
  const conversionRate = totalVisits > 0 ? Math.round((totalInterested / totalVisits) * 100) : 0;
  const totalBuildings = clusters.length;

  // Zone coverage: for each zone, count clusters whose lat/lng fall inside the polygon
  const zoneCoverage = zones
    .filter(z => Array.isArray(z.polygon) && z.polygon.length >= 3)
    .map(z => {
      const visitedInZone = clusters.filter(c =>
        pointInPolygon(parseFloat(c.cluster_lat), parseFloat(c.cluster_lng), z.polygon)
      ).length;
      const target = z.target_count > 0 ? z.target_count : null;
      const pct = target ? Math.min(100, Math.round((visitedInZone / target) * 100)) : null;
      return { id: z.id, name: z.name, repName: z.rep_name, visitedInZone, target, pct };
    });

  function buildPopupHtml(cluster: BuildingCluster): string {
    const total = parseInt(cluster.total_visits);
    const interested = parseInt(cluster.interested_count);
    const rate = total > 0 ? Math.round((interested / total) * 100) : 0;
    const historyItems = cluster.visit_history.slice(0, 6);

    const historyHtml = historyItems.map(h => {
      const cfg = STATUS_CONFIG[h.building_status];
      const date = new Date(h.visited_at).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-GB", { month: "short", day: "numeric" });
      return `<div style="display:flex;align-items:flex-start;gap:6px;padding:4px 0;border-bottom:1px solid #f1f5f9;">
        <div style="width:8px;height:8px;border-radius:50%;background:${cfg.fillColor};margin-top:3px;flex-shrink:0;"></div>
        <div style="min-width:0;flex:1;">
          <div style="display:flex;justify-content:space-between;gap:4px;">
            <span style="font-size:11px;font-weight:600;truncate">${h.rep_name}</span>
            <span style="font-size:10px;color:#94a3b8;white-space:nowrap">${date}</span>
          </div>
          <span style="font-size:10px;color:${cfg.color}">${lang === "ar" ? cfg.ar : cfg.en}</span>
          ${h.notes ? `<p style="font-size:10px;color:#64748b;margin:2px 0 0;line-height:1.3">${h.notes.slice(0, 60)}</p>` : ""}
        </div>
      </div>`;
    }).join("");

    return `<div style="min-width:230px;max-width:260px;font-family:inherit;direction:rtl;text-align:right;">
      <div style="margin-bottom:8px;">
        ${cluster.address ? `<p style="font-size:12px;color:#334155;margin:0 0 3px;font-weight:500;line-height:1.3">${cluster.address.slice(0, 80)}</p>` : ""}
        ${cluster.city || cluster.district ? `<p style="font-size:11px;color:#94a3b8;margin:0 0 4px">${[cluster.city, cluster.district].filter(Boolean).join(" · ")}</p>` : ""}
        <div style="display:flex;gap:10px;align-items:center;margin-top:4px;">
          <span style="font-size:11px;color:#64748b">${total} ${lang === "ar" ? "زيارة" : "visits"} · ${parseInt(cluster.rep_count)} ${lang === "ar" ? "مندوب" : "reps"}</span>
          <span style="font-size:12px;font-weight:700;color:#16a34a">${rate}% ${lang === "ar" ? "اهتمام" : "interest"}</span>
        </div>
      </div>
      <div style="border-top:2px solid #e2e8f0;padding-top:6px;">
        <p style="font-size:10px;font-weight:600;color:#94a3b8;margin:0 0 4px">${lang === "ar" ? "سجل الزيارات" : "Visit History"}</p>
        ${historyHtml}
        ${cluster.visit_history.length > 6 ? `<p style="font-size:10px;color:#94a3b8;text-align:center;margin:4px 0 0">+${cluster.visit_history.length - 6} ${lang === "ar" ? "زيارات أخرى" : "more visits"}</p>` : ""}
      </div>
    </div>`;
  }

  function renderClusters(data: BuildingCluster[]) {
    const layer = clusterLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();

    const filteredRepId = repIdFilter !== "all" ? parseInt(repIdFilter) : null;

    data.forEach(cluster => {
      const lat = parseFloat(cluster.cluster_lat);
      const lng = parseFloat(cluster.cluster_lng);
      if (isNaN(lat) || isNaN(lng)) return;

      // Always color by rep: if filtering use filter rep color, else use most-recent-visit rep color
      const primaryRepId = filteredRepId ?? (cluster.visit_history[0]?.rep_id ?? 0);
      const repColor = primaryRepId ? repColorMap[primaryRepId] : undefined;
      const icon = createClusterIcon(cluster, repColor);
      const marker = L.marker([lat, lng], { icon });
      marker.bindPopup(buildPopupHtml(cluster), { maxWidth: 270 });
      marker.addTo(layer);
    });

    if (data.length > 0) {
      try {
        const latlngs = data
          .map(c => [parseFloat(c.cluster_lat), parseFloat(c.cluster_lng)] as L.LatLngTuple)
          .filter(([lat, lng]) => !isNaN(lat) && !isNaN(lng));
        if (latlngs.length > 0) {
          const bounds = L.latLngBounds(latlngs);
          if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
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

    clusterLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      clusterLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    renderClusters(clusters);
  }, [clusters, lang, repIdFilter]);

  const statusCounts: Record<VisitStatus, number> = {
    interested: clusters.reduce((s, c) => s + parseInt(c.interested_count), 0),
    follow_up: clusters.reduce((s, c) => s + parseInt(c.follow_up_count), 0),
    not_suitable: clusters.reduce((s, c) => s + parseInt(c.not_suitable_count), 0),
    under_construction: clusters.reduce((s, c) => s + parseInt(c.under_construction_count), 0),
  };

  const hasFilters = cityFilter !== "all" || repIdFilter !== "all" || dateFrom || dateTo;

  return (
    <div className="-m-4 md:-m-6 flex flex-col" style={{ height: "calc(100dvh - 56px)" }}>
      {/* Header */}
      <div className="shrink-0 bg-card border-b border-border px-4 py-2 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <MapIcon className="w-5 h-5 text-primary" />
          <h1 className="font-bold text-base">{t("خريطة المبيعات", "Sales Map")}</h1>
        </div>

        {/* City filter */}
        <Select value={cityFilter} onValueChange={setCityFilter}>
          <SelectTrigger className="w-36 h-8 text-xs" data-testid="select-city-filter">
            <SelectValue placeholder={t("كل المدن", "All Cities")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("كل المدن", "All Cities")}</SelectItem>
            {cities.map(city => (
              <SelectItem key={city} value={city}>{city}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Rep filter */}
        <Select value={repIdFilter} onValueChange={setRepIdFilter}>
          <SelectTrigger className="w-36 h-8 text-xs" data-testid="select-rep-filter">
            <SelectValue placeholder={t("كل المناديب", "All Reps")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("كل المناديب", "All Reps")}</SelectItem>
            {salesReps.map((rep, i) => (
              <SelectItem key={rep.id} value={String(rep.id)}>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: REP_COLORS[i % REP_COLORS.length] }} />
                  <span>{rep.full_name_ar || rep.username}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Date range */}
        <div className="flex items-center gap-1">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={t("من (YYYY-MM-DD)", "From (YYYY-MM-DD)")}
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="h-8 w-32 text-xs border border-input rounded-md px-2 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            data-testid="input-date-from"
          />
          <span className="text-xs text-muted-foreground">—</span>
          <input
            type="text"
            placeholder={t("إلى (YYYY-MM-DD)", "To (YYYY-MM-DD)")}
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="h-8 w-32 text-xs border border-input rounded-md px-2 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            data-testid="input-date-to"
          />
          {hasFilters && (
            <button
              onClick={() => { setCityFilter("all"); setRepIdFilter("all"); setDateFrom(""); setDateTo(""); }}
              className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground"
              data-testid="button-clear-filters"
              title={t("مسح الفلاتر", "Clear filters")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 ms-auto text-xs text-muted-foreground">
          <span data-testid="text-total-buildings">{totalBuildings} {t("مبنى", "buildings")}</span>
          <span data-testid="text-total-visits">{totalVisits} {t("زيارة", "visits")}</span>
          <span className="text-green-600 font-semibold" data-testid="text-conversion-rate">{conversionRate}% {t("اهتمام", "interest")}</span>
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

      {/* Stats Panel */}
      {showStats && (
        <div className="shrink-0 bg-card/50 border-b border-border px-4 py-3 overflow-x-auto">
          <div className="flex gap-4 min-w-max">
            {/* Status breakdown */}
            <div className="flex gap-3">
              {(Object.entries(STATUS_CONFIG) as [VisitStatus, typeof STATUS_CONFIG[VisitStatus]][]).map(([key, cfg]) => {
                const count = statusCounts[key];
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

            {/* Zone coverage */}
            {zoneCoverage.length > 0 && (
              <>
                {zoneCoverage.map(z => (
                  <div key={z.id} className="flex flex-col gap-1 min-w-[100px] bg-muted/50 rounded-xl px-3 py-2">
                    <p className="text-xs font-medium truncate" title={z.name}>{z.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{z.repName}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${z.pct ?? 0}%`, background: z.pct !== null && z.pct >= 80 ? "#16a34a" : z.pct !== null && z.pct >= 40 ? "#d97706" : "#3b82f6" }}
                        />
                      </div>
                      <span className="text-[10px] font-semibold whitespace-nowrap" data-testid={`text-zone-coverage-${z.id}`}>
                        {z.pct !== null ? `${z.pct}%` : `${z.visitedInZone}`}
                      </span>
                    </div>
                    {z.target !== null && (
                      <p className="text-[10px] text-muted-foreground">
                        {z.visitedInZone}/{z.target} {t("مبنى", "bldgs")}
                      </p>
                    )}
                  </div>
                ))}
              </>
            )}

            {/* Divider */}
            <div className="w-px bg-border self-stretch mx-1" />

            {/* Per-rep stats */}
            {(stats?.byRep ?? []).filter(r => parseInt(r.visit_count) > 0).map((rep, i) => {
              const visitCount = parseInt(rep.visit_count);
              const intCount = parseInt(rep.interested_count);
              const rate = visitCount > 0 ? Math.round((intCount / visitCount) * 100) : 0;
              const repColor = repColorMap[rep.rep_id] ?? REP_COLORS[i % REP_COLORS.length];
              const isActive = repIdFilter === String(rep.rep_id);
              return (
                <button
                  key={rep.rep_id}
                  onClick={() => setRepIdFilter(isActive ? "all" : String(rep.rep_id))}
                  className={`flex items-center gap-2 min-w-[130px] rounded-xl px-3 py-2 transition-colors ${isActive ? "ring-2" : "bg-muted/50 hover:bg-muted"}`}
                  style={isActive ? { boxShadow: `0 0 0 2px ${repColor}`, background: repColor + "18" } : {}}
                  data-testid={`button-rep-filter-${rep.rep_id}`}
                >
                  <div className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: repColor }} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{rep.full_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {visitCount} {t("زيارة", "visits")} · <span className="text-green-600">{rate}%</span>
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Map */}
      <div className="flex-1 min-h-0 relative">
        <div ref={mapContainerRef} className="w-full h-full" />

        {isLoading && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-card/90 backdrop-blur border border-border rounded-full px-3 py-1.5 flex items-center gap-2 text-xs shadow">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {t("جاري التحميل...", "Loading...")}
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-10 start-3 z-[1000] bg-card/90 backdrop-blur border border-border rounded-xl p-3 shadow text-xs">
          <p className="font-semibold mb-2 text-muted-foreground">{t("دليل الألوان", "Legend")}</p>
          <div className="space-y-1 mb-2">
            {(Object.entries(STATUS_CONFIG) as [VisitStatus, typeof STATUS_CONFIG[VisitStatus]][]).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full border border-white/50 shrink-0" style={{ background: cfg.fillColor }} />
                <span className="text-muted-foreground">{lang === "ar" ? cfg.ar : cfg.en}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">{t("حجم الدائرة = عدد الزيارات", "Circle size = visit count")}</p>
        </div>

        {/* Empty state */}
        {!isLoading && clusters.length === 0 && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] text-center pointer-events-none">
            <div className="bg-card/90 backdrop-blur border border-border rounded-2xl px-6 py-5 shadow-lg">
              <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium text-muted-foreground">{t("لا توجد زيارات مسجلة", "No visits recorded")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("جرب تغيير الفلاتر أو انتظر تسجيل الزيارات", "Try changing filters or wait for visits")}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
