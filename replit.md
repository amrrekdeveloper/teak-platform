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
-   **Designer Tools:** Professional 3D Kitchen Designer replacing the dedicated 3D designer role. Features: (1) Engineering-quality 2D floor plan with double-line walls, arrowhead dimension lines, proper door swing arcs, window triple-line symbols, cabinet footprint hatching, scale bar, and title block. (2) Realistic 3D cabinet geometry with stile/rail door frame + recessed center panels, drawer unit bands, countertops, kickplates. (3) Interactive Product Library sidebar (tabbed by base/wall/tall/corner, searchable) — sales rep clicks a product then clicks a wall in 3D to place it. (4) Local state management with Undo and Save Design. (5) Animated interactive doors: click to open/close with smooth lerp rotation (90° pivot from hinge edge). (6) First-person walkthrough mode (🚶) with PointerLockControls + WASD keyboard movement at 1.65m eye height. (7) Mobile gyroscope support via DeviceOrientationEvent API + touch joystick overlay. (8) VR/WebXR support via @react-three/xr with XR store and Enter VR button (🥽). Uses Three.js / React Three Fiber, SVG engineering plans.
-   **Internationalization:** Global `DirectionProvider` ensures correct RTL/LTR display for all UI components.

**Backend:**
-   **Framework:** Express.js.
-   **Database:** PostgreSQL with Drizzle ORM.
-   **Authentication:** Session-based authentication using `scrypt` and `connect-pg-simple`. Role-Based Access Control (RBAC) is enforced. Firebase Phone Authentication (SMS-based OTP) for customer portal.
-   **API:** Comprehensive RESTful API, including ZATCA QR generation and manufacturing process management.
-   **Customer Portal:** Uses Firebase Phone Authentication for secure customer access to track orders, view invoices, and manage maintenance requests.

**Core Features & Implementations:**
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