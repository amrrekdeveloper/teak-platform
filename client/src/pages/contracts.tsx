import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Contract, Customer, Quotation } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Loader2, FolderOpen } from "lucide-react";
import { Link } from "wouter";

const statusConfig: Record<string, { ar: string; en: string; color: string }> = {
  active: { ar: "نشط", en: "Active", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  completed: { ar: "مكتمل", en: "Completed", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  cancelled: { ar: "ملغي", en: "Cancelled", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
};

export default function ContractsPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState("");

  const { data: contracts = [], isLoading } = useQuery<Contract[]>({
    queryKey: ["/api/contracts"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: quotations = [] } = useQuery<Quotation[]>({
    queryKey: ["/api/quotations"],
  });

  const approvedQuotations = quotations.filter((q) => q.status === "approved");

  const createMutation = useMutation({
    mutationFn: async (quotationId: number) => {
      const quotation = quotations.find((q) => q.id === quotationId);
      if (!quotation) throw new Error("Quotation not found");

      const contractNumber = `C-${Date.now().toString().slice(-6)}`;
      const res = await apiRequest("POST", "/api/contracts", {
        contractNumber,
        customerId: quotation.customerId,
        quotationId: quotation.id,
        totalAmount: quotation.finalPrice,
        paidAmount: "0",
        remainingAmount: quotation.finalPrice,
        status: "active",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      setDialogOpen(false);
      setSelectedQuotation("");
      toast({ title: t("تم إنشاء العقد بنجاح", "Contract created successfully") });
    },
    onError: () => {
      toast({ title: t("حدث خطأ", "An error occurred"), variant: "destructive" });
    },
  });

  const getCustomerName = (customerId: number) => {
    return customers.find((c) => c.id === customerId)?.fullName || "";
  };

  const filtered = contracts.filter((c) => {
    const name = getCustomerName(c.customerId);
    return name.toLowerCase().includes(search.toLowerCase()) || c.contractNumber.includes(search);
  });

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-contracts-title">
            {t("العقود", "Contracts")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t(`${contracts.length} عقد`, `${contracts.length} contracts`)}
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-contract" disabled={approvedQuotations.length === 0}>
              <Plus className="w-4 h-4 me-2" />
              {t("إنشاء عقد", "Create Contract")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("إنشاء عقد من عرض سعر معتمد", "Create Contract from Approved Quotation")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("عرض السعر المعتمد", "Approved Quotation")}</Label>
                <Select value={selectedQuotation} onValueChange={setSelectedQuotation}>
                  <SelectTrigger data-testid="select-quotation">
                    <SelectValue placeholder={t("اختر عرض السعر", "Select quotation")} />
                  </SelectTrigger>
                  <SelectContent>
                    {approvedQuotations.map((q) => (
                      <SelectItem key={q.id} value={String(q.id)}>
                        #{q.quotationNumber} - {getCustomerName(q.customerId)} - {parseFloat(q.finalPrice).toLocaleString()} SAR
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full"
                onClick={() => createMutation.mutate(parseInt(selectedQuotation))}
                disabled={!selectedQuotation || createMutation.isPending}
                data-testid="button-create-contract"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("إنشاء العقد", "Create Contract")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("بحث بالاسم أو رقم العقد...", "Search by name or contract number...")}
            className="ps-10"
            data-testid="input-search-contracts"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[200px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t("لا توجد عقود", "No contracts found")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((contract) => {
            const config = statusConfig[contract.status] || statusConfig.active;
            const paidPercent = parseFloat(contract.totalAmount) > 0
              ? Math.round((parseFloat(contract.paidAmount) / parseFloat(contract.totalAmount)) * 100)
              : 0;

            return (
              <Link key={contract.id} href={`/contracts/${contract.id}`}>
                <Card className="cursor-pointer hover:border-primary/30 transition-colors" data-testid={`card-contract-${contract.id}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                          <FolderOpen className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{contract.contractNumber}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${config.color}`}>
                              {t(config.ar, config.en)}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {getCustomerName(contract.customerId)}
                          </p>
                        </div>
                      </div>
                      <div className="text-end">
                        <p className="font-bold">{parseFloat(contract.totalAmount).toLocaleString()} SAR</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 rounded-full"
                              style={{ width: `${paidPercent}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{paidPercent}%</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
