import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Router } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { ThemeProvider } from "@/components/theme-provider";
import { LanguageProvider } from "@/components/language-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import HrWorkspace from "@/pages/hr-workspace";
import "./index.css";

/** HR access must not depend on loading public marketing, 3D, or unrelated ERP pages. */
class HrEntryBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error("HR workspace render failed", error); }
  render() {
    if (this.state.failed) return <main dir="rtl" style={{ padding: 32, fontFamily: "Tahoma", color: "#780808" }}>
      <h1>تعذّر فتح مساحة الموارد البشرية / Could not open HR</h1>
      <p role="alert">أعد تحميل الصفحة. لن تتغير بياناتك المحفوظة. / Reload; saved data will not change.</p>
      <button type="button" onClick={() => window.location.reload()}>إعادة التحميل / Reload</button>
      {" · "}<a href="/">الرئيسية / Home</a>
    </main>;
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <HrEntryBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider><LanguageProvider><TooltipProvider>
        <Toaster />
        <Router base={/^\/hr(?:\/|$)/.test(window.location.pathname) ? "/hr" : ""}><HrWorkspace /></Router>
      </TooltipProvider></LanguageProvider></ThemeProvider>
    </QueryClientProvider>
  </HrEntryBoundary>,
);
