import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Phone, MessageCircle, Store, Save, CheckCircle2, TrendingUp } from "lucide-react";
import type { DailySalesLog } from "@shared/schema";
import NotFound from "@/pages/not-found";

function CounterInput({
  value,
  onChange,
  label,
  icon: Icon,
  color,
  testId,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  icon: React.ElementType;
  color: string;
  testId: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border bg-card">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="flex-1 text-sm font-medium text-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-lg font-bold hover:bg-muted transition-colors text-muted-foreground"
          data-testid={`${testId}-dec`}
        >
          −
        </button>
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
          className="w-12 text-center text-xl font-bold bg-transparent border-0 focus:outline-none"
          data-testid={testId}
        />
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-lg font-bold hover:bg-muted transition-colors text-foreground"
          data-testid={`${testId}-inc`}
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function DailySalesEntryPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const today = new Date().toISOString().split("T")[0];

  const [callsCount, setCallsCount] = useState(0);
  const [whatsappCount, setWhatsappCount] = useState(0);
  const [showroomVisits, setShowroomVisits] = useState(0);
  const [notes, setNotes] = useState("");

  const { data: todayLog, isLoading } = useQuery<DailySalesLog | null>({
    queryKey: ["/api/daily-sales-logs/today"],
    refetchOnWindowFocus: false,
    enabled: !!user && user.role === "sales",
  });

  useEffect(() => {
    if (todayLog) {
      setCallsCount(todayLog.callsCount ?? 0);
      setWhatsappCount(todayLog.whatsappCount ?? 0);
      setShowroomVisits(todayLog.showroomVisits ?? 0);
      setNotes(todayLog.notes ?? "");
    }
  }, [todayLog]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/daily-sales-logs", {
        date: today,
        callsCount,
        whatsappCount,
        showroomVisits,
        notes: notes || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/daily-sales-logs/today"] });
      toast({ title: t("تم الحفظ بنجاح", "Saved successfully") });
    },
    onError: () => {
      toast({ title: t("حدث خطأ", "Error occurred"), variant: "destructive" });
    },
  });

  if (!user || user.role !== "sales") {
    return <NotFound />;
  }

  const dateLabel = new Date(today + "T12:00:00").toLocaleDateString("ar-SA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-5 px-1">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-primary" />
          {t("أداء اليوم", "Today's Performance")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{dateLabel}</p>
        {todayLog && (
          <div className="flex items-center gap-1.5 mt-2 text-green-600 text-sm">
            <CheckCircle2 className="w-4 h-4" />
            {t("تم تسجيل بيانات اليوم — يمكنك تعديلها", "Today's data recorded — you can update it")}
          </div>
        )}
      </div>

      <Card data-testid="card-daily-entry">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("تسجيل نتائج اليوم", "Record Today's Results")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CounterInput
            value={callsCount}
            onChange={setCallsCount}
            label={t("اتصالات", "Calls")}
            icon={Phone}
            color="bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400"
            testId="input-calls-count"
          />
          <CounterInput
            value={whatsappCount}
            onChange={setWhatsappCount}
            label={t("واتس آب", "WhatsApp")}
            icon={MessageCircle}
            color="bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400"
            testId="input-whatsapp-count"
          />
          <CounterInput
            value={showroomVisits}
            onChange={setShowroomVisits}
            label={t("زيارات المعرض", "Showroom")}
            icon={Store}
            color="bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
            testId="input-showroom-visits"
          />

          <div className="space-y-1.5 pt-1">
            <label className="text-sm font-medium text-muted-foreground">
              {t("ملاحظات (اختياري)", "Notes (optional)")}
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("أي ملاحظات عن يوم العمل...", "Any notes about today...")}
              rows={3}
              data-testid="input-notes"
            />
          </div>

          <Button
            className="w-full"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-save-daily-log"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin me-2" />
            ) : (
              <Save className="w-4 h-4 me-2" />
            )}
            {todayLog ? t("تحديث البيانات", "Update Data") : t("حفظ البيانات", "Save Data")}
          </Button>
        </CardContent>
      </Card>

      {todayLog && (
        <Card data-testid="card-today-summary">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm font-medium text-muted-foreground mb-3">{t("ملخص اليوم المحفوظ", "Saved Summary")}</p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                <p className="text-2xl font-bold text-blue-600" data-testid="text-saved-calls">{todayLog.callsCount}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("اتصالات", "Calls")}</p>
              </div>
              <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30">
                <p className="text-2xl font-bold text-green-600" data-testid="text-saved-whatsapp">{todayLog.whatsappCount}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("واتس آب", "WhatsApp")}</p>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30">
                <p className="text-2xl font-bold text-amber-600" data-testid="text-saved-showroom">{todayLog.showroomVisits}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("معرض", "Showroom")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
