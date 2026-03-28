import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { TrendingUp, Phone, MessageCircle, Store, Users, Calendar, Loader2 } from "lucide-react";
import type { DailySalesLog, User } from "@shared/schema";
import NotFound from "@/pages/not-found";

type PeriodTab = "daily" | "weekly" | "monthly";

interface ChartPoint {
  date: string;
  [key: string]: number | string;
}

interface LogSum {
  calls: number;
  whatsapp: number;
  showroom: number;
}

function getWeekRange(date: Date): { start: string; end: string } {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d.setDate(diff));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return {
    start: mon.toISOString().split("T")[0],
    end: sun.toISOString().split("T")[0],
  };
}

function getMonthRange(date: Date): { start: string; end: string } {
  const y = date.getFullYear();
  const m = date.getMonth();
  const start = new Date(y, m, 1).toISOString().split("T")[0];
  const end = new Date(y, m + 1, 0).toISOString().split("T")[0];
  return { start, end };
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
  testId,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
  testId?: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xl font-bold">{value.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function sumLogs(logs: DailySalesLog[]): LogSum {
  return logs.reduce<LogSum>((acc, l) => ({
    calls: acc.calls + (l.callsCount ?? 0),
    whatsapp: acc.whatsapp + (l.whatsappCount ?? 0),
    showroom: acc.showroom + (l.showroomVisits ?? 0),
  }), { calls: 0, whatsapp: 0, showroom: 0 });
}

export default function SalesPerformancePage() {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const today = new Date();

  const [tab, setTab] = useState<PeriodTab>("daily");
  const [repFilter, setRepFilter] = useState("all");

  const weekRange = getWeekRange(today);
  const monthRange = getMonthRange(today);

  const { data: allLogs = [], isLoading: logsLoading } = useQuery<DailySalesLog[]>({
    queryKey: ["/api/daily-sales-logs"],
    refetchInterval: 30000,
    staleTime: 0,
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const salesReps = useMemo(() => users.filter((u) => u.role === "sales" && u.active), [users]);

  const filteredLogs = useMemo(() => {
    if (repFilter === "all") return allLogs;
    return allLogs.filter((l) => String(l.salesRepId) === repFilter);
  }, [allLogs, repFilter]);

  const weekLogs = useMemo(
    () => filteredLogs.filter((l) => l.date >= weekRange.start && l.date <= weekRange.end),
    [filteredLogs, weekRange.start, weekRange.end]
  );

  const monthLogs = useMemo(
    () => filteredLogs.filter((l) => l.date >= monthRange.start && l.date <= monthRange.end),
    [filteredLogs, monthRange.start, monthRange.end]
  );

  const weekSum = sumLogs(weekLogs);
  const monthSum = sumLogs(monthLogs);
  const totalSum = sumLogs(filteredLogs);

  function getUserName(id: number): string {
    const u = users.find((u) => u.id === id);
    if (!u) return String(id);
    return lang === "ar" ? u.fullNameAr : u.fullNameEn;
  }

  const repColors: Record<string, string> = {};
  const palette = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"];
  salesReps.forEach((r, i) => {
    repColors[lang === "ar" ? r.fullNameAr : r.fullNameEn] = palette[i % palette.length];
  });

  const tableLogsForTab: DailySalesLog[] =
    tab === "daily" ? filteredLogs : tab === "weekly" ? weekLogs : monthLogs;

  const chartData = useMemo((): ChartPoint[] => {
    const logsForChart = tab === "daily" ? filteredLogs.slice(0, 30) : tab === "weekly" ? weekLogs : monthLogs;
    const dateMap: Record<string, ChartPoint> = {};
    for (const log of logsForChart) {
      if (!dateMap[log.date]) dateMap[log.date] = { date: log.date };
      const repName = getUserName(log.salesRepId);
      dateMap[log.date][`${repName}_calls`] = ((dateMap[log.date][`${repName}_calls`] as number) || 0) + (log.callsCount ?? 0);
      dateMap[log.date][`${repName}_whatsapp`] = ((dateMap[log.date][`${repName}_whatsapp`] as number) || 0) + (log.whatsappCount ?? 0);
      dateMap[log.date][`${repName}_showroom`] = ((dateMap[log.date][`${repName}_showroom`] as number) || 0) + (log.showroomVisits ?? 0);
    }
    return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredLogs, weekLogs, monthLogs, tab, users, lang]);

  const chartLines = salesReps.flatMap((r) => {
    const name = lang === "ar" ? r.fullNameAr : r.fullNameEn;
    const color = repColors[name] || "#888";
    return [
      { key: `${name}_calls`, label: `${name} - ${t("اتصالات", "Calls")}`, color, strokeDash: "" },
      { key: `${name}_whatsapp`, label: `${name} - ${t("واتس", "WA")}`, color, strokeDash: "5 5" },
      { key: `${name}_showroom`, label: `${name} - ${t("معرض", "SH")}`, color, strokeDash: "2 2" },
    ];
  });

  if (!user || (user.role !== "owner" && user.role !== "assistant" && user.role !== "it")) {
    return <NotFound />;
  }

  if (logsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" />
            {t("متابعة الأداء التسويقي", "Marketing Performance")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("أداء الفريق من حملة قوقل آدز", "Team performance from Google Ads campaigns")}
          </p>
        </div>
        <Select value={repFilter} onValueChange={setRepFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-rep-filter">
            <SelectValue placeholder={t("كل المناديب", "All Reps")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("كل المناديب", "All Reps")}</SelectItem>
            {salesReps.map((r) => (
              <SelectItem key={r.id} value={String(r.id)} data-testid={`option-rep-${r.id}`}>
                {lang === "ar" ? r.fullNameAr : r.fullNameEn}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard icon={Phone} label={t("اتصالات هذا الأسبوع", "Calls This Week")} value={weekSum.calls} color="bg-blue-500/10 text-blue-600" testId="stat-week-calls" />
        <SummaryCard icon={MessageCircle} label={t("واتس هذا الأسبوع", "WhatsApp This Week")} value={weekSum.whatsapp} color="bg-green-500/10 text-green-600" testId="stat-week-whatsapp" />
        <SummaryCard icon={Store} label={t("معرض هذا الشهر", "Showroom This Month")} value={monthSum.showroom} color="bg-amber-500/10 text-amber-600" testId="stat-month-showroom" />
        <SummaryCard icon={Users} label={t("إجمالي الاتصالات", "Total Calls")} value={totalSum.calls} color="bg-primary/10 text-primary" testId="stat-total-calls" />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as PeriodTab)}>
        <TabsList data-testid="tabs-period">
          <TabsTrigger value="daily" data-testid="tab-daily">{t("يومي", "Daily")}</TabsTrigger>
          <TabsTrigger value="weekly" data-testid="tab-weekly">{t("أسبوعي", "Weekly")}</TabsTrigger>
          <TabsTrigger value="monthly" data-testid="tab-monthly">{t("شهري", "Monthly")}</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4 space-y-4">
          {chartData.length > 1 && (
            <Card data-testid="card-chart">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  {t("الرسم البياني المقارن", "Comparative Chart")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip labelFormatter={(label: string) => label} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {chartLines.map((line) => (
                        <Line
                          key={line.key}
                          type="monotone"
                          dataKey={line.key}
                          name={line.label}
                          stroke={line.color}
                          strokeDasharray={line.strokeDash || undefined}
                          strokeWidth={2}
                          dot={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          <Card data-testid="card-table">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("جدول البيانات", "Data Table")}</CardTitle>
            </CardHeader>
            <CardContent>
              {tableLogsForTab.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-6">
                  {t("لا توجد بيانات للفترة المحددة", "No data for this period")}
                </p>
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground text-xs">
                          <th className="text-start py-2 pe-4">{t("التاريخ", "Date")}</th>
                          <th className="text-start py-2 pe-4">{t("المندوب", "Rep")}</th>
                          <th className="text-center py-2 pe-4">{t("اتصالات", "Calls")}</th>
                          <th className="text-center py-2 pe-4">{t("واتس آب", "WhatsApp")}</th>
                          <th className="text-center py-2 pe-4">{t("معرض", "Showroom")}</th>
                          <th className="text-start py-2">{t("ملاحظات", "Notes")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tableLogsForTab.map((log) => (
                          <tr key={log.id} className="border-b last:border-0 hover:bg-muted/40" data-testid={`row-log-${log.id}`}>
                            <td className="py-2.5 pe-4 font-mono text-xs">{log.date}</td>
                            <td className="py-2.5 pe-4 font-medium">{getUserName(log.salesRepId)}</td>
                            <td className="py-2.5 pe-4 text-center">
                              <Badge variant="secondary" className="text-blue-600 bg-blue-50 dark:bg-blue-950/30" data-testid={`badge-calls-${log.id}`}>
                                {log.callsCount ?? 0}
                              </Badge>
                            </td>
                            <td className="py-2.5 pe-4 text-center">
                              <Badge variant="secondary" className="text-green-600 bg-green-50 dark:bg-green-950/30" data-testid={`badge-whatsapp-${log.id}`}>
                                {log.whatsappCount ?? 0}
                              </Badge>
                            </td>
                            <td className="py-2.5 pe-4 text-center">
                              <Badge variant="secondary" className="text-amber-600 bg-amber-50 dark:bg-amber-950/30" data-testid={`badge-showroom-${log.id}`}>
                                {log.showroomVisits ?? 0}
                              </Badge>
                            </td>
                            <td className="py-2.5 text-muted-foreground text-xs">{log.notes ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t font-semibold text-xs">
                          <td colSpan={2} className="py-2 pe-4">{t("المجموع", "Total")}</td>
                          <td className="py-2 pe-4 text-center text-blue-600">{tableLogsForTab.reduce((s, l) => s + (l.callsCount ?? 0), 0)}</td>
                          <td className="py-2 pe-4 text-center text-green-600">{tableLogsForTab.reduce((s, l) => s + (l.whatsappCount ?? 0), 0)}</td>
                          <td className="py-2 pe-4 text-center text-amber-600">{tableLogsForTab.reduce((s, l) => s + (l.showroomVisits ?? 0), 0)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div className="md:hidden space-y-3">
                    {tableLogsForTab.map((log) => (
                      <div key={log.id} className="border rounded-lg p-3 space-y-2" data-testid={`card-log-${log.id}`}>
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{getUserName(log.salesRepId)}</span>
                          <span className="text-xs text-muted-foreground font-mono">{log.date}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="p-2 rounded bg-blue-50 dark:bg-blue-950/30">
                            <p className="text-lg font-bold text-blue-600">{log.callsCount ?? 0}</p>
                            <p className="text-[10px] text-muted-foreground">{t("اتصالات", "Calls")}</p>
                          </div>
                          <div className="p-2 rounded bg-green-50 dark:bg-green-950/30">
                            <p className="text-lg font-bold text-green-600">{log.whatsappCount ?? 0}</p>
                            <p className="text-[10px] text-muted-foreground">{t("واتس", "WA")}</p>
                          </div>
                          <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/30">
                            <p className="text-lg font-bold text-amber-600">{log.showroomVisits ?? 0}</p>
                            <p className="text-[10px] text-muted-foreground">{t("معرض", "SH")}</p>
                          </div>
                        </div>
                        {log.notes && (
                          <p className="text-xs text-muted-foreground">{log.notes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
