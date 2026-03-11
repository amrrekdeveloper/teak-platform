import { useLanguage } from "@/components/language-provider";
import { Clock, AlertTriangle, CheckCircle2 } from "lucide-react";

interface DeliveryCountdownProps {
  deliveryDays: number;
  productionStartDate: string | Date;
  compact?: boolean;
}

export function DeliveryCountdown({ deliveryDays, productionStartDate, compact = false }: DeliveryCountdownProps) {
  const { t } = useLanguage();

  const safeDays = Math.max(1, deliveryDays || 1);
  const startDate = new Date(productionStartDate);
  if (isNaN(startDate.getTime())) return null;

  const now = new Date();
  const elapsedMs = now.getTime() - startDate.getTime();
  const elapsedDays = Math.max(0, Math.floor(elapsedMs / (1000 * 60 * 60 * 24)));
  const remainingDays = Math.max(0, safeDays - elapsedDays);
  const progress = Math.min(100, Math.max(0, (elapsedDays / safeDays) * 100));

  const isOverdue = elapsedDays > safeDays;
  const isWarning = !isOverdue && progress >= 75;

  const barColor = isOverdue ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-green-500";
  const textColor = isOverdue ? "text-red-600" : isWarning ? "text-amber-600" : "text-green-600";
  const Icon = isOverdue ? AlertTriangle : isWarning ? Clock : CheckCircle2;

  if (compact) {
    return (
      <div className={`flex items-center gap-1 text-xs ${textColor}`} data-testid="delivery-countdown-compact">
        <Icon className="w-3 h-3" />
        <span>
          {isOverdue
            ? t(`متأخر ${elapsedDays - safeDays} يوم`, `${elapsedDays - safeDays}d overdue`)
            : t(`باقي ${remainingDays} يوم`, `${remainingDays}d left`)
          }
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5" data-testid="delivery-countdown">
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-1.5 text-sm font-medium ${textColor}`}>
          <Icon className="w-4 h-4" />
          <span>
            {isOverdue
              ? t("متأخر عن الموعد", "Overdue")
              : isWarning
                ? t("اقتراب الموعد", "Deadline approaching")
                : t("في الوقت المحدد", "On track")
            }
          </span>
        </div>
        <span className="text-sm font-semibold">
          {isOverdue
            ? t(`متأخر ${elapsedDays - safeDays} يوم`, `${elapsedDays - safeDays} days overdue`)
            : t(`باقي ${remainingDays} من ${safeDays} يوم`, `${remainingDays} of ${safeDays} days left`)
          }
        </span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div
          className={`${barColor} h-2 rounded-full transition-all duration-500`}
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{startDate.toLocaleDateString("ar-SA")}</span>
        <span>
          {new Date(startDate.getTime() + safeDays * 24 * 60 * 60 * 1000).toLocaleDateString("ar-SA")}
        </span>
      </div>
    </div>
  );
}
