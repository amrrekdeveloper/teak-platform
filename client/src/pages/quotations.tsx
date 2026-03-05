import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { Quotation, Customer } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Plus, Search, Loader2, FileText, Check, X } from "lucide-react";
import { Link } from "wouter";

const statusConfig: Record<string, { ar: string; en: string; color: string }> = {
  draft: { ar: "مسودة", en: "Draft", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  sent: { ar: "مرسل", en: "Sent", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  approved: { ar: "معتمد", en: "Approved", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  rejected: { ar: "مرفوض", en: "Rejected", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
  expired: { ar: "منتهي", en: "Expired", color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
};

export default function QuotationsPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: quotations = [], isLoading } = useQuery<Quotation[]>({
    queryKey: ["/api/quotations"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/quotations/${id}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      toast({ title: t("تم اعتماد عرض السعر", "Quotation approved") });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/quotations/${id}/reject`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      toast({ title: t("تم رفض عرض السعر", "Quotation rejected") });
    },
  });

  const getCustomerName = (customerId: number) => {
    return customers.find((c) => c.id === customerId)?.fullName || "";
  };

  const filtered = quotations.filter((q) => {
    const matchSearch =
      search === "" ||
      getCustomerName(q.customerId).includes(search) ||
      String(q.quotationNumber).includes(search);
    const matchStatus = statusFilter === "all" || q.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const canApprove = user?.role === "owner" || user?.role === "assistant";

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-quotations-title">
            {t("عروض الأسعار", "Quotations")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t(`${quotations.length} عرض سعر`, `${quotations.length} quotations`)}
          </p>
        </div>
        <Link href="/dashboard/quotations/new">
          <Button data-testid="button-new-quotation">
            <Plus className="w-4 h-4 me-2" />
            {t("عرض سعر جديد", "New Quotation")}
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("بحث...", "Search...")}
            className="ps-10"
            data-testid="input-search-quotations"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["all", "draft", "sent", "approved", "rejected"].map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(status)}
              data-testid={`button-filter-${status}`}
            >
              {status === "all"
                ? t("الكل", "All")
                : t(statusConfig[status]?.ar || status, statusConfig[status]?.en || status)}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[200px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t("لا توجد عروض أسعار", "No quotations found")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((q) => {
            const config = statusConfig[q.status] || statusConfig.draft;
            return (
              <Card key={q.id} data-testid={`card-quotation-${q.id}`}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">#{q.quotationNumber}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${config.color}`}>
                            {t(config.ar, config.en)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {getCustomerName(q.customerId)} - {new Date(q.createdAt).toLocaleDateString("ar-SA")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold">
                        {parseFloat(q.finalPrice).toLocaleString()} SAR
                      </span>
                      {canApprove && (q.status === "draft" || q.status === "sent") && (
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={() => approveMutation.mutate(q.id)}
                            disabled={approveMutation.isPending}
                            data-testid={`button-approve-${q.id}`}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => rejectMutation.mutate(q.id)}
                            disabled={rejectMutation.isPending}
                            data-testid={`button-reject-${q.id}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
