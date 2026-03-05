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
import DashboardPage from "@/pages/dashboard";
import AppLayout from "@/components/app-layout";
import NotFound from "@/pages/not-found";
import logoEN from "@assets/logo_teak2_1772689894105.png";
import logoAR from "@assets/logo_teak1_1772689915503.png";

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
        src={lang === "ar" ? logoAR : logoEN}
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

function DashboardRoutes() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/dashboard/customers">
          <PlaceholderPage titleAr="العملاء" titleEn="Customers" />
        </Route>
        <Route path="/dashboard/quotations">
          <PlaceholderPage titleAr="عروض الأسعار" titleEn="Quotations" />
        </Route>
        <Route path="/dashboard/contracts">
          <PlaceholderPage titleAr="العقود" titleEn="Contracts" />
        </Route>
        <Route path="/dashboard/payments">
          <PlaceholderPage titleAr="المدفوعات" titleEn="Payments" />
        </Route>
        <Route path="/dashboard/invoices">
          <PlaceholderPage titleAr="الفواتير" titleEn="Invoices" />
        </Route>
        <Route path="/dashboard/work-orders">
          <PlaceholderPage titleAr="أوامر العمل" titleEn="Work Orders" />
        </Route>
        <Route path="/dashboard/production">
          <PlaceholderPage titleAr="الإنتاج" titleEn="Production" />
        </Route>
        <Route path="/dashboard/inventory">
          <PlaceholderPage titleAr="المخزون" titleEn="Inventory" />
        </Route>
        <Route path="/dashboard/purchases">
          <PlaceholderPage titleAr="المشتريات" titleEn="Purchase Orders" />
        </Route>
        <Route path="/dashboard/deliveries">
          <PlaceholderPage titleAr="التوصيل" titleEn="Deliveries" />
        </Route>
        <Route path="/dashboard/installations">
          <PlaceholderPage titleAr="التركيب والصيانة" titleEn="Installation & Maintenance" />
        </Route>
        <Route path="/dashboard/quality">
          <PlaceholderPage titleAr="الجودة" titleEn="Quality" />
        </Route>
        <Route path="/dashboard/employees">
          <PlaceholderPage titleAr="الموظفين" titleEn="Employees" />
        </Route>
        <Route path="/dashboard/settings">
          <PlaceholderPage titleAr="الإعدادات" titleEn="Settings" />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function PlaceholderPage({ titleAr, titleEn }: { titleAr: string; titleEn: string }) {
  const { t } = useLanguage();
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">{t(titleAr, titleEn)}</h2>
        <p className="text-muted-foreground">
          {t("قيد التطوير — سيتم بناء هذه الوحدة قريباً", "Under development — this module will be built soon")}
        </p>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/dashboard/:rest*" component={DashboardRoutes} />
      <Route path="/dashboard" component={DashboardRoutes} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <TooltipProvider>
            <AnimatePresence mode="wait">
              {showSplash && (
                <SplashScreen key="splash" onFinish={() => setShowSplash(false)} />
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
