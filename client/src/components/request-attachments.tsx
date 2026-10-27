import { useRef } from "react";
import { useMutation,useQuery,useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Paperclip,Loader2,Download } from "lucide-react";

export async function uploadRequestAttachment(kind:"leave"|"permission",id:number,file:File) {
  const form=new FormData();form.append("file",file);
  const response=await fetch(`/api/hr/requests/${kind}/${id}/attachments`,{method:"POST",credentials:"include",body:form});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.message||"تعذر رفع المرفق.");}
  return response.json();
}
export function RequestAttachments({kind,id}:{kind:"leave"|"permission";id:number}) {
  const {t}=useLanguage(),{toast}=useToast(),qc=useQueryClient(),input=useRef<HTMLInputElement>(null);
  const key=["/api/hr/requests",kind,id,"attachments"];
  const query=useQuery<{items:{id:string;name:string;size:number}[];canUpload:boolean}>({
    queryKey:key,queryFn:async()=>(await apiRequest("GET",`/api/hr/requests/${kind}/${id}/attachments`)).json(),retry:false,
  });
  const mutation=useMutation({mutationFn:(file:File)=>uploadRequestAttachment(kind,id,file),onSuccess:()=>{
    qc.invalidateQueries({queryKey:key});qc.invalidateQueries({queryKey:["/api/hr/requests",kind,id,"history"]});
    toast({title:t("تم إرفاق الملف","Attachment uploaded")});
  },onError:(e:Error)=>toast({title:e.message,variant:"destructive"})});
  return <section className="space-y-3 rounded-lg border p-4">
    <h3 className="flex items-center gap-2 font-semibold"><Paperclip size={16}/>{t("المرفقات","Attachments")}</h3>
    <p className="text-xs leading-5 text-muted-foreground">{t("ملفات خاصة بالموظف والموارد البشرية. PDF أو JPEG أو PNG، حتى 5 ميغابايت للملف. تحفظ المستندات المرسلة ولا تستبدل.","Private to the employee and HR. PDF, JPEG or PNG, up to 5 MB each. Submitted evidence is retained, not replaced.")}</p>
    {query.isLoading&&<Loader2 className="h-4 w-4 animate-spin"/>}
    {query.isError&&<p className="text-sm text-destructive">{t("تعذر عرض المرفقات أو لا تملك صلاحية الاطلاع عليها.","Attachments unavailable or you do not have access.")}</p>}
    {query.data?.items.map(file=><a key={file.id} href={`/api/hr/requests/${kind}/${id}/attachments/${file.id}`} className="flex min-h-10 items-center gap-2 rounded border p-2 text-sm underline underline-offset-4" target="_blank" rel="noreferrer"><Download size={15}/><span className="min-w-0 break-all">{file.name}</span><span className="ms-auto shrink-0 text-xs">{Math.ceil(file.size/1024)} KB</span></a>)}
    {query.data?.canUpload&&<>
      <input ref={input} className="sr-only" type="file" accept="application/pdf,image/jpeg,image/png" aria-label={t("اختر مرفقًا","Choose attachment")} onChange={event=>{
        const file=event.target.files?.[0];event.target.value="";if(!file)return;
        if(file.size>5242880){toast({title:t("حجم الملف يتجاوز 5 ميغابايت.","File exceeds 5 MB."),variant:"destructive"});return;}
        mutation.mutate(file);
      }}/>
      <Button type="button" variant="outline" disabled={mutation.isPending||(query.data.items.length>=5)} onClick={()=>input.current?.click()}>{mutation.isPending?<Loader2 size={16} className="me-2 animate-spin"/>:<Paperclip size={16} className="me-2"/>}{t("إرفاق ملف","Attach file")}</Button>
    </>}
  </section>;
}
