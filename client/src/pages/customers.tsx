import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Customer } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Plus, Search, Phone, MapPin, Loader2, User } from "lucide-react";
import { Link } from "wouter";

export default function CustomersPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    email: "",
    city: "",
    district: "",
    buildingStatus: "",
    source: "phone" as const,
    notes: "",
  });

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/customers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setDialogOpen(false);
      setFormData({ fullName: "", phone: "", email: "", city: "", district: "", buildingStatus: "", source: "phone", notes: "" });
      toast({ title: t("تم إنشاء العميل بنجاح", "Customer created successfully") });
    },
    onError: () => {
      toast({ title: t("حدث خطأ", "An error occurred"), variant: "destructive" });
    },
  });

  const filtered = customers.filter(
    (c) =>
      c.fullName.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      (c.city && c.city.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-customers-title">
            {t("إدارة العملاء", "Customer Management")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t(`${customers.length} عميل مسجل`, `${customers.length} registered customers`)}
          </p>
        </div>
        {user?.role !== "sales" && <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-customer">
              <Plus className="w-4 h-4 me-2" />
              {t("إضافة عميل", "Add Customer")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("عميل جديد", "New Customer")}</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate(formData);
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t("الاسم الكامل", "Full Name")} *</Label>
                  <Input
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    required
                    data-testid="input-customer-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("رقم الجوال", "Phone")} *</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    required
                    data-testid="input-customer-phone"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("البريد الإلكتروني", "Email")}</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    data-testid="input-customer-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("المدينة", "City")}</Label>
                  <Input
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    data-testid="input-customer-city"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("الحي", "District")}</Label>
                  <Input
                    value={formData.district}
                    onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                    data-testid="input-customer-district"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("حالة المبنى", "Building Status")}</Label>
                  <Input
                    value={formData.buildingStatus}
                    onChange={(e) => setFormData({ ...formData, buildingStatus: e.target.value })}
                    placeholder={t("مثال: تحت الإنشاء", "e.g., Under construction")}
                    data-testid="input-customer-building"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("مصدر العميل", "Source")}</Label>
                  <Select
                    value={formData.source}
                    onValueChange={(v: any) => setFormData({ ...formData, source: v })}
                  >
                    <SelectTrigger data-testid="select-customer-source">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="phone">{t("هاتف", "Phone")}</SelectItem>
                      <SelectItem value="website">{t("الموقع", "Website")}</SelectItem>
                      <SelectItem value="walk_in">{t("زيارة مباشرة", "Walk-in")}</SelectItem>
                      <SelectItem value="referral">{t("إحالة", "Referral")}</SelectItem>
                      <SelectItem value="social_media">{t("وسائل التواصل", "Social Media")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("ملاحظات", "Notes")}</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  data-testid="input-customer-notes"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={createMutation.isPending}
                data-testid="button-submit-customer"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("حفظ العميل", "Save Customer")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>}
      </div>

      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("بحث بالاسم أو الجوال أو المدينة...", "Search by name, phone or city...")}
            className="ps-10"
            data-testid="input-search-customers"
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
            {search
              ? t("لا توجد نتائج للبحث", "No search results")
              : t("لا يوجد عملاء مسجلين", "No customers registered")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((customer) => (
            <Link key={customer.id} href={`/customers/${customer.id}`}>
              <Card className="cursor-pointer hover:border-primary/30 transition-colors" data-testid={`card-customer-${customer.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                      <User className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold truncate" data-testid={`text-customer-name-${customer.id}`}>
                        {customer.fullName}
                      </h3>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                        <Phone className="w-3 h-3" />
                        <span dir="ltr">{customer.phone}</span>
                      </div>
                      {customer.city && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
                          <MapPin className="w-3 h-3" />
                          <span>{customer.city}{customer.district ? ` - ${customer.district}` : ""}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
