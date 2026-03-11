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
-   **Designer Tools:** Integrated Design Studio with 2D sketching (Konva.js) and 3D viewing (Three.js) capabilities, allowing for detailed product specification, measurements, and file uploads. Features fixture drag-and-drop library (kitchen, bathroom, plants, door patterns, furniture), searchable manufacturing dimensions guide, and camera presets with panoramic 360° auto-rotate in 3D viewer.
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
-   **Inspection Scheduling:** Quotations table has `inspectionDate` (date, nullable) column. Sales users schedule inspections via `PATCH /api/quotations/:id/inspection-date` with server-side date validation. Design Studio button is disabled until inspection is booked. `GET /api/inspections` returns upcoming inspections with customer/user data, role-filtered.
-   **Upcoming Inspections (Order Center):** Collapsible section showing inspection cards sorted by date, with customer info, phone, product, assigned salesperson. Today's inspections highlighted.
-   **Inspection Dashboard (Admin):** Owner dashboard shows today's inspections count, this week count, and upcoming inspections list.
-   **Customer Portal Inspections:** Shows inspection appointment card with formatted date and "Add to Calendar" (.ics download) button.
-   **Direct Sales Order Creation:** Sales users create orders for walk-in customers via "New Order" button → dialog (name, phone, product). `POST /api/orders/create-direct` creates/finds customer and quotation.
-   **Designer Board Removed from Sidebar:** Design Studio is now only accessible from within order detail cards.
-   **User Profile System:** Users table has `profileImage` column (base64 TEXT). Dashboard header includes a clickable avatar that opens a professional profile popover (name, role, email, phone, username). "Edit Profile" dialog allows profile image upload and password change via `PATCH /api/users/profile/me`.
-   **Customer Portal Profile:** Mobile-optimized bottom sheet profile view with customer info and logout.
-   **Design Studio Mobile:** Fully responsive layout with horizontally scrollable tabs, stacking grids, responsive canvas heights, and `xs: 480px` Tailwind breakpoint.
-   **Building Status:** Product specs include `buildingStatus` ("ready" / "under_construction") with conditional `constructionPhase` selector (7 phases from construction to finishing).
-   **Room Openings:** Optional room openings (doors, windows, open entrances) in product specs with wall position, dimensions, and sill height for windows. Collapsible editor UI.
-   **Design Studio Fixture Library:** Drag-and-drop fixture library in 2D canvas with 30+ items across 5 categories (kitchen appliances, bathroom, indoor plants, door patterns, furniture). Searchable, categorized with horizontal tabs. Placement mode: select fixture → click canvas to place at grid-snapped position.
-   **Enhanced Mfg Dimensions Guide:** Comprehensive searchable reference with product type dimensions (kitchen/wardrobe/door/decoration), hardware specs (hinges, runners, handles), material specifications (density, weight, bend radius), and clearance formulas. Expandable/collapsible sections with bilingual search.
-   **3D Viewer Enhancements:** Camera preset buttons (Front, Side, Top, Panoramic 360°), auto-rotate panoramic mode, improved lighting with hemisphere/contact shadows, material texture cycling, and fullscreen button.
-   **Customer Design Approval Flow:** `customerApproval` and `customerApprovalNotes` columns on design_assignments. Customer portal shows 2D sketch + 3D screenshot with fullscreen zoom. Approval/revision request buttons. `POST /api/customer-portal/approve-design/:id` and `POST /api/customer-portal/request-revision/:id` endpoints with notifications to staff.
-   **Design Approval Dashboard:** Dashboard shows design approval status section with approved/pending/revision counts. Order center table shows inline design approval badges (green=approved, yellow=pending, amber=revision).
-   **Role-Based Order Filtering (RBAC):** Sales users see only their assigned quotations and design assignments. Owner/assistant see all. Backend enforces ownership checks on `PATCH /api/quotations/:id` (sales can't modify others' quotations or reassign). Frontend hides staff filter, assign button, and assigned-to column for sales role. `staleTime` changed from `Infinity` to `30s` for fresher data.
-   **Unified Design + Quotation Flow:** Design studio has 5th "Quotation" tab for line item pricing (description, qty, unit price, VAT 15%, discount). "Send to Customer" button validates price > 0 and design exists, then PATCHes quotation (items+price+status:sent) and design assignment (status:completed) together.
-   **Awaiting Payment Stage:** `awaiting_payment` stage in order center (purple, Wallet icon). `getOrderStage` returns `awaiting_payment` when quotation is approved but no payment exists. Stage filter and counts updated.
-   **Unified Customer Portal Approval:** Customer portal shows design images directly (not collapsed) for "sent" quotations. Single "Approve Design & Quotation" button calls `POST /api/customer-portal/approve-quotation/:id` which auto-approves both design and quotation, creates contract + tax invoice. Server enforces `status === "sent"` before approval.
-   **Payment Receipt Upload:** After approval, customer sees PaymentSection with invoice preview, amount due, and drag-to-upload receipt image. `POST /api/customer-portal/upload-receipt` validates contractId ownership and requires receipt image.
-   **Cancel Order Button:** Manager-only (owner/assistant) cancel button in order detail dialog with confirm/undo pattern. Sets quotation status to `expired`.