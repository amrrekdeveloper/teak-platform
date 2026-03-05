import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { LanguageProvider, useLanguage } from "@/components/language-provider";
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
import ContractsPage from "@/pages/contracts";
import ContractDetailPage from "@/pages/contract-detail";
import PaymentsPage from "@/pages/payments";
import InvoicesPage from "@/pages/invoices";
import InvoiceViewPage from "@/pages/invoice-view";
import WorkOrdersPage from "@/pages/work-orders";
import WorkOrderDetailPage from "@/pages/work-order-detail";
import ProductionPage from "@/pages/production";
import InventoryPage from "@/pages/inventory";
import SuppliersPage from "@/pages/suppliers";
import PurchasesPage from "@/pages/purchases";
import EmployeesPage from "@/pages/employees";
import DeliveriesPage from "@/pages/deliveries";
import InstallationsPage from "@/pages/installations";
import QualityPage from "@/pages/quality";
import SettingsPage from "@/pages/settings";
import TrackOrderPage from "@/pages/track-order";
import DesignerBoardPage from "@/pages/designer-board";
import CustomerPortalLogin from "@/pages/customer-portal-login";
import CustomerPortal from "@/pages/customer-portal";
import AppLayout from "@/components/app-layout";
import NotFound from "@/pages/not-found";
import logoEn from "@assets/logo_teak2_1772689894105.png";

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

      <motion.img
        src={logoEn}
        alt="Teak"
        className="w-32 h-32 sm:w-40 sm:h-40 object-contain relative z-10"
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        data-testid="img-splash-logo"
      />

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
        <Route path="/quotations" component={QuotationsPage} />
        <Route path="/contracts/:id" component={ContractDetailPage} />
        <Route path="/contracts" component={ContractsPage} />
        <Route path="/payments" component={PaymentsPage} />
        <Route path="/invoices/:id" component={InvoiceViewPage} />
        <Route path="/invoices" component={InvoicesPage} />
        <Route path="/work-orders/:id" component={WorkOrderDetailPage} />
        <Route path="/work-orders" component={WorkOrdersPage} />
        <Route path="/production" component={ProductionPage} />
        <Route path="/inventory" component={InventoryPage} />
        <Route path="/suppliers" component={SuppliersPage} />
        <Route path="/purchases" component={PurchasesPage} />
        <Route path="/deliveries" component={DeliveriesPage} />
        <Route path="/installations" component={InstallationsPage} />
        <Route path="/quality" component={QualityPage} />
        <Route path="/employees" component={EmployeesPage} />
        <Route path="/designer-board" component={DesignerBoardPage} />
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
      <Route path="/login" component={LoginPage} />
      <Route path="/products" component={ProductsPage} />
      <Route path="/request-quote" component={RequestQuotePage} />
      <Route path="/track-order" component={TrackOrderPage} />
      <Route path="/portal/login" component={CustomerPortalLogin} />
      <Route path="/portal" component={CustomerPortal} />
      <Route path="/dashboard" nest component={DashboardRoutes} />
      <Route component={NotFound} />
    </Switch>
  );
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
              </>
            )}
          </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
