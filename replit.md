# Teak Manufacturing | تيك للتصنيع

## Overview
Teak Manufacturing is an integrated platform for a Saudi wood products factory, encompassing Manufacturing, CRM, and Project Management. Key features include bilingual (Arabic/English) support, light/dark modes, responsive PWA design, and ZATCA-compliant invoicing. The platform aims to optimize operations from customer engagement through production, delivery, and after-sales support, boosting efficiency and customer satisfaction in the wood products sector. Key capabilities include comprehensive order management, customer relations, quotations, contracts, payments, work orders, production, inventory, HR, deliveries, installations, quality control, and system settings, alongside a Design Studio with 2D sketching and 3D viewing.

## User Preferences
I prefer simple language and clear, concise explanations. I want iterative development with frequent, small updates rather than large, infrequent ones. Please ask before making any major architectural changes or significant modifications to existing features. I value a collaborative approach where I'm kept informed of progress and potential issues.

## System Architecture
The application utilizes a modern full-stack architecture.

**Frontend:**
-   **Technology Stack:** React, TypeScript, Tailwind CSS, Framer Motion, Shadcn/ui.
-   **Design & UI/UX:** Bilingual (Arabic/English) interface with a unified "Zain" font, light/dark modes, and a primary red color scheme. Features include a splash screen, role-based sidebar, branded loading, and responsive design.
-   **Routing:** `wouter v3` with nested dashboard routing.
-   **State Management:** TanStack React Query v5 for data fetching.
-   **Core Modules:** Public landing page with product showcases, quote request, and order tracking. Authenticated dashboard with modules for order management, CRM, quotations, contracts, payments, ZATCA invoices, work orders, production, inventory, HR, deliveries, installations, quality control, and system settings.
-   **Designer Tools:** Professional 3D Kitchen Designer replacing the dedicated 3D designer role. Features: (1) Engineering-quality 2D floor plan with double-line walls, arrowhead dimension lines, proper door swing arcs, window triple-line symbols, cabinet footprint hatching, scale bar, and title block. (2) Realistic 3D cabinet geometry with stile/rail door frame + recessed center panels, drawer unit bands, countertops, kickplates. (3) Interactive Product Library sidebar (tabbed by base/wall/tall/corner, searchable) — sales rep clicks a product then clicks a wall in 3D to place it. (4) Local state management with Undo and Save Design. (5) Animated interactive doors: click to open/close with smooth lerp rotation (90° pivot from hinge edge). (6) First-person walkthrough mode (🚶) with PointerLockControls + WASD keyboard movement at 1.65m eye height. (7) Mobile gyroscope support via DeviceOrientationEvent API + touch joystick overlay. (8) VR/WebXR support via @react-three/xr with XR store and Enter VR button (🥽). Uses Three.js / React Three Fiber, SVG engineering plans. (9) Full Adeko catalog in the 3D studio: all ~250 active products load from `/api/kitchen-tool/products` and render parametrically (no GLB) — classified into base/wall/tall with doors/drawer stacks/glass/open/filler kinds; catalog sidebar shows thumbnail icons + search; options panel shows estimated total (width × material price/meter) and hides countertop swatches for non-base units.
-   **Internationalization:** Global `DirectionProvider` ensures correct RTL/LTR display for all UI components.

**Backend:**
-   **Framework:** Express.js.
-   **Database:** PostgreSQL with Drizzle ORM.
-   **Authentication:** Session-based authentication using `scrypt` and `connect-pg-simple`. Role-Based Access Control (RBAC) is enforced. Firebase Phone Authentication (SMS-based OTP) for customer portal.
-   **API:** Comprehensive RESTful API, including ZATCA QR generation and manufacturing process management.
-   **Customer Portal:** Uses Firebase Phone Authentication for secure customer access to track orders, view invoices, and manage maintenance requests.

**Core Features & Implementations:**
-   **Attendance System:** Full employee attendance monitoring. Public portal at `/attendance` (shared portal password, configured server-side) with phone lookup, employee dropdown, fingerprint simulation UI (visual wave animation), check-in/out recording, personal history view, and permission requests. Manager dashboard at `/attendance-monitor` (roles: owner, it) with daily summary cards, employee status table, detailed records log, manual edit capability, GPS link to Google Maps, and shared-device fraud detection. Canvas fingerprinting + device info captured per record. GPS geolocation requested (optional, graceful fallback). New DB tables: `attendance_records`, `attendance_permissions`, `location_zones`.
-   **ZATCA Invoice:** Generates simplified tax invoices with scannable QR codes.
-   **Sales Cycle:** Manages the entire sales process from quote request to warranty.
-   **Notifications:** Real-time notification system with various types.
-   **Dynamic Logos:** Uses a single white PNG logo with CSS filters for dynamic color adjustment.
-   **Calendar & Site Survey:** Integrated appointment scheduling with conflict detection, and a multi-step site survey form for detailed room, wall, and product specifications.
-   **Workflow Automation:** Includes features like inspection scheduling, direct sales order creation, automated work order generation upon payment confirmation, and a customer design approval flow.
-   **Product Management:** Adeko product library integration with manufacturing and design dimensions, and inline price editing.
-   **Order Assignment:** System for claiming and transferring sales orders among agents with RBAC.
-   **Payment Workflow:** Supports payment status tracking (pending/confirmed/rejected) with receipt upload and management.
-   **Delivery Tracking:** Delivery countdown timers integrated into relevant dashboards and customer portal.
-   **User Profiles:** Comprehensive user and customer profile management with image upload and password change functionalities.
-   **Pricing Engine:** Automated pricing calculation based on Adeko catalog and product options, with discount management.
-   **Quotation Builder:** Enhanced builder with dual-mode line items (Adeko/manual) and real-time pricing.
-   **3D Scene Customer Interaction:** Public sharing links for 3D visualization with real-time price updates and sharing options.
-   **Role-Specific Dashboard:** Dashboard (/) shows tailored content per role — sales sees their quotations/customers/appointments; production sees WO pipeline; accountant sees finance; warehouse/purchasing see inventory; delivery/installation/quality/HR/customer_service each see their relevant KPIs and quick links. All roles now have "لوحة التحكم" link in sidebar.
-   **Sidebar Navigation Fix:** All 14 roles now have the dashboard link in the sidebar (was missing for non-owner/assistant/it roles causing inability to return to dashboard).

-   **Payroll Module (مسيّر الرواتب):** Monthly payroll processing for HR/owner/assistant/accountant. Page at `/payroll` with a month selector. "Generate" creates draft payroll records for all active employees (basic = `monthlySalary`), idempotent via a unique `(employee_id, period)` index. Per-row inline edit of allowances/deductions with live net preview (net = basic + allowances − deductions, floored at 0). "Pay" posts a salary journal entry (Dr 6100 رواتب وأجور / Cr 1111 الصندوق) then conditionally flips draft→paid (journal-first + reference-dedup + conditional update guard against double-pay/orphan ledger). DB table: `payroll_records`. API at `/api/payroll`, `/api/payroll/generate`, PATCH `/api/payroll/:id`, POST `/api/payroll/:id/pay`.
-   **Customer Return → Contract Balance:** When an inventory stock-in with reason `customer_return` is linked to an active contract, the contract's `remainingAmount` is reduced automatically by the cost value of the returned items (unit cost × qty, floored at 0). Only active contracts are affected.
-   **HR Phase 5 — Advances / Leaves / Evaluations:**
    -   **Employee Advances (سلف الموظفين):** Page `/advances` (roles: owner/assistant/hr write, accountant read). Request an advance (amount + installments → auto monthly deduction); approve disburses cash and posts a journal (Dr 1140 سلف وعهد الموظفين / Cr 1111 الصندوق); reject. Only ONE active (approved) advance per employee, enforced by a Postgres partial unique index + 409 on race. Payroll `generate` auto-adds the monthly installment as `advanceDeduction`; payroll `pay` posts Dr 6100 (net+advance) / Cr 1140 (advance) / Cr 1111 (net) and decrements the advance remaining → `settled` at 0. DB: `employee_advances` (advanceStatus enum), `advance_deduction` col on `payroll_records`. COA seed account 1140 added.
    -   **Leave Management (الإجازات):** Page `/leaves` (roles: owner/assistant/hr). Request/approve/reject leaves (types: annual/sick/unpaid/emergency/maternity/other). Annual balance per employee: Saudi entitlement 21 days (<5yr tenure) / 30 days (≥5yr); used = sum of approved annual-leave days overlapping the target year (cross-year leaves counted per-year by overlap). DB: `leave_requests` (leaveType + leaveStatus enums).
    -   **Performance Evaluations (تقييم الأداء):** Page `/evaluations` (roles: owner/assistant/hr). Create periodic reviews scored 1-5 on quality/productivity/attendance/teamwork/discipline with auto-computed overall score, plus strengths and improvements notes; draft/finalized status. DB: `performance_evaluations` (evaluationStatus enum). All three tables added via idempotent startup migrations (no db:push), non-disruptive to existing prod data.
-   **Financial Accounting Module (Task #72):** Full double-entry accounting system for accountants (Ismail, Sultan) authenticated via `/finance-login` with PIN. Features: Chart of Accounts (41 pre-seeded Saudi-standard accounts in 6 types: asset/liability/equity/revenue/cost/expense), Journal Entries with balance validation, General Ledger, Trial Balance, Balance Sheet, Income Statement, Cash Flow Statement, VAT Report (ZATCA quarterly), Bank Reconciliation. Database tables: `chart_of_accounts`, `journal_entries`, `journal_entry_lines`. API endpoints at `/api/accounting/*`. Frontend pages under `/finance/*` with a shared `FinanceLayout` sidebar component. Finance dashboard at `/finance` shows accounting quick links.

## External Dependencies
-   **Database:** PostgreSQL
-   **ORM:** Drizzle ORM
-   **Authentication:** Firebase Phone Authentication, Firebase Admin SDK
-   **Mapping:** Google Maps embed
-   **QR Code Generation:** `qrcode` library
-   **UI Libraries:** Shadcn/ui, Framer Motion
-   **Frontend State/Queries:** TanStack React Query v5
-   **2D Sketching:** Konva.js
-   **3D Viewer:** Three.js
-   **PDF Generation:** jsPDF with jspdf-autotable for engineering drawings and document exports

## PDF & Document Features
-   **Payment Receipt (سند قبض):** Professional bilingual receipt modal (`client/src/components/payment-receipt.tsx`) with company branding, amount in Arabic words, Hijri/Gregorian dates, signature area, and print/share support. Available on confirmed payments in both staff payments page and customer portal.
-   **Engineering PDF Drawings:** A4 landscape 2-page PDF (`client/src/components/engineering-pdf.tsx`) with room floor plan (Page 1) and product schedule table (Page 2). Uses jsPDF for client-side generation. Available in customer portal order details.
-   **Invoice Cycle:** Finance dashboard supports contract creation with payment schedules, ZATCA invoice issuance with duplicate prevention, and ready-to-invoice queue. Contracts table includes `payment_schedule` jsonb column.