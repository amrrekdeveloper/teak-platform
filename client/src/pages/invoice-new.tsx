import { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/components/language-provider";
import { useToast } from "@/hooks/use-toast";
import type { Customer, Quotation, Contract } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ArrowLeft, ArrowRight, Plus, Trash2, Check, ChevronsUpDown, Loader2, UserPlus, FileText, Receipt,
} from "lucide-react";

const FINANCE_ROLES = ["owner", "assistant", "it", "accountant"];

const formSchema = z.object({
  customerMode: z.enum(["existing", "new"]),
  customerId: z.string().optional(),
  newCustomerName: z.string().optional(),
  newCustomerPhone: z.string().optional(),
  newCustomerCity: z.string().optional(),
  sourceType: z.enum(["none", "quotation", "order", "contract"]),
  sourceId: z.string().optional(),
  type: z.enum(["simplified_tax_invoice", "standard_tax_invoice"]),
  buyerVatNumber: z.string().optional(),
  buyerAddress: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(z.object({
    description: z.string().min(1, "مطلوب"),
    quantity: z.coerce.number().positive("> 0"),
    unitPrice: z.coerce.number().nonnegative(">= 0"),
  })).min(1),
}).superRefine((val, ctx) => {
  if (val.customerMode === "existing" && !val.customerId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "اختر عميلاً", path: ["customerId"] });
  }
  if (val.customerMode === "new") {
    if (!val.newCustomerName || val.newCustomerName.trim().length < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "اسم العميل مطلوب", path: ["newCustomerName"] });
    }
    if (!val.newCustomerPhone || val.newCustomerPhone.trim().length < 6) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "رقم الجوال مطلوب", path: ["newCustomerPhone"] });
    }
  }
});

type FormValues = z.infer<typeof formSchema>;

const VAT_RATE = 0.15;
const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function extractMessage(e: Error, fallback: string): string {
  try {
    const body = e.message.replace(/^\d+:\s*/, "");
    const parsed = JSON.parse(body);
    if (parsed.message) return parsed.message;
  } catch {}
  return fallback;
}

export default function InvoiceNewPage() {
  const { t, isRTL } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;
  const isFinance = !!user && FINANCE_ROLES.includes(user.role);

  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"], enabled: isFinance });
  const { data: quotations = [] } = useQuery<Quotation[]>({ queryKey: ["/api/quotations"], enabled: isFinance });
  const { data: contracts = [] } = useQuery<Contract[]>({ queryKey: ["/api/contracts"], enabled: isFinance });
  const { data: settings } = useQuery<any>({ queryKey: ["/api/company-settings"], enabled: isFinance });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerMode: "existing",
      customerId: "",
      newCustomerName: "",
      newCustomerPhone: "",
      newCustomerCity: "",
      sourceType: "none",
      sourceId: "",
      type: "simplified_tax_invoice",
      buyerVatNumber: "",
      buyerAddress: "",
      notes: "",
      items: [{ description: "", quantity: 1, unitPrice: 0 }],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({ control: form.control, name: "items" });

  const customerMode = form.watch("customerMode");
  const sourceType = form.watch("sourceType");
  const sourceId = form.watch("sourceId");
  const invoiceType = form.watch("type");
  const watchedItems = form.watch("items");

  const subtotal = (watchedItems || []).reduce((s, it) => {
    const q = Number(it?.quantity) || 0;
    const p = Number(it?.unitPrice) || 0;
    return s + q * p;
  }, 0);
  const vatAmount = Math.round(subtotal * VAT_RATE * 100) / 100;
  const totals = { subtotal, vat: vatAmount, total: subtotal + vatAmount };

  // Auto-fill items + customer when a source (quotation/contract) is selected.
  useEffect(() => {
    if (sourceType === "none" || !sourceId) return;
    if (sourceType === "quotation" || sourceType === "order") {
      const q = quotations.find((x) => String(x.id) === sourceId);
      if (!q) return;
      const items = Array.isArray(q.items) ? (q.items as any[]) : [];
      const mapped = items.map((it: any) => {
        const qty = Number(it.quantity) || 1;
        const amount = parseFloat(it.amount ?? it.total ?? it.totalPrice ?? "0") || 0;
        const unit = it.unitPrice != null ? parseFloat(it.unitPrice) : (qty ? amount / qty : 0);
        return {
          description: it.description || it.productType || it.name || "بند",
          quantity: qty,
          unitPrice: Math.round(unit * 100) / 100,
        };
      });
      if (mapped.length) replace(mapped);
      if (q.customerId) {
        form.setValue("customerMode", "existing");
        form.setValue("customerId", String(q.customerId));
      }
    } else if (sourceType === "contract") {
      const c = contracts.find((x) => String(x.id) === sourceId);
      if (!c) return;
      const q = c.quotationId ? quotations.find((x) => x.id === c.quotationId) : undefined;
      const items = q && Array.isArray(q.items) ? (q.items as any[]) : [];
      if (items.length) {
        const mapped = items.map((it: any) => {
          const qty = Number(it.quantity) || 1;
          const amount = parseFloat(it.amount ?? it.total ?? it.totalPrice ?? "0") || 0;
          const unit = it.unitPrice != null ? parseFloat(it.unitPrice) : (qty ? amount / qty : 0);
          return {
            description: it.description || it.productType || it.name || "بند",
            quantity: qty,
            unitPrice: Math.round(unit * 100) / 100,
          };
        });
        replace(mapped);
      } else {
        const net = parseFloat(c.totalAmount || "0") / (1 + VAT_RATE);
        replace([{ description: `عقد رقم ${c.contractNumber}`, quantity: 1, unitPrice: Math.round(net * 100) / 100 }]);
      }
      if (c.customerId) {
        form.setValue("customerMode", "existing");
        form.setValue("customerId", String(c.customerId));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceType, sourceId]);

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      let customerId = values.customerId ? Number(values.customerId) : undefined;
      if (values.customerMode === "new") {
        const res = await apiRequest("POST", "/api/customers", {
          fullName: values.newCustomerName?.trim(),
          phone: values.newCustomerPhone?.trim(),
          city: values.newCustomerCity?.trim() || undefined,
          source: "phone",
        });
        const created = await res.json();
        customerId = created.id;
        qc.invalidateQueries({ queryKey: ["/api/customers"] });
      }
      const payload: any = {
        customerId,
        type: values.type,
        items: values.items.map((it) => ({
          description: it.description.trim(),
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
        })),
        notes: values.notes?.trim() || undefined,
      };
      if (values.sourceType !== "none" && values.sourceId) {
        payload.sourceType = values.sourceType;
        payload.sourceId = Number(values.sourceId);
      }
      if (values.type === "standard_tax_invoice") {
        payload.buyerVatNumber = values.buyerVatNumber?.trim() || undefined;
        payload.buyerAddress = values.buyerAddress?.trim() || undefined;
      }
      const res = await apiRequest("POST", "/api/invoices", payload);
      return res.json();
    },
    onSuccess: (invoice: any) => {
      qc.invalidateQueries({ queryKey: ["/api/invoices"] });
      qc.invalidateQueries({ queryKey: ["/api/finance/ready-to-invoice"] });
      toast({ title: t("تم إصدار الفاتورة بنجاح", "Invoice issued successfully") });
      navigate(`/invoices/${invoice.id}`);
    },
    onError: (e: Error) => {
      toast({ title: extractMessage(e, t("حدث خطأ في إصدار الفاتورة", "Failed to issue invoice")), variant: "destructive" });
    },
  });

  if (!isFinance) {
    return (
      <div className="p-6 text-center text-muted-foreground" data-testid="text-no-permission">
        {t("ليس لديك صلاحية لإنشاء فاتورة", "You do not have permission to create invoices")}
      </div>
    );
  }

  const selectedCustomer = customers.find((c) => String(c.id) === form.watch("customerId"));
  const isStandard = invoiceType === "standard_tax_invoice";

  const onSubmit = (values: FormValues) => createMutation.mutate(values);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto" dir={isRTL ? "rtl" : "ltr"}>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/invoices">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <BackIcon className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-new-invoice-title">{t("إنشاء فاتورة", "Create Invoice")}</h1>
          <p className="text-sm text-muted-foreground">{t("فاتورة ضريبية معيارية متوافقة مع هيئة الزكاة", "Standard ZATCA-compliant tax invoice")}</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Invoice type */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("نوع الفاتورة", "Invoice Type")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([
                  { v: "simplified_tax_invoice", icon: Receipt, ar: "فاتورة ضريبية مبسطة", en: "Simplified (B2C)", desc: "للأفراد" },
                  { v: "standard_tax_invoice", icon: FileText, ar: "فاتورة ضريبية قياسية", en: "Standard (B2B)", desc: "للمنشآت" },
                ] as const).map((opt) => {
                  const active = invoiceType === opt.v;
                  return (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => form.setValue("type", opt.v)}
                      className={`flex items-center gap-3 p-3 rounded-lg border text-start transition-colors ${active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                      data-testid={`button-type-${opt.v}`}
                    >
                      <opt.icon className={`w-5 h-5 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
                      <div>
                        <div className="font-medium text-sm">{t(opt.ar, opt.en)}</div>
                        <div className="text-xs text-muted-foreground">{t(opt.desc, opt.en)}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Customer */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("العميل", "Customer")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={customerMode === "existing" ? "default" : "outline"}
                  size="sm"
                  onClick={() => form.setValue("customerMode", "existing")}
                  data-testid="button-customer-existing"
                >
                  {t("عميل مسجّل", "Existing")}
                </Button>
                <Button
                  type="button"
                  variant={customerMode === "new" ? "default" : "outline"}
                  size="sm"
                  onClick={() => form.setValue("customerMode", "new")}
                  data-testid="button-customer-new"
                >
                  <UserPlus className="w-4 h-4 me-1" />
                  {t("عميل جديد", "New customer")}
                </Button>
              </div>

              {customerMode === "existing" ? (
                <FormField
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>{t("اختر العميل", "Select customer")}</FormLabel>
                      <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              type="button"
                              variant="outline"
                              role="combobox"
                              className="justify-between font-normal"
                              data-testid="button-select-customer"
                            >
                              {selectedCustomer ? `${selectedCustomer.fullName} — ${selectedCustomer.phone}` : t("ابحث عن عميل...", "Search customer...")}
                              <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                          <Command>
                            <CommandInput placeholder={t("بحث بالاسم أو الجوال...", "Search name or phone...")} data-testid="input-customer-search" />
                            <CommandList>
                              <CommandEmpty>{t("لا يوجد عميل", "No customer found")}</CommandEmpty>
                              <CommandGroup>
                                {customers.map((c) => (
                                  <CommandItem
                                    key={c.id}
                                    value={`${c.fullName} ${c.phone}`}
                                    onSelect={() => { field.onChange(String(c.id)); setCustomerPopoverOpen(false); }}
                                    data-testid={`option-customer-${c.id}`}
                                  >
                                    <Check className={`me-2 h-4 w-4 ${field.value === String(c.id) ? "opacity-100" : "opacity-0"}`} />
                                    <span>{c.fullName}</span>
                                    <span className="ms-auto text-xs text-muted-foreground" dir="ltr">{c.phone}</span>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <FormField control={form.control} name="newCustomerName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("اسم العميل", "Name")}</FormLabel>
                      <FormControl><Input {...field} placeholder={t("الاسم الكامل", "Full name")} data-testid="input-new-customer-name" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="newCustomerPhone" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("رقم الجوال", "Phone")}</FormLabel>
                      <FormControl><Input {...field} dir="ltr" placeholder="05xxxxxxxx" data-testid="input-new-customer-phone" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="newCustomerCity" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("المدينة", "City")}</FormLabel>
                      <FormControl><Input {...field} placeholder={t("المدينة", "City")} data-testid="input-new-customer-city" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              )}

              {isStandard && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
                  <FormField control={form.control} name="buyerVatNumber" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("الرقم الضريبي للمشتري", "Buyer VAT Number")}</FormLabel>
                      <FormControl><Input {...field} dir="ltr" placeholder="3xxxxxxxxxxxxxx" data-testid="input-buyer-vat" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="buyerAddress" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("عنوان المشتري", "Buyer Address")}</FormLabel>
                      <FormControl><Input {...field} placeholder={t("العنوان", "Address")} data-testid="input-buyer-address" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Source */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("المصدر (اختياري)", "Source (optional)")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">{t("ربط بمصدر", "Link to source")}</Label>
                  <Select
                    value={sourceType}
                    onValueChange={(v) => { form.setValue("sourceType", v as any); form.setValue("sourceId", ""); }}
                  >
                    <SelectTrigger data-testid="select-source-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("بدون مصدر (فاتورة مستقلة)", "No source (standalone)")}</SelectItem>
                      <SelectItem value="quotation">{t("عرض سعر", "Quotation")}</SelectItem>
                      <SelectItem value="order">{t("طلب", "Order")}</SelectItem>
                      <SelectItem value="contract">{t("عقد", "Contract")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {sourceType !== "none" && (
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("اختر المصدر", "Select source")}</Label>
                    <Select value={sourceId} onValueChange={(v) => form.setValue("sourceId", v)}>
                      <SelectTrigger data-testid="select-source-id"><SelectValue placeholder={t("اختر...", "Select...")} /></SelectTrigger>
                      <SelectContent>
                        {sourceType === "quotation"
                          ? quotations.map((q) => (
                              <SelectItem key={q.id} value={String(q.id)}>
                                #{q.quotationNumber} — {fmt(parseFloat(q.finalPrice || "0"))} {t("ر.س", "SAR")}
                              </SelectItem>
                            ))
                          : sourceType === "order"
                          ? quotations
                              .filter((q) => (q.orderStage || "new") !== "new")
                              .map((q) => (
                                <SelectItem key={q.id} value={String(q.id)}>
                                  #{q.quotationNumber} — {fmt(parseFloat(q.finalPrice || "0"))} {t("ر.س", "SAR")}
                                </SelectItem>
                              ))
                          : contracts.map((c) => (
                              <SelectItem key={c.id} value={String(c.id)}>
                                {c.contractNumber} — {fmt(parseFloat(c.totalAmount || "0"))} {t("ر.س", "SAR")}
                              </SelectItem>
                            ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              {sourceType !== "none" && (
                <p className="text-xs text-muted-foreground mt-2">
                  {t("تُعبّأ البنود والعميل تلقائيًا من المصدر، ويمكنك تعديلها.", "Items and customer are auto-filled from the source; you can edit them.")}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>{t("البنود", "Line Items")}</span>
                <Button type="button" size="sm" variant="outline" onClick={() => append({ description: "", quantity: 1, unitPrice: 0 })} data-testid="button-add-item">
                  <Plus className="w-4 h-4 me-1" />{t("إضافة بند", "Add item")}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Desktop table header */}
              <div className="hidden md:grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1 pb-2">
                <div className="col-span-5">{t("الوصف", "Description")}</div>
                <div className="col-span-2 text-center">{t("الكمية", "Qty")}</div>
                <div className="col-span-2 text-center">{t("سعر الوحدة", "Unit Price")}</div>
                <div className="col-span-2 text-center">{t("الإجمالي", "Total")}</div>
                <div className="col-span-1" />
              </div>
              <div className="space-y-3">
                {fields.map((f, idx) => {
                  const q = Number(watchedItems?.[idx]?.quantity) || 0;
                  const p = Number(watchedItems?.[idx]?.unitPrice) || 0;
                  return (
                    <div key={f.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start border md:border-0 rounded-lg p-3 md:p-0" data-testid={`row-item-${idx}`}>
                      <div className="md:col-span-5">
                        <Label className="md:hidden text-xs text-muted-foreground">{t("الوصف", "Description")}</Label>
                        <FormField control={form.control} name={`items.${idx}.description`} render={({ field }) => (
                          <FormItem>
                            <FormControl><Input {...field} placeholder={t("وصف البند", "Item description")} data-testid={`input-item-desc-${idx}`} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                      <div className="md:col-span-2">
                        <Label className="md:hidden text-xs text-muted-foreground">{t("الكمية", "Qty")}</Label>
                        <FormField control={form.control} name={`items.${idx}.quantity`} render={({ field }) => (
                          <FormItem>
                            <FormControl><Input type="number" min="0" step="any" {...field} className="text-center" data-testid={`input-item-qty-${idx}`} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                      <div className="md:col-span-2">
                        <Label className="md:hidden text-xs text-muted-foreground">{t("سعر الوحدة", "Unit Price")}</Label>
                        <FormField control={form.control} name={`items.${idx}.unitPrice`} render={({ field }) => (
                          <FormItem>
                            <FormControl><Input type="number" min="0" step="any" {...field} className="text-center" data-testid={`input-item-price-${idx}`} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                      <div className="md:col-span-2 flex md:justify-center md:items-center md:h-10">
                        <span className="md:hidden text-xs text-muted-foreground me-2">{t("الإجمالي:", "Total:")}</span>
                        <span className="font-medium tabular-nums" data-testid={`text-item-total-${idx}`}>{fmt(q * p)}</span>
                      </div>
                      <div className="md:col-span-1 flex md:justify-center md:items-center md:h-10">
                        <Button type="button" variant="ghost" size="icon" onClick={() => fields.length > 1 && remove(idx)} disabled={fields.length <= 1} data-testid={`button-remove-item-${idx}`}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Totals + Notes */}
          <Card>
            <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("ملاحظات", "Notes")}</FormLabel>
                  <FormControl><Textarea {...field} rows={4} placeholder={t("ملاحظات إضافية...", "Additional notes...")} data-testid="input-notes" /></FormControl>
                </FormItem>
              )} />
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("الإجمالي الخاضع للضريبة", "Taxable subtotal")}</span>
                  <span className="font-medium tabular-nums" data-testid="text-subtotal">{fmt(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("ضريبة القيمة المضافة (15%)", "VAT (15%)")}</span>
                  <span className="font-medium tabular-nums" data-testid="text-vat">{fmt(totals.vat)}</span>
                </div>
                <div className="flex justify-between text-base font-bold pt-2 border-t">
                  <span>{t("الإجمالي شامل الضريبة", "Total incl. VAT")}</span>
                  <span className="tabular-nums text-primary" data-testid="text-total">{fmt(totals.total)} {t("ر.س", "SAR")}</span>
                </div>
                {settings && (
                  <p className="text-xs text-muted-foreground pt-2">
                    {t("البائع:", "Seller:")} {settings.nameAr || settings.name} — {settings.vatNumber}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Link href="/invoices">
              <Button type="button" variant="outline" data-testid="button-cancel">{t("إلغاء", "Cancel")}</Button>
            </Link>
            <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-invoice">
              {createMutation.isPending && <Loader2 className="w-4 h-4 me-2 animate-spin" />}
              {t("إصدار الفاتورة", "Issue Invoice")}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
