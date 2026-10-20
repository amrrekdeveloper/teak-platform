import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

type MedicalDocument = {
  id: number;
  kind: "leave" | "attendance";
  leaveId: number | null;
  recordId: number | null;
  name: string;
  createdAt: string;
};

type Props = { leaveId?: number; recordId?: number };

export function MedicalDocumentLinks({ leaveId, recordId }: Props) {
  const parameter = leaveId != null ? `leaveId=${leaveId}` : recordId != null ? `recordId=${recordId}` : "";
  const documents = useQuery<MedicalDocument[]>({
    queryKey: ["medical-documents", leaveId ?? null, recordId ?? null],
    enabled: !!parameter,
    queryFn: async () => (await apiRequest("GET", `/api/attendance/medical-documents?${parameter}`)).json(),
  });

  if (documents.isLoading) return <span className="text-xs text-muted-foreground">جارٍ تحميل المرفقات…</span>;
  if (documents.isError) return <span role="alert" className="text-xs text-destructive">تعذر تحميل المرفقات الطبية.</span>;
  if (!documents.data?.length) return <span className="text-xs text-muted-foreground">لا توجد مرفقات طبية.</span>;

  return <ul className="space-y-1 text-xs">
    {documents.data.map(item => <li key={item.id} className="min-w-0">
      <a className="underline underline-offset-2 break-words" href={`/api/attendance/medical-documents/${item.id}/download`} target="_blank" rel="noreferrer">
        {item.name || `مرفق طبي #${item.id}`}
      </a>
      <span className="ms-2 text-muted-foreground">{item.createdAt ? new Date(item.createdAt).toLocaleDateString("ar-SA") : ""}</span>
    </li>)}
  </ul>;
}
