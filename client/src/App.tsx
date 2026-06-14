import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { LanguageProvider, useLanguage } from "@/components/language-provider";
import { useAuth } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import LandingPage from "@/pages/landing";
import LoginPage from "@/pages/login";
import ProductsPage from "@/pages/products";
import RequestQuotePage from "@/pages/request-quote";
import DashboardPage from "@/pages/dashboard";
import CustomersPage from "@/pages/customers";
import CustomerDetailPage from "@/pages/customer-detail";
import QuotationsPage from "@/pages/quotations";
import QuotationBuilderPage from "@/pages/quotation-builder";
import QuotationViewPage from "@/pages/quotation-view";
import ContractsPage from "@/pages/contracts";
import ContractDetailPage from "@/pages/contract-detail";
import PaymentsPage from "@/pages/payments";
import PaymentDetailPage from "@/pages/payment-detail";
import InvoicesPage from "@/pages/invoices";
import InvoiceViewPage from "@/pages/invoice-view";
import WorkOrdersPage from "@/pages/work-orders";
import WorkOrderDetailPage from "@/pages/work-order-detail";
import ProductionPage from "@/pages/production";
import InventoryPage from "@/pages/inventory";
import SuppliersPage from "@/pages/suppliers";
import PurchasesPage from "@/pages/purchases";
import PurchaseDetailPage from "@/pages/purchase-detail";
import EmployeesPage from "@/pages/employees";
import PayrollPage from "@/pages/payroll";
import AdvancesPage from "@/pages/advances";
import LeavesPage from "@/pages/leaves";
import EvaluationsPage from "@/pages/evaluations";
import DeliveriesPage from "@/pages/deliveries";
import InstallationsPage from "@/pages/installations";
import QualityPage from "@/pages/quality";
import SettingsPage from "@/pages/settings";
import SettingsProductsPage from "@/pages/settings-products";
import TrackOrderPage from "@/pages/track-order";
import DesignerBoardPage from "@/pages/designer-board";
import OrderCenterPage from "@/pages/order-center";
import MyOrdersPage from "@/pages/my-orders";
import OrderDetailPage from "@/pages/order-detail";
import DesignStudioPage from "@/pages/design-studio";
import CustomerPortalLogin from "@/pages/customer-portal-login";
import CustomerPortal from "@/pages/customer-portal";
import EmployeeLoginPage from "@/pages/employee-login";
import SystemAdminLogin from "@/pages/system-admin-login";
import MyCalendarPage from "@/pages/my-calendar";
import SiteSurveyPage from "@/pages/site-survey";
import Scene3DPage from "@/pages/scene-3d";
import FinanceDashboardPage from "@/pages/finance-dashboard";
import MyProfilePage from "@/pages/my-profile";
import DailySalesEntryPage from "@/pages/daily-sales-entry";
import SalesPerformancePage from "@/pages/sales-performance";
import MyMapPage from "@/pages/my-map";
import SalesMapPage from "@/pages/sales-map";
import AttendancePage from "@/pages/attendance";
import AttendanceMonitorPage from "@/pages/attendance-monitor";
import FinanceLoginPage from "@/pages/finance-login";
import FinanceAccountsPage from "@/pages/finance-accounts";
import FinanceLedgerPage from "@/pages/finance-ledger";
import FinanceTrialBalancePage from "@/pages/finance-trial-balance";
import FinanceBalanceSheetPage from "@/pages/finance-balance-sheet";
import FinanceIncomeStatementPage from "@/pages/finance-income-statement";
import FinanceCashFlowPage from "@/pages/finance-cash-flow";
import FinanceVatReportPage from "@/pages/finance-vat-report";
import FinanceBankReconciliationPage from "@/pages/finance-bank-reconciliation";
import FinanceFiscalYearsPage from "@/pages/finance-fiscal-years";
import FinanceSettingsPage from "@/pages/finance-settings";
import AppLayout from "@/components/app-layout";
import NotFound from "@/pages/not-found";

import teakLogo from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";
import FloatingContact from "@/components/floating-contact";
import { useLocation } from "wouter";

function GuardedMyMapPage() {
  const { user: authUser } = useAuth();
  if (!authUser || authUser.role !== "sales") return <NotFound />;
  return <MyMapPage />;
}

function GuardedSalesMapPage() {
  const { user: authUser } = useAuth();
  if (!authUser || !["owner", "assistant", "it"].includes(authUser.role)) return <NotFound />;
  return <SalesMapPage />;
}

function GuardedSettingsUsersPage() {
  const { user: authUser } = useAuth();
  if (authUser && authUser.role !== "owner" && authUser.role !== "it") return <NotFound />;
  return <SettingsPage initialTab="users" />;
}

function SplashScreen({ onFinish }: { onFinish: () => void }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const duration = 2500;
    const interval = 30;
    const steps = duration / interval;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      const eased = 1 - Math.pow(1 - step / steps, 3);
      setProgress(Math.min(Math.round(eased * 100), 100));
      if (step >= steps) {
        clearInterval(timer);
        setTimeout(onFinish, 300);
      }
    }, interval);
    return () => clearInterval(timer);
  }, [onFinish]);

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style={{ backgroundColor: "#9e0a0a" }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute w-[600px] h-[600px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)", top: "-200px", right: "-200px" }}
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute w-[400px] h-[400px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)", bottom: "-100px", left: "-100px" }}
          animate={{ scale: [1.2, 1, 1.2], opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <motion.div
        className="w-40 h-40 sm:w-48 sm:h-48 rounded-full bg-white/5 backdrop-blur-sm flex items-center justify-center relative z-10 ring-1 ring-white/10"
        initial={{ scale: 0.5, opacity: 0, filter: "blur(10px)" }}
        animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        data-testid="img-splash-logo"
      >
        <img
          src={teakLogo}
          alt="Teak"
          className="w-28 h-28 sm:w-36 sm:h-36 object-contain drop-shadow-2xl"
        />
      </motion.div>

      <motion.div
        className="mt-8 flex flex-col items-center gap-3 relative z-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
      >
        <div className="w-48 h-1 bg-white/20 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-white rounded-full"
            style={{ width: `${progress}%` }}
            transition={{ duration: 0.1 }}
          />
        </div>
        <span className="text-white/80 text-sm font-bold tabular-nums" data-testid="text-splash-progress">
          {progress}%
        </span>
      </motion.div>
    </motion.div>
  );
}

function PlaceholderPage({ titleAr, titleEn }: { titleAr: string; titleEn: string }) {
  const { t } = useLanguage();
  void titleAr; void titleEn;
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">{t(titleAr, titleEn)}</h2>
        <p className="text-muted-foreground">
          {t("قيد التطوير", "Under development")}
        </p>
      </div>
    </div>
  );
}

function DashboardRoutes() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/customers/:id" component={CustomerDetailPage} />
        <Route path="/customers" component={CustomersPage} />
        <Route path="/quotations/new" component={QuotationBuilderPage} />
        <Route path="/quotation-builder" component={QuotationBuilderPage} />
        <Route path="/quotations/:id/view" component={QuotationViewPage} />
        <Route path="/quotations" component={QuotationsPage} />
        <Route path="/contracts/:id" component={ContractDetailPage} />
        <Route path="/contracts" component={ContractsPage} />
        <Route path="/payments/:id" component={PaymentDetailPage} />
        <Route path="/payments" component={PaymentsPage} />
        <Route path="/invoices/:id" component={InvoiceViewPage} />
        <Route path="/invoices" component={InvoicesPage} />
        <Route path="/work-orders/:id" component={WorkOrderDetailPage} />
        <Route path="/work-orders" component={WorkOrdersPage} />
        <Route path="/production" component={ProductionPage} />
        <Route path="/inventory" component={InventoryPage} />
        <Route path="/suppliers" component={SuppliersPage} />
        <Route path="/purchases/:id" component={PurchaseDetailPage} />
        <Route path="/purchases" component={PurchasesPage} />
        <Route path="/deliveries" component={DeliveriesPage} />
        <Route path="/installations" component={InstallationsPage} />
        <Route path="/quality" component={QualityPage} />
        <Route path="/employees" component={EmployeesPage} />
        <Route path="/payroll" component={PayrollPage} />
        <Route path="/advances" component={AdvancesPage} />
        <Route path="/leaves" component={LeavesPage} />
        <Route path="/evaluations" component={EvaluationsPage} />
        <Route path="/order-center" component={OrderCenterPage} />
        <Route path="/orders/:id" component={OrderDetailPage} />
        <Route path="/my-orders" component={MyOrdersPage} />
        <Route path="/my-calendar" component={MyCalendarPage} />
        <Route path="/site-survey/:appointmentId" component={SiteSurveyPage} />
        <Route path="/scene-3d" component={Scene3DPage} />
        <Route path="/finance" component={FinanceDashboardPage} />
        <Route path="/finance/accounts" component={FinanceAccountsPage} />
        <Route path="/finance/journal" component={FinanceAccountsPage} />
        <Route path="/finance/ledger" component={FinanceLedgerPage} />
        <Route path="/finance/trial-balance" component={FinanceTrialBalancePage} />
        <Route path="/finance/balance-sheet" component={FinanceBalanceSheetPage} />
        <Route path="/finance/income-statement" component={FinanceIncomeStatementPage} />
        <Route path="/finance/cash-flow" component={FinanceCashFlowPage} />
        <Route path="/finance/vat-report" component={FinanceVatReportPage} />
        <Route path="/finance/bank-reconciliation" component={FinanceBankReconciliationPage} />
        <Route path="/finance/opening-balances" component={FinanceAccountsPage} />
        <Route path="/finance/fiscal-years" component={FinanceFiscalYearsPage} />
        <Route path="/finance/settings" component={FinanceSettingsPage} />
        <Route path="/design-studio/:orderId" component={DesignStudioPage} />
        <Route path="/designer-board" component={DesignerBoardPage} />
        <Route path="/my-profile" component={MyProfilePage} />
        <Route path="/daily-performance" component={DailySalesEntryPage} />
        <Route path="/sales-performance" component={SalesPerformancePage} />
        <Route path="/my-map" component={GuardedMyMapPage} />
        <Route path="/sales-map" component={GuardedSalesMapPage} />
        <Route path="/attendance-monitor" component={AttendanceMonitorPage} />
        <Route path="/settings/users" component={GuardedSettingsUsersPage} />
        <Route path="/settings/products" component={SettingsProductsPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/login">{() => { window.location.replace("/employee-login"); return null; }}</Route>
      <Route path="/products" component={ProductsPage} />
      <Route path="/request-quote" component={RequestQuotePage} />
      <Route path="/track-order" component={TrackOrderPage} />
      <Route path="/portal/login" component={CustomerPortalLogin} />
      <Route path="/portal" component={CustomerPortal} />
      <Route path="/employee-login" component={EmployeeLoginPage} />
      <Route path="/attendance" component={AttendancePage} />
      <Route path="/finance-login" component={FinanceLoginPage} />
      <Route path="/system-admin" component={SystemAdminLogin} />
      <Route path="/view-3d" component={Scene3DPage} />
      <Route path="/scene-3d" component={Scene3DPage} />
      <Route path="/dashboard" nest component={DashboardRoutes} />
      <Route component={NotFound} />
    </Switch>
  );
}

function FloatingContactWrapper() {
  const [location] = useLocation();
  const isPublicPage =
    !location.startsWith("/dashboard") &&
    !location.startsWith("/login") &&
    !location.startsWith("/employee-login") &&
    !location.startsWith("/attendance") &&
    !location.startsWith("/finance-login") &&
    !location.startsWith("/scene-3d") &&
    !location.startsWith("/site-survey");
  if (!isPublicPage) return null;
  return <FloatingContact />;
}

function App() {
  const [showSplash, setShowSplash] = useState(() => {
    if (sessionStorage.getItem("splashShown")) return false;
    return true;
  });

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <TooltipProvider>
            <AnimatePresence mode="wait">
              {showSplash && (
                <SplashScreen key="splash" onFinish={() => { sessionStorage.setItem("splashShown", "1"); setShowSplash(false); }} />
              )}
            </AnimatePresence>
            {!showSplash && (
              <>
                <Toaster />
                <Router />
                <FloatingContactWrapper />
              </>
            )}
          </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
