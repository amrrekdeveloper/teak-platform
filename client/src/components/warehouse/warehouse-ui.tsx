import { ReactNode } from "react";
import { AlertCircle, RefreshCw, Warehouse as WarehouseIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function WarehousePanel({ title, eyebrow, action, children }: { title: string; eyebrow?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>{eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-primary">{eyebrow}</p>}<h2 className="text-xl font-semibold tracking-tight">{title}</h2></div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function WarehouseError({ message, retry, label }: { message: string; retry: () => void; label: string }) {
  return <Card className="border-destructive/30 bg-destructive/5"><CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
    <div className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-5 w-5 text-destructive" /><div><p className="font-medium">{label}</p><p className="mt-1 break-words text-sm text-muted-foreground">{message}</p></div></div>
    <Button variant="outline" size="sm" onClick={retry}><RefreshCw className="me-2 h-4 w-4" />{label === "تعذر تحميل البيانات" ? "إعادة المحاولة" : "Retry"}</Button>
  </CardContent></Card>;
}

export function WarehouseEmpty({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-2xl border border-dashed border-border bg-card/60 px-5 py-12 text-center">
    <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><WarehouseIcon className="h-5 w-5" /></div>
    <h3 className="font-semibold">{title}</h3><p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{detail}</p>
  </div>;
}

export function WarehouseSkeleton() {
  return <div className="space-y-4" aria-label="Loading"><div className="h-32 animate-pulse rounded-2xl bg-muted" /><div className="grid gap-3 sm:grid-cols-2"><div className="h-28 animate-pulse rounded-xl bg-muted" /><div className="h-28 animate-pulse rounded-xl bg-muted" /></div><div className="h-48 animate-pulse rounded-2xl bg-muted" /></div>;
}
