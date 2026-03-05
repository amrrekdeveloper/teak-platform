import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, FileText, FolderOpen, CreditCard, Loader2 } from "lucide-react";

export default function DashboardPage() {
  const { t } = useLanguage();
  const { user } = useAuth();

  const { data: stats, isLoading } = useQuery<any>({
    queryKey: ["/api/dashboard/stats"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const cards = [
    {
      titleAr: "العملاء",
      titleEn: "Customers",
      value: stats?.totalCustomers || 0,
      icon: Users,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      titleAr: "عروض الأسعار",
      titleEn: "Quotations",
      value: stats?.totalQuotations || 0,
      icon: FileText,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      titleAr: "العقود النشطة",
      titleEn: "Active Contracts",
      value: stats?.activeContracts || 0,
      icon: FolderOpen,
      color: "text-green-500",
      bg: "bg-green-500/10",
    },
    {
      titleAr: "إجمالي الإيرادات",
      titleEn: "Total Revenue",
      value: `${(stats?.totalRevenue || 0).toLocaleString()} SAR`,
      icon: CreditCard,
      color: "text-primary",
      bg: "bg-primary/10",
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">
          {t(`مرحباً ${user?.fullNameAr}`, `Welcome ${user?.fullNameEn}`)}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t("نظرة عامة على أداء المصنع", "Factory performance overview")}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <Card key={i} data-testid={`card-stat-${i}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {t(card.titleAr, card.titleEn)}
                    </p>
                    <p className="text-2xl font-bold mt-1" data-testid={`text-stat-value-${i}`}>
                      {card.value}
                    </p>
                  </div>
                  <div className={`w-12 h-12 rounded-lg ${card.bg} flex items-center justify-center ${card.color}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>{t("عروض أسعار معلقة", "Pending Quotations")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              {stats?.pendingQuotations || 0} {t("عرض سعر بانتظار المراجعة", "quotations awaiting review")}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
