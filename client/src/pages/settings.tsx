import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CompanySettings, User, ActivityLog, QuoteProductCategory } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Building2, Users, History, Save, Plus, Pencil, Shield, Tags, Trash2, Package, Search, Key, UserCheck, UserX, Clock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";

const roleLabels: Record<string, { ar: string; en: string }> = {
  owner: { ar: "المالك", en: "Owner" },
  assistant: { ar: "المساعد", en: "Assistant" },
  sales: { ar: "المبيعات", en: "Sales" },
  designer: { ar: "المصمم", en: "Designer" },
  production: { ar: "الإنتاج", en: "Production" },
  purchasing: { ar: "المشتريات", en: "Purchasing" },
  warehouse: { ar: "المستودع", en: "Warehouse" },
  accountant: { ar: "المحاسبة", en: "Accounting" },
  customer_service: { ar: "خدمة العملاء", en: "Customer Service" },
  delivery: { ar: "التوصيل", en: "Delivery" },
  installation: { ar: "التركيب", en: "Installation" },
  quality: { ar: "الجودة", en: "Quality" },
  hr: { ar: "الموارد البشرية", en: "HR" },
  it: { ar: "تقنية المعلومات", en: "IT" },
};

const allRoles = Object.keys(roleLabels);

const roleColors: Record<string, string> = {
  owner: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  assistant: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  sales: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  designer: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  production: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  purchasing: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  warehouse: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  accountant: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  customer_service: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
  delivery: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  installation: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  quality: "bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-300",
  hr: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-300",
  it: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300",
};

export default function SettingsPage({ initialTab }: { initialTab?: string }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [tab, setTab] = useState(initialTab || "company");

  const { data: settings, isLoading: loadingSettings } = useQuery<CompanySettings>({ queryKey: ["/api/company-settings"] });
  const { data: users = [], isLoading: loadingUsers } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: logs = [], isLoading: loadingLogs } = useQuery<ActivityLog[]>({
    queryKey: ["/api/activity-logs"],
    enabled: currentUser?.role === "owner" || currentUser?.role === "it" || currentUser?.role === "assistant",
  });

  const [companyForm, setCompanyForm] = useState<any>(null);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [newUserDialog, setNewUserDialog] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", password: "", fullNameAr: "", fullNameEn: "", role: "sales", phone: "", email: "", active: true });
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [adminNewPassword, setAdminNewPassword] = useState("");

  const settingsMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/company-settings", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/company-settings"] }); toast({ title: t("تم حفظ الإعدادات", "Settings saved") }); },
  });

  const createUserMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/users", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setNewUserDialog(false);
      setNewUser({ username: "", password: "", fullNameAr: "", fullNameEn: "", role: "sales", phone: "", email: "", active: true });
      toast({ title: t("تم إنشاء المستخدم", "User created") });
    },
    onError: () => { toast({ title: t("حدث خطأ", "Error"), variant: "destructive" }); },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/users/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setEditUser(null);
      toast({ title: t("تم تحديث المستخدم", "User updated") });
    },
    onError: async (err: any) => {
      try {
        const r = await err.json?.();
        toast({ title: r?.message || t("حدث خطأ في تحديث المستخدم", "Error updating user"), variant: "destructive" });
      } catch {
        toast({ title: t("حدث خطأ في تحديث المستخدم", "Error updating user"), variant: "destructive" });
      }
    },
  });

  const adminResetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) => apiRequest("PATCH", `/api/users/${id}`, { password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setResetPasswordUser(null);
      setAdminNewPassword("");
      toast({ title: t("تم تغيير كلمة المرور", "Password changed") });
    },
    onError: () => toast({ title: t("حدث خطأ", "Error"), variant: "destructive" }),
  });

  const toggleActiveMutation2 = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => apiRequest("PATCH", `/api/users/${id}`, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: t("تم التحديث", "Updated") });
    },
    onError: () => toast({ title: t("حدث خطأ", "Error"), variant: "destructive" }),
  });

  useEffect(() => {
    if (!companyForm && settings) {
      setCompanyForm({ ...settings });
    }
  }, [settings]);

  const isOwnerOrIT = currentUser?.role === "owner" || currentUser?.role === "it" || currentUser?.role === "assistant";

  const filteredUsers = users.filter(u => {
    const q = userSearch.toLowerCase();
    const matchesSearch = !q || u.fullNameAr.toLowerCase().includes(q) || u.fullNameEn.toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? u.active : !u.active);
    return matchesSearch && matchesRole && matchesStatus;
  });

  if (loadingSettings || loadingUsers) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold" data-testid="text-settings-title">{t("الإعدادات", "Settings")}</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="company" data-testid="tab-company">
            <Building2 className="w-4 h-4 me-1.5" />{t("الشركة", "Company")}
          </TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">
            <Users className="w-4 h-4 me-1.5" />{t("المستخدمون", "Users")}
          </TabsTrigger>
          {isOwnerOrIT && (
            <TabsTrigger value="logs" data-testid="tab-logs">
              <History className="w-4 h-4 me-1.5" />{t("السجل", "Activity Log")}
            </TabsTrigger>
          )}
          {isOwnerOrIT && (
            <TabsTrigger value="reset-requests" data-testid="tab-reset-requests">
              <Key className="w-4 h-4 me-1.5" />{t("طلبات كلمة المرور", "Password Requests")}
            </TabsTrigger>
          )}
          {isOwnerOrIT && (
            <TabsTrigger value="categories" data-testid="tab-categories">
              <Tags className="w-4 h-4 me-1.5" />{t("تصنيفات المنتجات", "Product Categories")}
            </TabsTrigger>
          )}
        </TabsList>

        {isOwnerOrIT && (
          <div className="mb-4">
            <Link href="/settings/products">
              <Card className="cursor-pointer hover:bg-muted/50 transition-colors border-dashed" data-testid="link-adeko-products">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Package className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">{t("مكتبة منتجات TEAK (Adeko)", "TEAK Product Library (Adeko)")}</p>
                    <p className="text-xs text-muted-foreground">{t("252 منتج - إدارة الأسعار والمقاسات", "252 products - Manage prices & dimensions")}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        )}

        <TabsContent value="company" className="space-y-4">
          {companyForm && (
            <Card>
              <CardHeader><CardTitle>{t("معلومات الشركة", "Company Information")}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>{t("الاسم بالعربي", "Name (AR)")}</Label>
                    <Input value={companyForm.nameAr || ""} onChange={e => setCompanyForm({ ...companyForm, nameAr: e.target.value })} data-testid="input-company-name-ar" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("الاسم بالإنجليزي", "Name (EN)")}</Label>
                    <Input value={companyForm.nameEn || ""} onChange={e => setCompanyForm({ ...companyForm, nameEn: e.target.value })} data-testid="input-company-name-en" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("الرقم الضريبي", "VAT Number")}</Label>
                    <Input value={companyForm.vatNumber || ""} onChange={e => setCompanyForm({ ...companyForm, vatNumber: e.target.value })} data-testid="input-vat-number" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("الهاتف", "Phone")}</Label>
                    <Input value={companyForm.phone || ""} onChange={e => setCompanyForm({ ...companyForm, phone: e.target.value })} data-testid="input-company-phone" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("البريد الإلكتروني", "Email")}</Label>
                    <Input value={companyForm.email || ""} onChange={e => setCompanyForm({ ...companyForm, email: e.target.value })} data-testid="input-company-email" />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>{t("العنوان", "Address")}</Label>
                    <Input value={companyForm.address || ""} onChange={e => setCompanyForm({ ...companyForm, address: e.target.value })} data-testid="input-company-address" />
                  </div>
                </div>
                <Button onClick={() => settingsMutation.mutate(companyForm)} disabled={settingsMutation.isPending} data-testid="button-save-settings">
                  {settingsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <Save className="w-4 h-4 me-2" />}
                  {t("حفظ", "Save")}
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-muted-foreground" />
              <Input value={userSearch} onChange={e => setUserSearch(e.target.value)}
                placeholder={t("بحث بالاسم أو اسم المستخدم...", "Search by name or username...")}
                className="ps-9 h-9" data-testid="input-user-search" />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[160px] h-9" data-testid="select-role-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("جميع الأدوار", "All Roles")}</SelectItem>
                {allRoles.map(r => <SelectItem key={r} value={r}>{t(roleLabels[r].ar, roleLabels[r].en)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-9" data-testid="select-status-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("جميع الحالات", "All Status")}</SelectItem>
                <SelectItem value="active">{t("نشط", "Active")}</SelectItem>
                <SelectItem value="inactive">{t("معطل", "Inactive")}</SelectItem>
              </SelectContent>
            </Select>
            {isOwnerOrIT && (
              <Dialog open={newUserDialog} onOpenChange={setNewUserDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" data-testid="button-new-user"><Plus className="w-4 h-4 me-1.5" />{t("مستخدم جديد", "New User")}</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{t("إنشاء مستخدم جديد", "Create New User")}</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><Label>{t("اسم المستخدم", "Username")} *</Label><Input value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} data-testid="input-new-username" /></div>
                      <div className="space-y-1"><Label>{t("كلمة المرور", "Password")} *</Label><Input type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} data-testid="input-new-password" /></div>
                      <div className="space-y-1"><Label>{t("الاسم بالعربي", "Name AR")} *</Label><Input value={newUser.fullNameAr} onChange={e => setNewUser({ ...newUser, fullNameAr: e.target.value })} data-testid="input-new-name-ar" /></div>
                      <div className="space-y-1"><Label>{t("الاسم بالإنجليزي", "Name EN")} *</Label><Input value={newUser.fullNameEn} onChange={e => setNewUser({ ...newUser, fullNameEn: e.target.value })} data-testid="input-new-name-en" /></div>
                    </div>
                    <div className="space-y-1">
                      <Label>{t("الدور", "Role")}</Label>
                      <Select value={newUser.role} onValueChange={v => setNewUser({ ...newUser, role: v })}>
                        <SelectTrigger data-testid="select-new-role"><SelectValue /></SelectTrigger>
                        <SelectContent>{allRoles.map(r => <SelectItem key={r} value={r}>{t(roleLabels[r].ar, roleLabels[r].en)}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><Label>{t("الهاتف", "Phone")}</Label><Input value={newUser.phone} onChange={e => setNewUser({ ...newUser, phone: e.target.value })} /></div>
                      <div className="space-y-1"><Label>{t("البريد", "Email")}</Label><Input value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} /></div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch checked={newUser.active} onCheckedChange={v => setNewUser({ ...newUser, active: v })} data-testid="switch-new-user-active" />
                      <Label>{t("مفعّل", "Active")}</Label>
                    </div>
                    <Button className="w-full" disabled={!newUser.username || !newUser.password || !newUser.fullNameAr || !newUser.fullNameEn || createUserMutation.isPending} onClick={() => createUserMutation.mutate(newUser)} data-testid="button-create-user">
                      {createUserMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("إنشاء", "Create")}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>

          <p className="text-xs text-muted-foreground" data-testid="text-users-count">
            {t(`${filteredUsers.length} مستخدم`, `${filteredUsers.length} users`)}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredUsers.map(u => (
              <Card key={u.id} className={`${u.active === false ? "opacity-60" : ""}`} data-testid={`card-user-${u.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${u.active === false ? "bg-muted" : "bg-primary/10"}`}>
                        <Shield className={`w-5 h-5 ${u.active === false ? "text-muted-foreground" : "text-primary"}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{t(u.fullNameAr, u.fullNameEn)}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground font-mono">@{u.username}</span>
                          <Badge variant="secondary" className={`text-[10px] ${roleColors[u.role] || ""}`}>{t(roleLabels[u.role]?.ar || u.role, roleLabels[u.role]?.en || u.role)}</Badge>
                          {u.active === false && (
                            <Badge variant="outline" className="text-[10px] border-destructive text-destructive">{t("معطّل", "Inactive")}</Badge>
                          )}
                        </div>
                        {(u.phone || u.email) && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                            {u.phone && u.phone}{u.phone && u.email && " | "}{u.email && u.email}
                          </p>
                        )}
                      </div>
                    </div>
                    {isOwnerOrIT && u.id !== currentUser?.id && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setResetPasswordUser(u); setAdminNewPassword(""); }} title={t("تغيير كلمة المرور", "Reset Password")} data-testid={`button-reset-password-${u.id}`}>
                          <Key className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => toggleActiveMutation2.mutate({ id: u.id, active: !(u.active !== false) })}
                          title={u.active === false ? t("تفعيل", "Activate") : t("تعطيل", "Deactivate")} data-testid={`button-toggle-active-${u.id}`}>
                          {u.active === false ? <UserCheck className="w-3.5 h-3.5 text-green-500" /> : <UserX className="w-3.5 h-3.5 text-destructive" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditUser(u)} data-testid={`button-edit-user-${u.id}`}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {isOwnerOrIT && (
          <TabsContent value="logs" className="space-y-4">
            {loadingLogs ? <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div> : (
              logs.length === 0 ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground">{t("لا توجد أنشطة مسجلة", "No activity logs")}</CardContent></Card>
              ) : (
                <div className="space-y-2">
                  {logs.map(log => (
                    <Card key={log.id} data-testid={`log-${log.id}`}>
                      <CardContent className="p-3 flex items-center justify-between text-sm">
                        <div className="min-w-0">
                          <p className="font-medium">{log.action} — {log.entity} #{log.entityId}</p>
                          <p className="text-xs text-muted-foreground">{t("مستخدم", "User")} #{log.userId} {log.ipAddress && `• ${log.ipAddress}`}</p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0 ms-3">
                          {log.createdAt && new Date(log.createdAt).toLocaleString(t("ar-SA", "en-US"))}
                        </span>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )
            )}
          </TabsContent>
        )}

        {isOwnerOrIT && (
          <TabsContent value="reset-requests" className="space-y-4">
            <ResetRequestsTab users={users} />
          </TabsContent>
        )}

        {isOwnerOrIT && (
          <TabsContent value="categories" className="space-y-4">
            <CategoriesTab />
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={!!editUser} onOpenChange={o => { if (!o) setEditUser(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("تعديل المستخدم", "Edit User")}</DialogTitle></DialogHeader>
          {editUser && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>{t("الاسم بالعربي", "Name AR")}</Label><Input value={editUser.fullNameAr} onChange={e => setEditUser({ ...editUser, fullNameAr: e.target.value })} /></div>
                <div className="space-y-1"><Label>{t("الاسم بالإنجليزي", "Name EN")}</Label><Input value={editUser.fullNameEn} onChange={e => setEditUser({ ...editUser, fullNameEn: e.target.value })} /></div>
              </div>
              <div className="space-y-1">
                <Label>{t("الدور", "Role")}</Label>
                <Select value={editUser.role} onValueChange={v => setEditUser({ ...editUser, role: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{allRoles.map(r => <SelectItem key={r} value={r}>{t(roleLabels[r].ar, roleLabels[r].en)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>{t("الهاتف", "Phone")}</Label><Input value={editUser.phone || ""} onChange={e => setEditUser({ ...editUser, phone: e.target.value })} /></div>
                <div className="space-y-1"><Label>{t("البريد", "Email")}</Label><Input value={editUser.email || ""} onChange={e => setEditUser({ ...editUser, email: e.target.value })} /></div>
              </div>
              <Button className="w-full" onClick={() => updateUserMutation.mutate({ id: editUser.id, data: { fullNameAr: editUser.fullNameAr, fullNameEn: editUser.fullNameEn, role: editUser.role, phone: editUser.phone, email: editUser.email } })} disabled={updateUserMutation.isPending}>
                {updateUserMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("حفظ التعديلات", "Save Changes")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetPasswordUser} onOpenChange={o => { if (!o) { setResetPasswordUser(null); setAdminNewPassword(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("تغيير كلمة المرور", "Reset Password")}</DialogTitle></DialogHeader>
          {resetPasswordUser && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t(`تغيير كلمة مرور المستخدم: ${resetPasswordUser.fullNameAr} (@${resetPasswordUser.username})`,
                   `Reset password for: ${resetPasswordUser.fullNameEn} (@${resetPasswordUser.username})`)}
              </p>
              <div className="space-y-1">
                <Label>{t("كلمة المرور الجديدة", "New Password")}</Label>
                <Input type="password" value={adminNewPassword} onChange={e => setAdminNewPassword(e.target.value)} data-testid="input-admin-new-password" />
              </div>
              <Button className="w-full" disabled={!adminNewPassword || adminNewPassword.length < 4 || adminResetPasswordMutation.isPending}
                onClick={() => adminResetPasswordMutation.mutate({ id: resetPasswordUser.id, password: adminNewPassword })} data-testid="button-admin-reset-password">
                {adminResetPasswordMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("تغيير كلمة المرور", "Reset Password")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ResetRequestsTab({ users }: { users: User[] }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [resolveId, setResolveId] = useState<number | null>(null);
  const [resolveUserId, setResolveUserId] = useState<number | null>(null);
  const [resolvePassword, setResolvePassword] = useState("");

  const { data: requests = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/users/reset-requests"] });

  const resolveMutation = useMutation({
    mutationFn: ({ id, newPassword }: { id: number; newPassword: string }) =>
      apiRequest("PATCH", `/api/users/reset-requests/${id}/resolve`, { newPassword }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/reset-requests"] });
      setResolveId(null);
      setResolvePassword("");
      toast({ title: t("تم تغيير كلمة المرور وحل الطلب", "Password reset and request resolved") });
    },
    onError: () => toast({ title: t("حدث خطأ", "Error"), variant: "destructive" }),
  });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const pendingRequests = requests.filter(r => r.status === "pending");
  const resolvedRequests = requests.filter(r => r.status === "resolved");

  const getUser = (userId: number) => users.find(u => u.id === userId);
  const getUserName = (userId: number) => {
    const u = getUser(userId);
    return u ? t(u.fullNameAr, u.fullNameEn) : `#${userId}`;
  };

  return (
    <>
      <h2 className="text-lg font-semibold" data-testid="text-reset-requests-title">
        {t("طلبات استعادة كلمة المرور", "Password Reset Requests")}
        {pendingRequests.length > 0 && (
          <Badge className="ms-2 bg-orange-500">{pendingRequests.length}</Badge>
        )}
      </h2>

      {requests.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t("لا توجد طلبات", "No requests")}</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {pendingRequests.map(req => {
            const reqUser = getUser(req.userId);
            return (
              <Card key={req.id} className="border-orange-300 dark:border-orange-700" data-testid={`card-reset-request-${req.id}`}>
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Clock className="w-5 h-5 text-orange-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold">{getUserName(req.userId)}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        {reqUser?.phone && <span dir="ltr">{reqUser.phone}</span>}
                        <span>{req.requestedAt && new Date(req.requestedAt).toLocaleString(t("ar-SA", "en-US"))}</span>
                      </div>
                    </div>
                    <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">{t("معلق", "Pending")}</Badge>
                  </div>
                  <Button size="sm" onClick={() => { setResolveId(req.id); setResolveUserId(req.userId); setResolvePassword(""); }} data-testid={`button-resolve-${req.id}`}>
                    <Key className="w-3.5 h-3.5 me-1.5" />{t("حل الطلب", "Resolve")}
                  </Button>
                </CardContent>
              </Card>
            );
          })}

          {resolvedRequests.length > 0 && (
            <>
              <h3 className="text-sm font-medium text-muted-foreground pt-4">{t("الطلبات المحلولة", "Resolved Requests")}</h3>
              {resolvedRequests.slice(0, 10).map(req => (
                <Card key={req.id} className="opacity-60" data-testid={`card-reset-resolved-${req.id}`}>
                  <CardContent className="p-3 flex items-center justify-between text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{getUserName(req.userId)}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("تم الحل بواسطة", "Resolved by")} {getUserName(req.resolvedBy || 0)}
                      </p>
                    </div>
                    <Badge variant="secondary">{t("تم الحل", "Resolved")}</Badge>
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </div>
      )}

      <Dialog open={resolveId !== null} onOpenChange={o => { if (!o) { setResolveId(null); setResolvePassword(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("حل طلب كلمة المرور", "Resolve Password Request")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("أدخل كلمة المرور الجديدة للمستخدم", "Enter the new password for the user")}: <strong>{getUserName(resolveUserId || 0)}</strong>
            </p>
            <div className="space-y-1">
              <Label>{t("كلمة المرور الجديدة", "New Password")}</Label>
              <Input type="password" value={resolvePassword} onChange={e => setResolvePassword(e.target.value)} data-testid="input-resolve-password" />
            </div>
            <Button className="w-full" disabled={!resolvePassword || resolvePassword.length < 4 || resolveMutation.isPending}
              onClick={() => resolveId && resolveMutation.mutate({ id: resolveId, newPassword: resolvePassword })}
              data-testid="button-resolve-submit">
              {resolveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("تغيير وحل الطلب", "Reset & Resolve")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CategoriesTab() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [addDialog, setAddDialog] = useState(false);
  const [editCategory, setEditCategory] = useState<QuoteProductCategory | null>(null);
  const [formData, setFormData] = useState({ nameAr: "", nameEn: "", sortOrder: 0 });

  const { data: categories = [], isLoading } = useQuery<QuoteProductCategory[]>({
    queryKey: ["/api/quote-product-categories"],
  });

  const createMutation = useMutation({
    mutationFn: (data: { nameAr: string; nameEn: string; sortOrder: number }) =>
      apiRequest("POST", "/api/quote-product-categories", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quote-product-categories"] });
      setAddDialog(false);
      setFormData({ nameAr: "", nameEn: "", sortOrder: 0 });
      toast({ title: t("تم إضافة التصنيف", "Category added") });
    },
    onError: () => { toast({ title: t("حدث خطأ", "Error"), variant: "destructive" }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<QuoteProductCategory> }) =>
      apiRequest("PATCH", `/api/quote-product-categories/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quote-product-categories"] });
      setEditCategory(null);
      toast({ title: t("تم تحديث التصنيف", "Category updated") });
    },
    onError: () => { toast({ title: t("حدث خطأ", "Error"), variant: "destructive" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/quote-product-categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quote-product-categories"] });
      toast({ title: t("تم حذف التصنيف", "Category deleted") });
    },
    onError: () => { toast({ title: t("حدث خطأ", "Error"), variant: "destructive" }); },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      apiRequest("PATCH", `/api/quote-product-categories/${id}`, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quote-product-categories"] });
    },
    onError: () => { toast({ title: t("حدث خطأ", "Error"), variant: "destructive" }); },
  });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const sorted = [...categories].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  return (
    <>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold" data-testid="text-categories-title">
          {t("تصنيفات المنتجات لطلب عرض السعر", "Quote Product Categories")}
        </h2>
        <Dialog open={addDialog} onOpenChange={setAddDialog}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-category"><Plus className="w-4 h-4 me-2" />{t("إضافة تصنيف", "Add Category")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("إضافة تصنيف جديد", "Add New Category")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>{t("الاسم بالعربي", "Name (AR)")} *</Label>
                <Input value={formData.nameAr} onChange={e => setFormData({ ...formData, nameAr: e.target.value })} data-testid="input-category-name-ar" />
              </div>
              <div className="space-y-1.5">
                <Label>{t("الاسم بالإنجليزي", "Name (EN)")} *</Label>
                <Input value={formData.nameEn} onChange={e => setFormData({ ...formData, nameEn: e.target.value })} data-testid="input-category-name-en" />
              </div>
              <div className="space-y-1.5">
                <Label>{t("ترتيب العرض", "Sort Order")}</Label>
                <Input type="number" value={formData.sortOrder} onChange={e => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })} data-testid="input-category-sort-order" />
              </div>
              <Button
                className="w-full"
                disabled={!formData.nameAr || !formData.nameEn || createMutation.isPending}
                onClick={() => createMutation.mutate(formData)}
                data-testid="button-save-category"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("إضافة", "Add")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {sorted.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t("لا توجد تصنيفات", "No categories")}</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {sorted.map(cat => (
            <Card key={cat.id} data-testid={`card-category-${cat.id}`}>
              <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{t(cat.nameAr, cat.nameEn)}</p>
                    <p className="text-xs text-muted-foreground">{cat.nameAr} / {cat.nameEn}</p>
                  </div>
                  <Badge variant={cat.active ? "default" : "secondary"} data-testid={`badge-category-status-${cat.id}`}>
                    {cat.active ? t("مفعّل", "Active") : t("معطّل", "Inactive")}
                  </Badge>
                  <span className="text-xs text-muted-foreground">#{cat.sortOrder ?? 0}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={cat.active}
                    onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: cat.id, active: checked })}
                    data-testid={`switch-category-active-${cat.id}`}
                  />
                  <Button size="icon" variant="ghost" onClick={() => { setEditCategory(cat); }} data-testid={`button-edit-category-${cat.id}`}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" data-testid={`button-delete-category-${cat.id}`}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("حذف التصنيف", "Delete Category")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("هل أنت متأكد من حذف هذا التصنيف؟ لا يمكن التراجع عن هذا الإجراء.", "Are you sure you want to delete this category? This action cannot be undone.")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("إلغاء", "Cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate(cat.id)} data-testid={`button-confirm-delete-category-${cat.id}`}>
                          {t("حذف", "Delete")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editCategory} onOpenChange={o => { if (!o) setEditCategory(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("تعديل التصنيف", "Edit Category")}</DialogTitle></DialogHeader>
          {editCategory && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>{t("الاسم بالعربي", "Name (AR)")} *</Label>
                <Input value={editCategory.nameAr} onChange={e => setEditCategory({ ...editCategory, nameAr: e.target.value })} data-testid="input-edit-category-name-ar" />
              </div>
              <div className="space-y-1.5">
                <Label>{t("الاسم بالإنجليزي", "Name (EN)")} *</Label>
                <Input value={editCategory.nameEn} onChange={e => setEditCategory({ ...editCategory, nameEn: e.target.value })} data-testid="input-edit-category-name-en" />
              </div>
              <div className="space-y-1.5">
                <Label>{t("ترتيب العرض", "Sort Order")}</Label>
                <Input type="number" value={editCategory.sortOrder ?? 0} onChange={e => setEditCategory({ ...editCategory, sortOrder: parseInt(e.target.value) || 0 })} data-testid="input-edit-category-sort-order" />
              </div>
              <Button
                className="w-full"
                disabled={!editCategory.nameAr || !editCategory.nameEn || updateMutation.isPending}
                onClick={() => updateMutation.mutate({ id: editCategory.id, data: { nameAr: editCategory.nameAr, nameEn: editCategory.nameEn, sortOrder: editCategory.sortOrder } })}
                data-testid="button-update-category"
              >
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("حفظ التعديلات", "Save Changes")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
