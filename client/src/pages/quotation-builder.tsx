import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import type { Customer, WoodType, DoorType, Product, DesignAssignment } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2, Loader2, Calculator, ArrowLeft, ArrowRight, Paperclip, Image, FileText, Search, Package, Ruler, Send, Save, ChevronDown, ChevronUp, Settings2, Eye, Download, Globe, List, LayoutList, Upload, X as XIcon, Check, Receipt } from "lucide-react";
import { Checkbox as CheckboxUI } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { DialogFooter } from "@/components/ui/dialog";

type ItemMode = "area" | "product";

interface ProductOption {
  value: string;
  labelAr: string;
  labelEn: string;
  price: number;
}

interface PricingOptions {
  drawerType: ProductOption[];
  hingeType: ProductOption[];
  liftMechanism: ProductOption[];
}

interface LineItem {
  id: string;
  mode: ItemMode;
  productId: number | null;
  productType: string;
  woodType: string;
  doorType: string;
  description: string;
  area: number;
  pricePerMeter: number;
  adekoProductId: number | null;
  adekoCode: string;
  adekoNameAr: string;
  adekoNameEn: string;
  qty: number;
  total: number;
  quantity: number;
  unitPrice: number;
  optionsCost: number;
  optionDetails: Record<string, { name: string; price: number }>;
  options: {
    drawerType: string;
    hingeType: string;
    liftMechanism: string;
  };
  code: string;
  nameAr: string;
  nameEn: string;
  dimensions: { w: number; h: number; d: number };
  useAdeko: boolean;
  showOptions: boolean;
}

function createEmptyItem(): LineItem {
  return {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    mode: "product" as ItemMode,
    productId: null,
    productType: "",
    woodType: "",
    doorType: "",
    description: "",
    area: 0,
    pricePerMeter: 0,
    adekoProductId: null,
    adekoCode: "",
    adekoNameAr: "",
    adekoNameEn: "",
    qty: 1,
    total: 0,
    quantity: 1,
    unitPrice: 0,
    optionsCost: 0,
    optionDetails: {},
    options: { drawerType: "standard", hingeType: "standard", liftMechanism: "none" },
    code: "",
    nameAr: "",
    nameEn: "",
    dimensions: { w: 0, h: 0, d: 0 },
    useAdeko: true,
    showOptions: false,
  };
}

export default function QuotationBuilderPage() {
  const { t, isRTL, lang } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const searchParams = new URLSearchParams(window.location.search);
  const preselectedCustomerId = searchParams.get("customerId");
  const preselectedSurveyId = searchParams.get("surveyId");
  const preselectedQuotationId = searchParams.get("quotationId");

  const [customerId, setCustomerId] = useState(preselectedCustomerId || "");
  const [items, setItems] = useState<LineItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("fixed");
  const [deliveryDays, setDeliveryDays] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [adekoSearch, setAdekoSearch] = useState("");
  const [adekoDialog, setAdekoDialog] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [savedQuotationId, setSavedQuotationId] = useState<number | null>(
    preselectedQuotationId ? parseInt(preselectedQuotationId) : null
  );
  const [savedQuotationStatus, setSavedQuotationStatus] = useState<string | null>(null);
  const [quotationMode, setQuotationMode] = useState<"detailed" | "summary">("detailed");
  const [summaryDescription, setSummaryDescription] = useState("");
  const [summaryPriceBeforeVat, setSummaryPriceBeforeVat] = useState<number>(0);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approveReceiptFile, setApproveReceiptFile] = useState<File | null>(null);
  const [approveReceiptPreview, setApproveReceiptPreview] = useState<string | null>(null);
  const approveReceiptInputRef = useRef<HTMLInputElement>(null);
  const [selectedAttachments, setSelectedAttachments] = useState<Set<number>>(new Set());
  const [attachmentFile, setAttachmentFile] = useState<{ data: string; name: string; mime: string } | null>(null);
  const [showAttachmentToCustomer, setShowAttachmentToCustomer] = useState(false);
  const pendingSendAfterSave = useRef(false);
  const existingQuotationLoaded = useRef(false);
  const defaultValidUntil = () => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  };
  const [validUntilDate, setValidUntilDate] = useState<string>(defaultValidUntil());

  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const { data: woodTypes = [] } = useQuery<WoodType[]>({ queryKey: ["/api/wood-types"] });
  const { data: doorTypes = [] } = useQuery<DoorType[]>({ queryKey: ["/api/door-types"] });
  const { data: adekoProducts = [] } = useQuery<any[]>({
    queryKey: ["/api/adeko-products"],
    queryFn: async () => {
      const res = await fetch("/api/adeko-products?limit=500", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.products || []);
    },
  });

  const { data: existingQuotation } = useQuery<any>({
    queryKey: ["/api/quotations", preselectedQuotationId],
    queryFn: async () => {
      const res = await fetch(`/api/quotations/${preselectedQuotationId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!preselectedQuotationId,
  });

  useEffect(() => {
    if (existingQuotation && !existingQuotationLoaded.current) {
      existingQuotationLoaded.current = true;
      setCustomerId(String(existingQuotation.customerId));
      setNotes(existingQuotation.notes || "");
      setDeliveryDays(existingQuotation.deliveryDays || null);
      if (existingQuotation.validUntil) setValidUntilDate(existingQuotation.validUntil);
      setSavedQuotationStatus(existingQuotation.status);
      if (existingQuotation.attachmentData) {
        setAttachmentFile({ data: existingQuotation.attachmentData, name: existingQuotation.attachmentName || "attachment", mime: existingQuotation.attachmentMime || "application/octet-stream" });
      }
      setShowAttachmentToCustomer(existingQuotation.showAttachmentToCustomer || false);

      const existingItems: any[] = Array.isArray(existingQuotation.items) ? existingQuotation.items : [];
      if (existingItems.length === 0) return;

      const isSummary = existingItems.length === 1 && !existingItems[0].code && !existingItems[0].productType && !existingItems[0].area;
      if (isSummary) {
        setQuotationMode("summary");
        setSummaryDescription(existingItems[0].nameAr || existingItems[0].description || "");
        setSummaryPriceBeforeVat(parseFloat(existingItems[0].unitPrice || 0));
        const disc = parseFloat(existingQuotation.discount || "0");
        setDiscount(disc);
        setDiscountType("fixed");
        return;
      }
      const loadedItems: LineItem[] = existingItems.map((item: any) => ({
        id: Date.now().toString() + Math.random().toString(36).slice(2),
        mode: item.area > 0 ? "area" as ItemMode : "product" as ItemMode,
        productId: item.productId || null,
        productType: item.productType || "",
        woodType: item.woodType || "",
        doorType: item.doorType || "",
        description: item.description || item.nameAr || "",
        area: parseFloat(item.area || 0),
        pricePerMeter: parseFloat(item.pricePerMeter || 0),
        adekoProductId: item.productId || null,
        adekoCode: item.code || "",
        adekoNameAr: item.nameAr || "",
        adekoNameEn: item.nameEn || "",
        qty: parseFloat(item.quantity || 1),
        total: parseFloat(item.total || item.lineTotal || 0),
        quantity: parseFloat(item.quantity || 1),
        unitPrice: parseFloat(item.unitPrice || 0),
        optionsCost: parseFloat(item.optionsCost || 0),
        optionDetails: item.optionDetails || {},
        options: { drawerType: "standard", hingeType: "standard", liftMechanism: "none" },
        code: item.code || "",
        nameAr: item.nameAr || item.description || "",
        nameEn: item.nameEn || "",
        dimensions: item.dimensions || { w: 0, h: 0, d: 0 },
        useAdeko: !!(item.code && item.productId),
        showOptions: false,
      }));
      setItems(loadedItems);
      const disc = parseFloat(existingQuotation.discount || "0");
      setDiscount(disc);
      setDiscountType("fixed");
    }
  }, [existingQuotation]);

  const { data: surveyData } = useQuery<any>({
    queryKey: ["/api/site-surveys", preselectedSurveyId],
    queryFn: async () => {
      const res = await fetch(`/api/site-surveys/${preselectedSurveyId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!preselectedSurveyId,
  });

  const { data: surveyDesignFiles = [], refetch: refetchDesignFiles } = useQuery<any[]>({
    queryKey: ["/api/site-surveys", preselectedSurveyId, "design-files"],
    queryFn: async () => {
      const res = await fetch(`/api/site-surveys/${preselectedSurveyId}/design-files`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!preselectedSurveyId,
  });

  const [surveyLoaded, setSurveyLoaded] = useState(false);
  useEffect(() => {
    if (surveyData && !surveyLoaded && adekoProducts.length > 0) {
      setSurveyLoaded(true);
      const surveyProducts = (surveyData.selectedProducts || []) as any[];
      if (surveyProducts.length > 0 && items.length === 0) {
        const loadedItems: LineItem[] = surveyProducts.map((sp: any) => {
          const adeko = sp.productId ? adekoProducts.find((p: any) => p.id === sp.productId) : null;
          return {
            id: Date.now().toString() + Math.random().toString(36).slice(2),
            productId: sp.productId || null,
            productType: "",
            woodType: "",
            doorType: "",
            description: sp.name || sp.nameAr || sp.code || "",
            area: 0,
            pricePerMeter: 0,
            total: (parseFloat(sp.unitPrice || adeko?.priceBeforeVat || 0) + parseFloat(sp.optionsCost || 0)) * (sp.quantity || 1),
            quantity: sp.quantity || 1,
            unitPrice: parseFloat(sp.unitPrice || adeko?.priceBeforeVat || 0),
            optionsCost: parseFloat(sp.optionsCost || 0),
            optionDetails: sp.optionDetails || {},
            options: { drawerType: "standard", hingeType: "standard", liftMechanism: "none" },
            code: sp.code || adeko?.code || "",
            nameAr: sp.name || sp.nameAr || adeko?.descriptionAr || "",
            nameEn: sp.nameEn || adeko?.descriptionEn || "",
            dimensions: sp.dimensions || { w: adeko?.designW || 0, h: adeko?.designH || 0, d: adeko?.designD || 0 },
            useAdeko: !!sp.productId,
            showOptions: false,
          };
        });
        setItems(loadedItems);
        if (surveyData.customerId) {
          setCustomerId(String(surveyData.customerId));
        }
      }
    }
  }, [surveyData, surveyLoaded, adekoProducts, items.length]);

  const { data: pricingOptions } = useQuery<PricingOptions>({
    queryKey: ["/api/pricing/options"],
  });

  const { data: designAssignments = [] } = useQuery<DesignAssignment[]>({
    queryKey: ["/api/design-assignments/customer", customerId],
    queryFn: async () => {
      if (!customerId) return [];
      const res = await fetch(`/api/design-assignments/customer/${customerId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!customerId,
  });

  const completedDesign = designAssignments.find(da => da.status === "completed");

  const filteredAdekoProducts = useMemo(() => {
    if (!productSearch.trim()) return adekoProducts.slice(0, 50);
    const q = productSearch.toLowerCase();
    return adekoProducts.filter((p: any) =>
      (p.code?.toLowerCase().includes(q)) ||
      (p.descriptionAr?.toLowerCase().includes(q)) ||
      (p.descriptionEn?.toLowerCase().includes(q)) ||
      (p.groupNameAr?.toLowerCase().includes(q)) ||
      (p.groupNameEn?.toLowerCase().includes(q))
    ).slice(0, 50);
  }, [adekoProducts, productSearch]);

  const categoryLabels: Record<string, { ar: string; en: string }> = {
    kitchen: { ar: "مطبخ", en: "Kitchen" },
    wardrobe: { ar: "خزانة ملابس", en: "Wardrobe" },
    door: { ar: "باب", en: "Door" },
    decoration: { ar: "ديكور", en: "Decoration" },
    hotel: { ar: "تجهيز فنادق", en: "Hotel Furnishing" },
  };

  function newItem(mode: ItemMode): LineItem {
    return {
      ...createEmptyItem(),
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      mode,
      useAdeko: mode !== "area",
    };
  }

  const getOptionPrice = useCallback((optKey: string, optVal: string): number => {
    if (!pricingOptions) return 0;
    const opts = (pricingOptions as any)[optKey];
    if (!opts) return 0;
    const found = opts.find((o: ProductOption) => o.value === optVal);
    return found?.price || 0;
  }, [pricingOptions]);

  const addAreaItem = () => setItems([...items, newItem("area")]);
  const addProductItem = () => setItems([...items, newItem("product")]);
  const addItem = () => setItems([...items, createEmptyItem()]);

  const removeItem = (id: string) => setItems(items.filter((i) => i.id !== id));

  const updateItem = (id: string, field: string, value: any) => {
    setItems(
      items.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value };

        if (item.mode === "area") {
          if (field === "woodType") {
            const wt = woodTypes.find((w) => w.id === parseInt(value));
            if (wt) {
              updated.pricePerMeter = parseFloat(wt.pricePerMeter);
              updated.unitPrice = updated.area * parseFloat(wt.pricePerMeter);
              updated.total = (updated.unitPrice + updated.optionsCost) * updated.quantity;
            }
          }
          if (field === "doorType") {
            const dt = doorTypes.find((d) => d.id === parseInt(value));
            if (dt) {
              updated.pricePerMeter = parseFloat(dt.pricePerMeter);
              updated.unitPrice = updated.area * parseFloat(dt.pricePerMeter);
              updated.total = (updated.unitPrice + updated.optionsCost) * updated.quantity;
            }
          }
          if (field === "area") {
            const newArea = parseFloat(value) || 0;
            updated.area = newArea;
            updated.unitPrice = newArea * updated.pricePerMeter;
            updated.total = (updated.unitPrice + updated.optionsCost) * updated.quantity;
          }
          if (field === "pricePerMeter") {
            updated.pricePerMeter = parseFloat(value || "0");
            updated.unitPrice = updated.area * updated.pricePerMeter;
            updated.total = (updated.unitPrice + updated.optionsCost) * updated.quantity;
          }
          if (field === "quantity") {
            updated.quantity = parseInt(value) || 1;
            updated.total = (updated.unitPrice + updated.optionsCost) * updated.quantity;
          }
        }

        if (item.mode === "product") {
          if (field === "productId" && value) {
            const adeko = adekoProducts.find((p: any) => p.id === parseInt(value));
            if (adeko) {
              updated.unitPrice = parseFloat(adeko.priceBeforeVat?.toString() || "0");
              updated.code = adeko.code || "";
              updated.nameAr = adeko.descriptionAr || adeko.code || "";
              updated.nameEn = adeko.descriptionEn || adeko.code || "";
              updated.dimensions = {
                w: parseFloat(adeko.designW?.toString() || adeko.manufacturingW?.toString() || "0"),
                h: parseFloat(adeko.designH?.toString() || adeko.manufacturingH?.toString() || "0"),
                d: parseFloat(adeko.designD?.toString() || adeko.manufacturingD?.toString() || "0"),
              };
              updated.total = (updated.unitPrice + updated.optionsCost) * updated.quantity;
            }
          }
          if (field === "qty" || field === "quantity") {
            updated.quantity = parseInt(value) || 1;
            updated.qty = updated.quantity;
            updated.total = (updated.unitPrice + updated.optionsCost) * updated.quantity;
          }
          if (field === "unitPrice") {
            updated.unitPrice = parseFloat(value || "0");
            updated.total = (updated.unitPrice + updated.optionsCost) * updated.quantity;
          }
        }

        return updated;
      })
    );
  };

  const selectAdekoProduct = (itemId: string, product: any) => {
    setItems(
      items.map((item) => {
        if (item.id !== itemId) return item;
        const unitPrice = parseFloat(product.priceBeforeVat || product.price || "0");
        const qty = item.quantity || item.qty || 1;
        return {
          ...item,
          productId: product.id,
          adekoProductId: product.id,
          adekoCode: product.code,
          adekoNameAr: product.nameAr || product.descriptionAr,
          adekoNameEn: product.nameEn || product.descriptionEn,
          code: product.code,
          nameAr: product.nameAr || product.descriptionAr,
          nameEn: product.nameEn || product.descriptionEn,
          description: lang === "ar" ? (product.nameAr || product.descriptionAr) : (product.nameEn || product.descriptionEn),
          unitPrice,
          total: (unitPrice + item.optionsCost) * qty,
          dimensions: {
            w: parseFloat(product.designW?.toString() || product.manufacturingW?.toString() || "0"),
            h: parseFloat(product.designH?.toString() || product.manufacturingH?.toString() || "0"),
            d: parseFloat(product.designD?.toString() || product.manufacturingD?.toString() || "0"),
          }
        };
      })
    );
    setAdekoDialog(null);
    setAdekoSearch("");
  };

  const updateItemOption = (id: string, optKey: string, optVal: string) => {
    setItems(
      items.map((item) => {
        if (item.id !== id) return item;
        const price = getOptionPrice(optKey, optVal);
        const newOptions = { ...item.options, [optKey]: optVal };
        const newOptDetails = { ...item.optionDetails };

        if (price > 0) {
          newOptDetails[optKey] = { name: optVal, price };
        } else {
          delete newOptDetails[optKey];
        }

        const newOptCost = Object.values(newOptDetails).reduce((s, d) => s + d.price, 0);
        const qty = item.quantity || item.qty || 1;
        const newTotal = (item.unitPrice + newOptCost) * qty;

        return {
          ...item,
          options: newOptions,
          optionDetails: newOptDetails,
          optionsCost: newOptCost,
          total: newTotal,
        };
      })
    );
  };

  const totals = useMemo(() => {
    if (quotationMode === "summary") {
      const subtotal = summaryPriceBeforeVat;
      const clampedDiscount = discountType === "percent" ? Math.max(0, Math.min(discount, 100)) : Math.max(0, Math.min(discount, subtotal));
      const discountAmount = discountType === "percent" ? (subtotal * clampedDiscount) / 100 : clampedDiscount;
      const afterDiscount = Math.max(0, subtotal - discountAmount);
      const vatAmount = afterDiscount * 0.15;
      const finalPrice = afterDiscount + vatAmount;
      return { totalArea: 0, subtotal, discountAmount, afterDiscount, vatAmount, finalPrice };
    }
    const subtotal = items.reduce((sum, i) => sum + (i.total || 0), 0);
    const totalArea = items.filter(i => i.mode === "area").reduce((sum, i) => sum + (i.area || 0), 0);
    const clampedDiscount = discountType === "percent" ? Math.max(0, Math.min(discount, 100)) : Math.max(0, Math.min(discount, subtotal));
    const discountAmount = discountType === "percent" ? (subtotal * clampedDiscount) / 100 : clampedDiscount;
    const afterDiscount = Math.max(0, subtotal - discountAmount);
    const vatAmount = afterDiscount * 0.15;
    const finalPrice = afterDiscount + vatAmount;
    return { totalArea, subtotal, discountAmount, afterDiscount, vatAmount, finalPrice };
  }, [items, discount, discountType, quotationMode, summaryPriceBeforeVat]);

  const buildCommonPayload = (status: "draft" | "sent", itemsList: any[]) => ({
    customerId: parseInt(customerId),
    items: itemsList,
    totalArea: String(items.filter(i => i.mode === "area").reduce((s, i) => s + (i.area || 0), 0)),
    subtotal: String(totals.subtotal),
    vatRate: "15",
    vatAmount: String(totals.vatAmount),
    totalPrice: String(totals.finalPrice),
    discount: String(totals.discountAmount),
    finalPrice: String(totals.finalPrice),
    status,
    deliveryDays: deliveryDays || null,
    notes,
    validUntil: validUntilDate,
    designFile: completedDesign?.sketchImage || null,
    attachmentData: attachmentFile?.data || null,
    attachmentName: attachmentFile?.name || null,
    attachmentMime: attachmentFile?.mime || null,
    showAttachmentToCustomer,
  });

  const saveMutation = useMutation({
    mutationFn: async (status: "draft" | "sent") => {
      const editingId = preselectedQuotationId ? parseInt(preselectedQuotationId) : savedQuotationId;

      if (quotationMode === "summary") {
        const summaryItems = [{
          description: summaryDescription,
          nameAr: summaryDescription,
          nameEn: summaryDescription,
          quantity: 1,
          unitPrice: summaryPriceBeforeVat,
          optionsCost: 0,
          optionDetails: {},
          total: summaryPriceBeforeVat,
        }];
        const payload = buildCommonPayload(status, summaryItems);
        let quotation: any;
        if (editingId) {
          const res = await apiRequest("PATCH", `/api/quotations/${editingId}`, payload);
          quotation = await res.json();
        } else {
          const res = await apiRequest("POST", "/api/quotations", { ...payload, status: "draft" });
          quotation = await res.json();
          if (status === "sent") {
            await apiRequest("POST", `/api/pricing/send-to-customer/${quotation.id}`);
          }
        }
        return quotation;
      }

      const hasAdekoItems = items.some(i => i.useAdeko && i.productId);
      const hasManuItems = items.some(i => !i.useAdeko);

      if (editingId) {
        const allItems = items.map(i => i.useAdeko ? {
          productId: i.productId,
          code: i.code,
          nameAr: i.nameAr,
          nameEn: i.nameEn,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          optionsCost: i.optionsCost,
          optionDetails: i.optionDetails,
          total: i.total,
          dimensions: i.dimensions,
        } : {
          productType: i.productType,
          woodType: i.woodType,
          doorType: i.doorType,
          description: i.description,
          area: i.area,
          pricePerMeter: i.pricePerMeter,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          optionsCost: i.optionsCost,
          optionDetails: i.optionDetails,
          total: i.total,
        });
        const res = await apiRequest("PATCH", `/api/quotations/${editingId}`, buildCommonPayload(status, allItems));
        return res.json();
      }

      if (hasAdekoItems) {
        const lineItems: any[] = items.filter(i => i.useAdeko && i.productId).map(i => ({
          productId: i.productId,
          code: i.code,
          nameAr: i.nameAr,
          nameEn: i.nameEn,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          optionsCost: i.optionsCost,
          optionDetails: i.optionDetails,
          lineTotal: i.total,
          dimensions: i.dimensions,
        }));
        if (hasManuItems) {
          lineItems.push(...items.filter(i => !i.useAdeko).map(i => ({
            productId: 0,
            code: i.productType,
            nameAr: i.description || t(categoryLabels[i.productType]?.ar || i.productType, categoryLabels[i.productType]?.en || i.productType),
            nameEn: i.description || categoryLabels[i.productType]?.en || i.productType,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            optionsCost: i.optionsCost,
            optionDetails: i.optionDetails,
            lineTotal: i.total,
            dimensions: i.dimensions,
          })));
        }
        const res = await apiRequest("POST", "/api/pricing/save-quotation", {
          customerId: parseInt(customerId),
          lineItems,
          subtotal: totals.subtotal,
          discountAmount: totals.discountAmount,
          vat: totals.vatAmount,
          total: totals.finalPrice,
          notes,
          deliveryDays,
          surveyId: preselectedSurveyId ? parseInt(preselectedSurveyId) : undefined,
          validUntil: validUntilDate,
          attachmentData: attachmentFile?.data || null,
          attachmentName: attachmentFile?.name || null,
          attachmentMime: attachmentFile?.mime || null,
          showAttachmentToCustomer,
        });
        const quotation = await res.json();
        if (status === "sent") {
          await apiRequest("POST", `/api/pricing/send-to-customer/${quotation.id}`);
        }
        return quotation;
      } else {
        const manualItems = items.map((i) => ({
          productType: i.productType,
          woodType: i.woodType,
          doorType: i.doorType,
          description: i.description,
          area: i.area,
          pricePerMeter: i.pricePerMeter,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          optionsCost: i.optionsCost,
          optionDetails: i.optionDetails,
          total: i.total,
        }));
        const res = await apiRequest("POST", "/api/quotations", buildCommonPayload(status, manualItems));
        return res.json();
      }
    },
    onSuccess: (quotation: any, status: "draft" | "sent") => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quote-requests"] });
      if (quotation?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/quotations", String(quotation.id)] });
      }
      if (status === "draft") {
        setSavedQuotationId(quotation?.id || null);
        setSavedQuotationStatus(quotation?.status || "draft");
        toast({ title: preselectedQuotationId ? t("تم حفظ التعديلات", "Changes saved") : t("تم حفظ عرض السعر كمسودة", "Quotation saved as draft") });
        if (pendingSendAfterSave.current) {
          pendingSendAfterSave.current = false;
          const initialAttachments = new Set<number>(
            surveyDesignFiles.filter((f: any) => f.attach_to_quote).map((f: any) => f.id)
          );
          setSelectedAttachments(initialAttachments);
          setSendDialogOpen(true);
        }
      } else {
        toast({ title: t("تم إرسال عرض السعر للعميل بنجاح", "Quotation sent to customer successfully") });
        setLocation("/quotations");
      }
    },
    onError: () => {
      toast({ title: t("حدث خطأ في حفظ عرض السعر", "Error saving quotation"), variant: "destructive" });
    },
  });

  const sendToCustomerMutation = useMutation({
    mutationFn: async (quotationId: number) => {
      const res = await apiRequest("POST", `/api/pricing/send-to-customer/${quotationId}`);
      return res.json();
    },
    onSuccess: () => {
      setSavedQuotationStatus("sent");
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      toast({ title: t("تم إرسال عرض السعر للعميل بنجاح", "Quotation sent to customer successfully") });
      setLocation("/quotations");
    },
    onError: () => {
      toast({ title: t("حدث خطأ في إرسال عرض السعر", "Error sending quotation"), variant: "destructive" });
    },
  });

  const approveFromBuilderMutation = useMutation({
    mutationFn: async ({ id, receiptData, receiptName }: { id: number; receiptData?: string; receiptName?: string }) => {
      const body: any = {};
      if (receiptData) { body.paymentReceiptData = receiptData; body.paymentReceiptName = receiptName; }
      const res = await apiRequest("POST", `/api/quotations/${id}/approve`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: t("تم اعتماد عرض السعر وإنشاء العقد بنجاح", "Quotation approved and contract created") });
      setApproveDialogOpen(false);
      setApproveReceiptFile(null);
      setApproveReceiptPreview(null);
      setLocation("/quotations");
    },
    onError: () => {
      toast({ title: t("حدث خطأ أثناء الاعتماد", "Error during approval"), variant: "destructive" });
    },
  });

  const handleApproveFromBuilder = () => {
    if (!savedQuotationId) return;
    if (approveReceiptFile && approveReceiptPreview) {
      approveFromBuilderMutation.mutate({ id: savedQuotationId, receiptData: approveReceiptPreview, receiptName: approveReceiptFile.name });
    } else {
      approveFromBuilderMutation.mutate({ id: savedQuotationId });
    }
  };

  const handleSubmit = (status: "draft" | "sent") => {
    if (!customerId) {
      toast({ title: t("يجب اختيار العميل", "Customer is required"), variant: "destructive" });
      return;
    }
    if (quotationMode === "summary") {
      if (!summaryDescription.trim()) {
        toast({ title: t("يجب إدخال وصف المنتج", "Product description is required"), variant: "destructive" });
        return;
      }
      if (summaryPriceBeforeVat <= 0) {
        toast({ title: t("يجب إدخال السعر الإجمالي", "Total price is required"), variant: "destructive" });
        return;
      }
    } else {
      if (items.length === 0) {
        toast({ title: t("أضف بنداً واحداً على الأقل", "Add at least one item"), variant: "destructive" });
        return;
      }
      const zeroPricedItems = items.filter(i => (i.unitPrice === 0 || !i.unitPrice) && (i.useAdeko || i.productId));
      if (zeroPricedItems.length > 0) {
        toast({
          title: t(`${zeroPricedItems.length} بند بدون سعر`, `${zeroPricedItems.length} item(s) with no price`),
          description: t("أدخل سعر الوحدة لجميع المنتجات قبل الحفظ", "Enter unit price for all products before saving"),
          variant: "destructive",
        });
        return;
      }
    }
    saveMutation.mutate(status);
  };

  const handleOpenSendDialog = () => {
    if (!savedQuotationId) return;
    const initialAttachments = new Set<number>(
      surveyDesignFiles.filter((f: any) => f.attach_to_quote).map((f: any) => f.id)
    );
    setSelectedAttachments(initialAttachments);
    setSendDialogOpen(true);
  };

  const handleSendOption = async (option: "portal" | "pdf" | "both") => {
    if (!savedQuotationId) return;
    if (surveyDesignFiles.length > 0 && preselectedSurveyId) {
      // Always sync ALL files (not just deltas) to ensure quotation.attachedDesignFiles is authoritative
      for (const f of surveyDesignFiles) {
        const shouldAttach = selectedAttachments.has(f.id);
        try {
          await apiRequest("PATCH", `/api/site-surveys/${preselectedSurveyId}/design-files/${f.id}`, { attachToQuote: shouldAttach, quotationId: savedQuotationId });
        } catch (err) {
          console.error("[send] Failed to update attachment:", f.id, err);
        }
      }
    }
    if (option === "portal" || option === "both") {
      await sendToCustomerMutation.mutateAsync(savedQuotationId);
    }
    if (option === "pdf" || option === "both") {
      const pdfUrl = `/quotations/${savedQuotationId}/view?print=1`;
      window.open(pdfUrl, "_blank");
    }
    setSendDialogOpen(false);
  };

  const filteredAdeko = useMemo(() => {
    if (!adekoSearch.trim()) return adekoProducts.slice(0, 60);
    const q = adekoSearch.toLowerCase();
    return adekoProducts.filter((p: any) =>
      p.nameAr?.toLowerCase().includes(q) ||
      p.nameEn?.toLowerCase().includes(q) ||
      p.code?.toLowerCase().includes(q)
    ).slice(0, 60);
  }, [adekoProducts, adekoSearch]);

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/quotations")} data-testid="button-back">
          <BackIcon className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-builder-title">
            {preselectedQuotationId
              ? t("تعديل عرض السعر", "Edit Quotation")
              : t("إنشاء عرض سعر", "Create Quotation")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {preselectedQuotationId
              ? t("تعديل وتحديث بنود عرض السعر", "Modify and update quotation items")
              : t("أنشئ عرض سعر جديد مع التسعير التلقائي", "Create a new quotation with automatic pricing")}
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("اختيار العميل", "Select Customer")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger data-testid="select-customer">
                <SelectValue placeholder={t("اختر العميل", "Select customer")} />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.fullName} - {c.phone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card data-testid="card-quotation-mode">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">{t("وضع عرض السعر:", "Quotation Mode:")}</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={quotationMode === "detailed" ? "default" : "outline"}
                  onClick={() => setQuotationMode("detailed")}
                  className="gap-1.5"
                  data-testid="button-mode-detailed"
                >
                  <LayoutList className="w-3.5 h-3.5" />
                  {t("تفصيلي", "Detailed")}
                </Button>
                <Button
                  size="sm"
                  variant={quotationMode === "summary" ? "default" : "outline"}
                  onClick={() => setQuotationMode("summary")}
                  className="gap-1.5"
                  data-testid="button-mode-summary"
                >
                  <List className="w-3.5 h-3.5" />
                  {t("إجمالي", "Summary")}
                </Button>
              </div>
              <span className="text-xs text-muted-foreground">
                {quotationMode === "summary"
                  ? t("بند واحد فقط — مثال: مطبخ عصري + السعر الإجمالي", "Single item — e.g. Modern Kitchen + total price")
                  : t("بنود متعددة بالتفاصيل الكاملة", "Multiple items with full details")}
              </span>
            </div>
          </CardContent>
        </Card>

        {quotationMode === "summary" && (
          <Card data-testid="card-summary-mode">
            <CardHeader>
              <CardTitle>{t("بيانات العرض الإجمالي", "Summary Quotation Details")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label className="text-sm font-medium">
                  {t("وصف المنتج / الخدمة", "Product / Service Description")}
                  <span className="text-red-500 ms-1">*</span>
                </Label>
                <Textarea
                  value={summaryDescription}
                  onChange={(e) => setSummaryDescription(e.target.value)}
                  placeholder={t("مثال: مطبخ عصري كامل بالتركيب والتوصيل", "e.g. Complete modern kitchen with installation and delivery")}
                  rows={3}
                  data-testid="input-summary-description"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">
                    {t("السعر قبل الضريبة (ريال)", "Price Before VAT (SAR)")}
                    <span className="text-red-500 ms-1">*</span>
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={summaryPriceBeforeVat || ""}
                    onChange={(e) => setSummaryPriceBeforeVat(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    data-testid="input-summary-price"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium">{t("ضريبة القيمة المضافة (15%)", "VAT (15%)")}</Label>
                  <div className="h-9 flex items-center px-3 border rounded-md bg-muted/30 text-sm font-semibold text-primary">
                    {(summaryPriceBeforeVat * 0.15).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR
                  </div>
                </div>
              </div>
              <div className="flex justify-between items-center p-3 bg-primary/5 rounded-lg border border-primary/20">
                <span className="font-bold text-sm">{t("الإجمالي شامل الضريبة:", "Total incl. VAT:")}</span>
                <span className="font-bold text-lg text-primary" data-testid="text-summary-total">
                  {(summaryPriceBeforeVat * 1.15).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {preselectedSurveyId && surveyDesignFiles.length > 0 && (
          <Card className="border-blue-200 dark:border-blue-800" dir={isRTL ? "rtl" : "ltr"} data-testid="card-survey-design-files">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <CardTitle className={`text-base flex items-center gap-2 ${isRTL ? "text-right" : "text-left"}`}>
                <Paperclip className="w-4 h-4 text-blue-600 shrink-0" />
                {t("مخططات الزيارة الميدانية", "Site Survey Plans")}
                <Badge variant="secondary" className="text-xs shrink-0">
                  {surveyDesignFiles.length} {t("ملف", "file(s)")}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {surveyDesignFiles.map((f: any) => (
                <div key={f.id} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/20" data-testid={`survey-file-row-${f.id}`}>
                  <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                  <span className={`flex-1 text-sm truncate min-w-0 ${isRTL ? "text-right" : "text-left"}`}>{f.file_name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {f.file_size ? `${(f.file_size / 1024).toFixed(0)} KB` : ""}
                  </span>
                  <button
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors shrink-0 ${f.attach_to_quote ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 border-green-300 dark:border-green-700" : "bg-muted text-muted-foreground border-border hover:border-primary"}`}
                    onClick={async () => {
                      try {
                        const qid = savedQuotationId || (preselectedQuotationId ? parseInt(preselectedQuotationId) : null);
                        await fetch(`/api/site-surveys/${preselectedSurveyId}/design-files/${f.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          credentials: "include",
                          body: JSON.stringify({ attachToQuote: !f.attach_to_quote, ...(qid ? { quotationId: qid } : {}) }),
                        });
                        refetchDesignFiles();
                      } catch {}
                    }}
                    data-testid={`button-attach-file-${f.id}`}
                  >
                    {f.attach_to_quote ? <>{t("✓ مرفق", "✓ Attached")}</> : t("إرفاق مع العرض", "Attach to Quote")}
                  </button>
                </div>
              ))}
              <p className={`text-xs text-muted-foreground ${isRTL ? "text-right" : "text-left"}`}>
                {t("الملفات المفعل إرفاقها ستظهر للعميل في بوابته", "Files marked as attached will appear in the customer portal")}
              </p>
            </CardContent>
          </Card>
        )}

        {completedDesign && (
          <Card className="border-green-200 dark:border-green-800" dir={isRTL ? "rtl" : "ltr"} data-testid="card-designer-attachments">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <CardTitle className={`text-base flex items-center gap-2 ${isRTL ? "text-right" : "text-left"}`}>
                <Paperclip className="w-4 h-4 text-green-600 shrink-0" />
                {t("مرفقات المصمم", "Designer Attachments")}
                <Badge variant="secondary" className="text-xs shrink-0">
                  {t("مكتمل", "Completed")}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {completedDesign.sketchImage && (
                <div className="space-y-1">
                  <p className={`text-sm font-medium flex items-center gap-1 ${isRTL ? "text-right" : "text-left"}`}>
                    <Image className="w-3 h-3 shrink-0" />
                    {t("رسم التصميم", "Design Sketch")}
                  </p>
                  <div className="border rounded-md overflow-hidden max-w-md">
                    <img src={completedDesign.sketchImage} alt="Design Sketch" className="w-full h-auto" data-testid="img-design-sketch" />
                  </div>
                </div>
              )}
              {completedDesign.designFiles && completedDesign.designFiles.length > 0 && (
                <div className="space-y-1">
                  <p className={`text-sm font-medium flex items-center gap-1 ${isRTL ? "text-right" : "text-left"}`}>
                    <FileText className="w-3 h-3 shrink-0" />
                    {t("ملفات التصميم", "Design Files")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {completedDesign.designFiles.map((file: string, idx: number) => (
                      <a
                        key={idx}
                        href={file}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary underline"
                        data-testid={`link-design-file-${idx}`}
                      >
                        {t(`ملف ${idx + 1}`, `File ${idx + 1}`)}
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {completedDesign.measurements != null && (
                <div className="space-y-1">
                  <p className={`text-sm font-medium ${isRTL ? "text-right" : "text-left"}`}>{t("القياسات", "Measurements")}</p>
                  <pre className="text-xs bg-muted p-2 rounded-md overflow-x-auto" dir="ltr" data-testid="text-measurements">
                    {String(typeof completedDesign.measurements === "string" ? completedDesign.measurements : JSON.stringify(completedDesign.measurements, null, 2))}
                  </pre>
                </div>
              )}
              {completedDesign.notes && (
                <div className="space-y-1">
                  <p className={`text-sm font-medium ${isRTL ? "text-right" : "text-left"}`}>{t("ملاحظات المصمم", "Designer Notes")}</p>
                  <p className={`text-sm text-muted-foreground ${isRTL ? "text-right" : "text-left"}`} data-testid="text-designer-notes">{completedDesign.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {quotationMode === "detailed" && <Card>
          <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
            <CardTitle>{t("البنود", "Line Items")}</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={addProductItem} data-testid="button-add-product-item">
                <Package className="w-3 h-3 me-1" /> {t("منتج Adeko", "Adeko Product")}
              </Button>
              <Button size="sm" onClick={addAreaItem} data-testid="button-add-item">
                <Ruler className="w-3 h-3 me-1" /> {t("تسعير بالمتر", "By m²")}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-sm text-muted-foreground" data-testid="text-no-items">
                  {t("لم تُضف أي بنود بعد — استخدم الأزرار أعلاه", "No items yet — use the buttons above")}
                </p>
              </div>
            ) : (
              items.map((item, index) => (
                <div key={item.id} className="p-4 border rounded-lg space-y-3" data-testid={`item-${index}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{t(`بند ${index + 1}`, `Item ${index + 1}`)}</span>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant={item.useAdeko ? "default" : "outline"}
                          className="h-6 text-[10px] px-2"
                          onClick={() => updateItem(item.id, "useAdeko", true)}
                          data-testid={`button-adeko-mode-${index}`}
                        >
                          {t("كتالوج أديكو", "Adeko Catalog")}
                        </Button>
                        <Button
                          size="sm"
                          variant={!item.useAdeko ? "default" : "outline"}
                          className="h-6 text-[10px] px-2"
                          onClick={() => updateItem(item.id, "useAdeko", false)}
                          data-testid={`button-manual-mode-${index}`}
                        >
                          {t("يدوي", "Manual")}
                        </Button>
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" className="text-destructive h-7 w-7" onClick={() => removeItem(item.id)} data-testid={`button-remove-item-${index}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {item.useAdeko ? (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label className="text-xs">{t("البحث في كتالوج أديكو", "Search Adeko Catalog")}</Label>
                        <div className="relative">
                          <Search className="absolute start-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                          <Input
                            className="ps-8 h-9 text-sm"
                            placeholder={t("ابحث بالاسم أو الكود...", "Search by name or code...")}
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            data-testid={`input-product-search-${index}`}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t("المنتج", "Product")}</Label>
                        <Select
                          value={item.productId ? String(item.productId) : ""}
                          onValueChange={(v) => updateItem(item.id, "productId", v)}
                        >
                          <SelectTrigger data-testid={`select-adeko-product-${index}`}>
                            <SelectValue placeholder={t("اختر منتج من الكتالوج", "Select catalog product")} />
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            {filteredAdekoProducts.map((p: any) => (
                              <SelectItem key={p.id} value={String(p.id)}>
                                <span className="flex items-center gap-2">
                                  <span className="font-mono text-[10px] bg-muted px-1 rounded">{p.code}</span>
                                  <span className="truncate">{t(p.descriptionAr || p.code, p.descriptionEn || p.code)}</span>
                                  <span className="text-muted-foreground text-[10px]">{parseFloat(p.priceBeforeVat || 0).toLocaleString()} SAR</span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {item.productId && (
                        <div className="bg-muted/30 rounded-md p-2.5 text-xs space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">{t("الكود", "Code")}</span>
                            <span className="font-mono">{item.code}</span>
                          </div>
                          {(item.dimensions.w > 0 || item.dimensions.h > 0) && (
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">{t("الأبعاد", "Dimensions")}</span>
                              <span dir="ltr">{item.dimensions.w} × {item.dimensions.h} × {item.dimensions.d} cm</span>
                            </div>
                          )}
                        </div>
                      )}

                      {item.unitPrice === 0 && (
                        <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                          <span className="text-base leading-none">⚠</span>
                          <span className="font-medium">{t("أدخل سعر الوحدة — جميع منتجات Adeko تحتاج سعراً يدوياً", "Enter unit price — all Adeko products require manual pricing")}</span>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className={`text-xs font-semibold ${item.unitPrice === 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                            {t("سعر الوحدة (ريال)", "Unit Price (SAR)")}
                            {item.unitPrice === 0 && <span className="ms-1 text-red-500">*</span>}
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitPrice || ""}
                            onChange={(e) => updateItem(item.id, "unitPrice", e.target.value)}
                            className={`h-9 text-sm font-semibold ${item.unitPrice === 0 ? "border-amber-400 dark:border-amber-600 focus:ring-amber-400 bg-amber-50/50 dark:bg-amber-950/20" : "border-green-400 dark:border-green-700"}`}
                            placeholder={t("أدخل السعر...", "Enter price...")}
                            data-testid={`input-unit-price-${index}`}
                            autoFocus={item.unitPrice === 0 && !!item.productId}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("الكمية", "Quantity")}</Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(item.id, "quantity", e.target.value)}
                            className="h-9 text-sm"
                            data-testid={`input-quantity-${index}`}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">{t("نوع الخشب", "Wood Type")}</Label>
                        <Select
                          value={item.woodType}
                          onValueChange={(v) => updateItem(item.id, "woodType", v)}
                        >
                          <SelectTrigger data-testid={`select-wood-${index}`}>
                            <SelectValue placeholder={t("اختر", "Select")} />
                          </SelectTrigger>
                          <SelectContent>
                            {woodTypes.map((wt) => (
                              <SelectItem key={wt.id} value={String(wt.id)}>
                                {t(wt.nameAr, wt.nameEn)} - {parseFloat(wt.pricePerMeter).toLocaleString()} SAR/م²
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {item.productType === "door" && (
                        <div className="space-y-1">
                          <Label className="text-xs">{t("نوع الباب", "Door Type")}</Label>
                          <Select value={item.doorType} onValueChange={(v) => updateItem(item.id, "doorType", v)}>
                            <SelectTrigger data-testid={`select-door-${index}`}>
                              <SelectValue placeholder={t("اختر", "Select")} />
                            </SelectTrigger>
                            <SelectContent>
                              {doorTypes.map((dt) => (
                                <SelectItem key={dt.id} value={String(dt.id)}>
                                  {t(dt.nameAr, dt.nameEn)} - {parseFloat(dt.pricePerMeter).toLocaleString()} SAR/م²
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div className="space-y-1">
                        <Label className="text-xs">{t("المساحة (م²)", "Area (m²)")}</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.area || ""}
                          onChange={(e) => updateItem(item.id, "area", parseFloat(e.target.value) || 0)}
                          data-testid={`input-area-${index}`}
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">{t("الكمية", "Quantity")}</Label>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.id, "quantity", e.target.value)}
                          className="h-9"
                          data-testid={`input-quantity-manual-${index}`}
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">{t("سعر/م² (ريال)", "Price/m² (SAR)")}</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.pricePerMeter || ""}
                          onChange={(e) => updateItem(item.id, "pricePerMeter", parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          data-testid={`input-price-per-meter-${index}`}
                        />
                      </div>

                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs">{t("وصف إضافي", "Description")}</Label>
                        <Input
                          value={item.description}
                          onChange={(e) => updateItem(item.id, "description", e.target.value)}
                          placeholder={t("اختياري", "Optional")}
                          data-testid={`input-description-${index}`}
                        />
                      </div>
                    </div>
                  )}

                  <div className="border-t pt-2">
                    <button
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                      onClick={() => updateItem(item.id, "showOptions", !item.showOptions)}
                      data-testid={`button-toggle-options-${index}`}
                    >
                      <Settings2 className="w-3 h-3" />
                      {t("خيارات المنتج", "Product Options")}
                      {item.optionsCost > 0 && (
                        <Badge variant="secondary" className="text-[9px] h-4 px-1">+{item.optionsCost.toLocaleString()} SAR</Badge>
                      )}
                      {item.showOptions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>

                    {item.showOptions && pricingOptions && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">{t("نوع الدرج", "Drawer Type")}</Label>
                          <Select value={item.options.drawerType} onValueChange={(v) => updateItemOption(item.id, "drawerType", v)}>
                            <SelectTrigger className="h-8 text-xs" data-testid={`select-drawer-${index}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {pricingOptions.drawerType.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {t(opt.labelAr, opt.labelEn)} {opt.price > 0 ? `(+${opt.price})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">{t("نوع المفصلة", "Hinge Type")}</Label>
                          <Select value={item.options.hingeType} onValueChange={(v) => updateItemOption(item.id, "hingeType", v)}>
                            <SelectTrigger className="h-8 text-xs" data-testid={`select-hinge-${index}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {pricingOptions.hingeType.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {t(opt.labelAr, opt.labelEn)} {opt.price > 0 ? `(+${opt.price})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">{t("آلية الرفع", "Lift Mechanism")}</Label>
                          <Select value={item.options.liftMechanism} onValueChange={(v) => updateItemOption(item.id, "liftMechanism", v)}>
                            <SelectTrigger className="h-8 text-xs" data-testid={`select-lift-${index}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {pricingOptions.liftMechanism.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {t(opt.labelAr, opt.labelEn)} {opt.price > 0 ? `(+${opt.price})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t text-sm">
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {item.useAdeko ? (
                        <span>{t("سعر الوحدة:", "Unit:")} {item.unitPrice.toLocaleString()} SAR</span>
                      ) : (
                        <span>{t("السعر/م²:", "Price/m²:")} {item.pricePerMeter.toLocaleString()} SAR</span>
                      )}
                      {item.optionsCost > 0 && (
                        <span className="ms-2 text-amber-600">+ {t("خيارات:", "Options:")} {item.optionsCost.toLocaleString()} SAR</span>
                      )}
                      {(item.quantity > 1 || item.qty > 1) && <span className="ms-2">× {item.quantity || item.qty}</span>}
                    </div>
                    <span className="font-bold text-primary" data-testid={`text-item-total-${index}`}>
                      {item.total.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>}

        {(items.length > 0 || quotationMode === "summary") && (
          <>
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("نوع الخصم", "Discount Type")}</Label>
                    <Select value={discountType} onValueChange={(v: any) => setDiscountType(v)}>
                      <SelectTrigger className="h-9" data-testid="select-discount-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">{t("نسبة %", "Percentage %")}</SelectItem>
                        <SelectItem value="fixed">{t("مبلغ ثابت", "Fixed Amount")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {discountType === "percent" ? t("نسبة الخصم %", "Discount %") : t("مبلغ الخصم (ريال)", "Discount (SAR)")}
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      max={discountType === "percent" ? 100 : undefined}
                      value={discount || ""}
                      onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                      data-testid="input-discount"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("فترة التسليم (أيام)", "Delivery (days)")}</Label>
                    <Input
                      type="number"
                      min="1"
                      value={deliveryDays || ""}
                      onChange={(e) => setDeliveryDays(parseInt(e.target.value) || null)}
                      placeholder={t("مثال: 30", "e.g. 30")}
                      data-testid="input-delivery-days"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("ملاحظات", "Notes")}</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} data-testid="input-notes" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    {t("صالح حتى (تاريخ الانتهاء)", "Valid Until (Expiry Date)")}
                    <span className="text-muted-foreground font-normal">— {t("30 يوماً افتراضياً", "default 30 days")}</span>
                  </Label>
                  <Input
                    type="date"
                    value={validUntilDate}
                    onChange={(e) => setValidUntilDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    data-testid="input-valid-until"
                  />
                </div>
                <div className="space-y-2 pt-1 border-t">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5" />
                    {t("مرفق عرض السعر (اختياري)", "Quotation Attachment (optional)")}
                  </Label>
                  {attachmentFile ? (
                    <div className="flex items-center gap-2 bg-muted/50 rounded p-2">
                      <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      <span className="text-xs flex-1 truncate">{attachmentFile.name}</span>
                      <Button
                        variant="ghost" size="icon" className="h-6 w-6"
                        onClick={() => setAttachmentFile(null)}
                        data-testid="button-remove-attachment"
                      >
                        <XIcon className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 border-2 border-dashed rounded-lg p-3 cursor-pointer hover:bg-muted/30 transition-colors" data-testid="label-upload-attachment">
                      <Upload className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{t("اضغط لرفع ملف PDF أو صورة", "Click to upload PDF or image")}</span>
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            const result = ev.target?.result as string;
                            setAttachmentFile({ data: result.split(",")[1], name: file.name, mime: file.type });
                          };
                          reader.readAsDataURL(file);
                        }}
                        data-testid="input-attachment-file"
                      />
                    </label>
                  )}
                  {attachmentFile && (
                    <div className="flex items-center gap-2">
                      <Switch
                        id="show-attach"
                        checked={showAttachmentToCustomer}
                        onCheckedChange={setShowAttachmentToCustomer}
                        data-testid="switch-show-attachment"
                      />
                      <Label htmlFor="show-attach" className="text-xs cursor-pointer">
                        {t("إظهار المرفق للعميل في البوابة", "Show attachment to customer in portal")}
                      </Label>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Calculator className="w-5 h-5 text-primary" />
                  <span className="font-bold">{t("ملخص التسعير", "Pricing Summary")}</span>
                </div>
                <div className="space-y-2 text-sm">
                  {totals.totalArea > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("إجمالي المساحة", "Total Area")}</span>
                      <span>{totals.totalArea.toFixed(2)} {t("م²", "m²")}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("عدد البنود", "Items Count")}</span>
                    <span>{items.length} {t("بند", "items")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("المجموع قبل الخصم", "Subtotal")}</span>
                    <span>{totals.subtotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR</span>
                  </div>
                  {totals.discountAmount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>{t("الخصم", "Discount")} {discountType === "percent" ? `(${discount}%)` : ""}</span>
                      <span>-{totals.discountAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("بعد الخصم", "After Discount")}</span>
                    <span>{totals.afterDiscount.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("ضريبة القيمة المضافة (15%)", "VAT (15%)")}</span>
                    <span>{totals.vatAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold pt-2 border-t">
                    <span>{t("الإجمالي النهائي", "Final Total")}</span>
                    <span className="text-primary" data-testid="text-final-total">
                      {totals.finalPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {savedQuotationId && savedQuotationStatus === "draft" ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                  <Save className="w-3.5 h-3.5 text-green-600" />
                  <span>{t(`تم الحفظ كمسودة — رقم عرض السعر: #${savedQuotationId}`, `Saved as draft — Quotation #${savedQuotationId}`)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setLocation(`/quotations/${savedQuotationId}/view`)}
                    data-testid="button-preview-quotation"
                  >
                    <Eye className="w-4 h-4 me-1.5" />
                    {t("معاينة / طباعة", "Preview / Print")}
                  </Button>
                  <Button
                    onClick={handleOpenSendDialog}
                    disabled={sendToCustomerMutation.isPending}
                    data-testid="button-send-to-customer"
                  >
                    {sendToCustomerMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-1.5" /> : (
                      <><Send className="w-4 h-4 me-1.5" />{t("إرسال للعميل", "Send to Customer")}</>
                    )}
                  </Button>
                </div>
                {user?.role === "sales" && totals.finalPrice > 0 && (
                  <Button
                    variant="default"
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => setApproveDialogOpen(true)}
                    disabled={approveFromBuilderMutation.isPending}
                    data-testid="button-approve-inperson"
                  >
                    <Check className="w-4 h-4 me-1.5" />
                    {t("اعتماد بالحضور الشخصي", "Approve In-Person")}
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setLocation("/quotations")}
                  data-testid="button-back-to-quotations"
                >
                  {t("الرجوع لعروض الأسعار", "Back to Quotations")}
                </Button>
              </div>
            ) : (
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => handleSubmit("draft")}
                  disabled={saveMutation.isPending}
                  data-testid="button-save-draft"
                >
                  {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <><Save className="w-4 h-4 me-1.5" />{t("حفظ كمسودة", "Save as Draft")}</>
                  )}
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    pendingSendAfterSave.current = true;
                    handleSubmit("draft");
                  }}
                  disabled={saveMutation.isPending}
                  data-testid="button-send-quotation"
                >
                  {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <><Send className="w-4 h-4 me-1.5" />{t("حفظ وإرسال", "Save & Send")}</>
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={!!adekoDialog} onOpenChange={(o) => { if (!o) { setAdekoDialog(null); setAdekoSearch(""); } }}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col" data-testid="dialog-adeko-picker">
          <DialogHeader>
            <DialogTitle>{t("اختيار منتج Adeko", "Select Adeko Product")}</DialogTitle>
          </DialogHeader>
          <div className="relative mb-3">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="ps-9"
              placeholder={t("ابحث بالاسم أو الكود...", "Search by name or code...")}
              value={adekoSearch}
              onChange={(e) => setAdekoSearch(e.target.value)}
              autoFocus
              data-testid="input-adeko-search"
            />
          </div>
          <div className="overflow-y-auto flex-1 space-y-1">
            {filteredAdeko.length === 0 ? (
              <p className="text-center py-6 text-sm text-muted-foreground">{t("لا توجد نتائج", "No results")}</p>
            ) : (
              filteredAdeko.map((p: any) => (
                <button
                  key={p.id}
                  className="w-full text-start px-3 py-2.5 rounded-lg hover:bg-muted/60 transition-colors border border-transparent hover:border-border"
                  onClick={() => adekoDialog && selectAdekoProduct(adekoDialog, p)}
                  data-testid={`adeko-product-${p.id}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{lang === "ar" ? p.nameAr : p.nameEn}</p>
                      <p className="text-xs text-muted-foreground">{p.code} · {lang === "ar" ? p.groupNameAr : p.groupNameEn}</p>
                    </div>
                    {parseFloat(p.priceBeforeVat || "0") > 0 ? (
                      <span className="text-xs font-semibold text-primary shrink-0">
                        {parseFloat(p.priceBeforeVat).toLocaleString()} SAR
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground shrink-0">{t("السعر يدوي", "Manual price")}</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-send-options">
          <DialogHeader>
            <DialogTitle>{t("إرسال عرض السعر للعميل", "Send Quotation to Customer")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("اختر طريقة الإرسال:", "Choose how to send:")}
            </p>

            {surveyDesignFiles.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5" />
                  {t("المخططات المرفقة", "Attached Plans")}
                </p>
                <div className="space-y-1">
                  {surveyDesignFiles.map((f: any) => (
                    <label
                      key={f.id}
                      className="flex items-center gap-2 p-2 rounded-md border cursor-pointer hover:bg-muted/30"
                      data-testid={`label-attach-${f.id}`}
                    >
                      <CheckboxUI
                        checked={selectedAttachments.has(f.id)}
                        onCheckedChange={(checked) => {
                          const next = new Set(selectedAttachments);
                          if (checked) next.add(f.id);
                          else next.delete(f.id);
                          setSelectedAttachments(next);
                        }}
                        data-testid={`checkbox-attach-${f.id}`}
                      />
                      <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="text-sm truncate">{f.file_name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Button
                className="w-full justify-start gap-3"
                variant="outline"
                onClick={() => handleSendOption("portal")}
                disabled={sendToCustomerMutation.isPending}
                data-testid="button-send-portal"
              >
                <Globe className="w-4 h-4 text-blue-600" />
                <div className="text-start">
                  <div className="font-medium text-sm">{t("إرسال للبوابة الإلكترونية", "Send to Customer Portal")}</div>
                  <div className="text-xs text-muted-foreground">{t("يُحدّث الحالة إلى 'مرسل' ويُرسل إشعاراً", "Updates status to 'sent' and notifies customer")}</div>
                </div>
              </Button>
              <Button
                className="w-full justify-start gap-3"
                variant="outline"
                onClick={() => handleSendOption("pdf")}
                data-testid="button-send-pdf"
              >
                <Download className="w-4 h-4 text-green-600" />
                <div className="text-start">
                  <div className="font-medium text-sm">{t("تحميل / طباعة PDF", "Download / Print PDF")}</div>
                  <div className="text-xs text-muted-foreground">{t("فتح صفحة المعاينة للطباعة أو التحميل", "Open preview page for printing or downloading")}</div>
                </div>
              </Button>
              <Button
                className="w-full justify-start gap-3"
                onClick={() => handleSendOption("both")}
                disabled={sendToCustomerMutation.isPending}
                data-testid="button-send-both"
              >
                <Send className="w-4 h-4" />
                <div className="text-start">
                  <div className="font-medium text-sm">{t("كلاهما", "Both")}</div>
                  <div className="text-xs opacity-80">{t("إرسال للبوابة وتحميل PDF", "Send to portal and download PDF")}</div>
                </div>
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSendDialogOpen(false)} data-testid="button-close-send-dialog">
              {t("إلغاء", "Cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-approve-inperson">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="w-5 h-5 text-green-600" />
              {t("اعتماد عرض السعر بالحضور الشخصي", "Approve Quotation In-Person")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t(
                "يُستخدم هذا الاعتماد عندما يحضر العميل للمعرض ويوافق على عرض السعر ويسدد الدفعة الأولى نقداً أو عبر نقاط البيع أو حوالة بنكية.",
                "Use this when the customer visits the showroom and approves the quotation, paying the first installment in cash, POS, or bank transfer."
              )}
            </p>
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <Receipt className="w-4 h-4" />
                {t("وصل الدفع (اختياري)", "Payment Receipt (optional)")}
              </p>
              {approveReceiptPreview ? (
                <div className="relative rounded-md border overflow-hidden">
                  <img src={approveReceiptPreview} alt="receipt" className="w-full max-h-40 object-contain bg-muted/20" />
                  <button
                    className="absolute top-1 end-1 bg-background/80 rounded-full p-0.5 hover:bg-destructive hover:text-white transition-colors"
                    onClick={() => { setApproveReceiptFile(null); setApproveReceiptPreview(null); }}
                    data-testid="button-remove-receipt"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  className="w-full border-2 border-dashed rounded-md py-4 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  onClick={() => approveReceiptInputRef.current?.click()}
                  data-testid="button-upload-receipt"
                >
                  <Upload className="w-5 h-5" />
                  <span className="text-sm">{t("ارفع صورة الوصل", "Upload receipt image")}</span>
                </button>
              )}
              <input
                ref={approveReceiptInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setApproveReceiptFile(file);
                  const reader = new FileReader();
                  reader.onload = (ev) => setApproveReceiptPreview(ev.target?.result as string);
                  reader.readAsDataURL(file);
                }}
                data-testid="input-receipt-file"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setApproveDialogOpen(false)} data-testid="button-cancel-approve">
              {t("إلغاء", "Cancel")}
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleApproveFromBuilder}
              disabled={approveFromBuilderMutation.isPending}
              data-testid="button-confirm-approve"
            >
              {approveFromBuilderMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-1.5" /> : <Check className="w-4 h-4 me-1.5" />}
              {t("تأكيد الاعتماد", "Confirm Approval")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
