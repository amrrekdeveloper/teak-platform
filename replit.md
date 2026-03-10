# Teak Manufacturing | تيك للتصنيع

## Overview
Teak Manufacturing is an integrated platform designed for a Saudi wood products factory. It combines Manufacturing, CRM, and Project Management functionalities. The platform supports bilingual (Arabic/English) interfaces, features light/dark modes, and is built as a responsive PWA. A key capability is ZATCA-compliant invoicing. The project aims to streamline operations from customer engagement to production, delivery, and after-sales support, enhancing efficiency and customer satisfaction in the wood products market.

## User Preferences
I prefer simple language and clear, concise explanations. I want iterative development with frequent, small updates rather than large, infrequent ones. Please ask before making any major architectural changes or significant modifications to existing features. I value a collaborative approach where I'm kept informed of progress and potential issues.

## System Architecture
The application follows a modern full-stack architecture.

**Frontend:**
-   **Frameworks:** React, TypeScript, Tailwind CSS for styling, Framer Motion for animations, and Shadcn/ui for UI components.
-   **Design:** Bilingual (Arabic/English) interface with a unified "Zain" font. Features both light and dark modes. The primary color scheme uses red from the company logo, complemented by gray/silver tones.
-   **Routing:** Utilizes `wouter v3` with nested routing for the dashboard.
-   **State Management:** TanStack React Query v5 for data fetching and caching.
-   **UI/UX Features:** Splash screen, role-based sidebar, branded loading overlays, responsive design for mobile (hamburger menu, scrollable tabs).
-   **Key Pages:** Includes a public landing page with product showcases, a quote request form (with geolocation and dynamic product categories), and a public order tracking system. The authenticated dashboard features comprehensive modules for order management, customer relations, quotations, contracts, payments, ZATCA-compliant invoices, work orders, production, inventory, HR, deliveries, installations, quality control, and system settings.
-   **Designer Tools:** Integrated Designer Board and Design Studio with 2D sketching (Konva.js) and 3D viewing (Three.js) capabilities, allowing for detailed product specification, measurements, and file uploads.
-   **RTL/LTR:** Radix `DirectionProvider` is wrapped globally in `LanguageProvider` to ensure all Radix UI components (Tabs, Select, Dialog, etc.) inherit the correct direction. The `<html>` element also gets `dir` attribute set via `useLayoutEffect`.

**Backend:**
-   **Framework:** Express.js.
-   **Database:** PostgreSQL, managed with Drizzle ORM.
-   **Authentication:** Session-based authentication using `scrypt` for password hashing and `connect-pg-simple` for session storage. Role-Based Access Control (RBAC) is implemented for API routes.
-   **API:** Comprehensive RESTful API supporting all frontend functionalities, including ZATCA QR generation and manufacturing process management.
-   **Customer Portal:** Implements Firebase Phone Authentication (SMS-based OTP) for secure customer login, allowing customers to track orders, view invoices, and manage maintenance requests.

**Core Features & Implementations:**
-   **ZATCA Invoice:** Generates simplified tax invoices with a real scannable QR code containing 5 TLV tags (seller name, VAT#, timestamp, total, VAT amount).
-   **Sales Cycle:** End-to-end flow from quote request, design assignment, quotation, customer approval, payment, production, delivery, installation, to auto-generated warranty.
-   **Notifications:** Real-time notification system with various types (info, warning, action, success) and an auto-refreshing dropdown panel.
-   **Logos:** Utilizes a single white PNG logo with CSS filters to dynamically adjust its color (red, auto-variant) based on context and theme.

## External Dependencies
-   **Database:** PostgreSQL
-   **ORM:** Drizzle ORM
-   **Authentication:** Firebase Phone Authentication (for customer portal), Firebase Admin SDK (for backend token verification)
-   **Payment:** Integration for payment recording and receipt uploads (no direct payment gateway integration specified).
-   **Mapping:** Google Maps embed (for landing page location display).
-   **QR Code Generation:** `qrcode` library (for ZATCA invoices).
-   **UI Libraries:** Shadcn/ui, Framer Motion.
-   **Frontend State/Queries:** TanStack React Query v5.
-   **2D Sketching:** Konva.js.
-   **3D Viewer:** Three.js.

## Recent Features
-   **User Profile System:** Users table has `profileImage` column (base64 TEXT). Dashboard header includes a clickable avatar that opens a professional profile popover (name, role, email, phone, username). "Edit Profile" dialog allows profile image upload and password change via `PATCH /api/users/profile/me`.
-   **Customer Portal Profile:** Mobile-optimized bottom sheet profile view with customer info and logout.
-   **Design Studio Mobile:** Fully responsive layout with horizontally scrollable tabs, stacking grids, responsive canvas heights, and `xs: 480px` Tailwind breakpoint.
-   **Building Status:** Product specs include `buildingStatus` ("ready" / "under_construction") with conditional `constructionPhase` selector (7 phases from construction to finishing).
-   **Room Openings:** Optional room openings (doors, windows, open entrances) in product specs with wall position, dimensions, and sill height for windows. Collapsible editor UI.