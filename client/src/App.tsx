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
import AppLayout from "@/components/app-layout";
import NotFound from "@/pages/not-found";
import teakLogo from "@assets/image_1772704803717.png";

function SplashScreen({ onFinish }: { onFinish: () => void }) {
  const { lang } = useLanguage();
  useEffect(() => {
    const timer = setTimeout(onFinish, 2200);
    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-background"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <motion.img
        src={teakLogo}
        alt="Teak"
        className="w-28 h-28 sm:w-36 sm:h-36 object-contain"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        data-testid="img-splash-logo"
      />
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
