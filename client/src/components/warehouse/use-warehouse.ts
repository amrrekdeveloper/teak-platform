import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Summary, Movement, Requisition, ReceiptOrder } from "./types";

const BASE = "/api/warehouse-center";
export const warehouseKeys = {
  summary: [BASE + "/summary"] as const,
  movements: [BASE + "/movements"] as const,
  requisitions: [BASE + "/requisitions"] as const,
  receipts: [BASE + "/receipts"] as const,
};

export function useWarehouseSummary() {
  return useQuery<Summary>({ queryKey: warehouseKeys.summary });
}

export function useWarehouseMovements(params: URLSearchParams) {
  return useQuery<{ rows: Movement[]; total: number; page: number }>({
    queryKey: [BASE + "/movements", params.toString()],
    queryFn: async () => (await apiRequest("GET", BASE + "/movements?" + params.toString())).json(),
  });
}

export function useWarehouseRequisitions() {
  return useQuery<{ rows: Requisition[] }>({ queryKey: warehouseKeys.requisitions, staleTime: 0, refetchOnWindowFocus: true });
}

export function useWarehouseReceipts() {
  return useQuery<{ rows: ReceiptOrder[] }>({
    queryKey: warehouseKeys.receipts,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
    queryFn: async () => {
      const data = await (await apiRequest("GET", BASE + "/receipts")).json();
      if (!data || !Array.isArray(data.rows) || data.rows.some((order: any) => !Array.isArray(order.items)))
        throw new Error("تعذر قراءة أوامر الاستلام؛ حدّث البيانات وأعد المحاولة");
      return data;
    },
  });
}
