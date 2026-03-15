# Teak Manufacturing | تيك للتصنيع

## Overview
Teak Manufacturing is an integrated platform for a Saudi wood products factory, encompassing Manufacturing, CRM, and Project Management. Key features include bilingual (Arabic/English) support, light/dark modes, responsive PWA design, and ZATCA-compliant invoicing. The platform aims to optimize operations from customer engagement through production, delivery, and after-sales support, boosting efficiency and customer satisfaction in the wood products sector.

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
-   **Designer Tools:** Integrated Design Studio with 2D sketching (Konva.js) and 3D viewing (Three.js), supporting product specification, measurements, file uploads, fixture libraries, and a searchable manufacturing dimensions guide.
-   **Internationalization:** Global `DirectionProvider` ensures correct RTL/LTR display for all UI components.

**Backend:**
-   **Framework:** Express.js.
-   **Database:** PostgreSQL with Drizzle ORM.
-   **Authentication:** Session-based authentication using `scrypt` and `connect-pg-simple`. Role-Based Access Control (RBAC) is enforced.
-   **API:** Comprehensive RESTful API, including ZATCA QR generation and manufacturing process management.
-   **Customer Portal:** Uses Firebase Phone Authentication (SMS-based OTP) for secure customer access to track orders, view invoices, and manage maintenance requests.

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