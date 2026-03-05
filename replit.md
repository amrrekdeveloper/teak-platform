# Teak Manufacturing | تيك للتصنيع

## Overview
Integrated Manufacturing + CRM + Project Management platform for a Saudi wood products factory. Bilingual (Arabic/English), light/dark mode, responsive PWA-ready design, ZATCA-compliant invoicing.

## Architecture
- **Frontend**: React + TypeScript + Tailwind CSS + Framer Motion + Shadcn/ui
- **Backend**: Express.js + PostgreSQL + Drizzle ORM
- **Auth**: Session-based with scrypt hashing, connect-pg-simple for session store
- **Routing**: wouter v3 (frontend) with nested routing (`nest` prop on /dashboard), Express (backend)
- **Queries**: TanStack React Query v5
- **Font**: Zain (Google Fonts) — supports Arabic and English
- **Colors**: Red primary from logo + Gray/Silver theme
- **QR Code**: `qrcode` library for ZATCA-compliant scannable QR codes

## Database
- PostgreSQL with 23 tables (see `shared/schema.ts`)
- Core: users, employees, customers, products, woodTypes, doorTypes
- Sales: quotations, contracts, payments, invoices
- Manufacturing: workOrders, productionStages
- Inventory: inventory, inventoryTransactions, suppliers, purchaseOrders
- Services: deliveries, installations, maintenanceRequests, qualityChecks
- System: notifications, activityLog, companySettings

## Key Files
- `shared/schema.ts` — Full database schema with Drizzle + Zod types
- `server/auth.ts` — Session auth, password hashing, RBAC middleware
- `server/routes.ts` — All API routes with RBAC protection + ZATCA QR generation + Manufacturing
- `server/storage.ts` — DatabaseStorage class (IStorage interface)
- `server/seed.ts` — Seed data (16 users, 16 products, 7 wood types, 5 customers, 12 inventory items, 3 suppliers)
- `client/src/App.tsx` — Root with providers, routing, splash screen (sessionStorage-gated)
- `client/src/components/app-layout.tsx` — Dashboard layout with header, notifications dropdown
- `client/src/components/app-sidebar.tsx` — Role-based sidebar + mobile hamburger drawer
- `client/src/components/language-provider.tsx` — AR/EN language switching
- `client/src/components/theme-provider.tsx` — Dark/light mode
- `client/src/hooks/use-auth.ts` — Auth hook with login/logout/me

## Routing (wouter v3)
- Public routes: `/`, `/login`, `/products`, `/request-quote`, `/track-order`
- Dashboard uses `<Route path="/dashboard" nest>` — inner routes are RELATIVE (without /dashboard prefix)
- Inner routes: `/`, `/customers`, `/customers/:id`, `/quotations`, `/quotations/new`, `/contracts`, `/contracts/:id`, `/payments`, `/invoices`, `/invoices/:id`, `/work-orders`, `/work-orders/:id`, `/production`, `/inventory`, `/suppliers`, `/purchases`, `/deliveries`, `/installations`, `/quality`, `/employees`, `/settings`
- Sidebar Links and `useRoute()` inside dashboard pages use scoped paths (e.g., `/customers` not `/dashboard/customers`)
- Login page navigates to `/dashboard` using absolute path (outside nested context)
- **IMPORTANT**: AppLayout uses `window.location.href` (NOT `setLocation`) for redirects to `/login` because `setLocation` in wouter v3 nested context would navigate to `/dashboard/login` instead of `/login`

## Pages
### Public
- `client/src/pages/landing.tsx` — Landing page with phases, features, workflow, Track Order link
- `client/src/pages/products.tsx` — Product catalog with category filters
- `client/src/pages/request-quote.tsx` — Public quote request form → creates customer + notification
- `client/src/pages/track-order.tsx` — Public order tracking (contract# + phone lookup, shows work order status timeline)

### Dashboard (authenticated)
- `client/src/pages/login.tsx` — Login page
- `client/src/pages/dashboard.tsx` — Stats overview with KPIs, work order progress bars, payment breakdown, employee stats
- `client/src/pages/customers.tsx` — Customer list with search, create dialog
- `client/src/pages/customer-detail.tsx` — Customer profile with quotations/contracts/payments
- `client/src/pages/quotations.tsx` — Quotations list with status filters, approve/reject
- `client/src/pages/quotation-builder.tsx` — Build quotation: customer → items → wood type → area → auto-calc
- `client/src/pages/contracts.tsx` — Contracts from approved quotations
- `client/src/pages/contract-detail.tsx` — Contract with payment recording → auto ZATCA invoice
- `client/src/pages/payments.tsx` — All payments with stage/method labels
- `client/src/pages/invoices.tsx` — Invoice list (quotations + tax invoices)
- `client/src/pages/invoice-view.tsx` — ZATCA invoice view with real scannable QR code, print/download
- `client/src/pages/work-orders.tsx` — Work orders list with status filters, create dialog, priority badges
- `client/src/pages/work-order-detail.tsx` — Work order detail with production stages board
- `client/src/pages/production.tsx` — Production dashboard with Kanban-style board
- `client/src/pages/inventory.tsx` — Inventory management with CRUD, stock in/out, low stock alerts
- `client/src/pages/suppliers.tsx` — Supplier management with CRUD
- `client/src/pages/purchases.tsx` — Purchase orders with multi-item, status flow
- `client/src/pages/employees.tsx` — HR management with iqama tracking, nationality stats
- `client/src/pages/deliveries.tsx` — Delivery scheduling and tracking
- `client/src/pages/installations.tsx` — Installation scheduling + Maintenance requests
- `client/src/pages/quality.tsx` — Quality control checks
- `client/src/pages/settings.tsx` — Company settings, user management, activity logs (3 tabs)

## Notifications System
- Bell icon in header with unread count badge
- Dropdown panel with notification list, mark-as-read, mark-all-read
- Notification types: info, warning, action, success (with color-coded icons)
- Auto-refresh every 30s
- API: GET /api/notifications, PATCH /api/notifications/:id/read, PATCH /api/notifications/read-all

## Track Order (Public)
- Endpoint: GET /api/track-order?contractNumber=X&phone=Y
- Exact phone match (normalized, strips +966/00966 prefix)
- Returns: contract#, customer name, status, work order statuses (no financial data)
- Frontend shows manufacturing progress timeline with 8-step status visualization

## ZATCA Invoice
- Type: فاتورة ضريبية مبسطة (Simplified Tax Invoice)
- QR Code with 5 TLV tags: seller name, VAT#, timestamp, total, VAT amount
- QR rendered using `qrcode` library (real scannable QR)
- Auto-generated upon payment recording
- Sequential invoice numbering
- VAT at 15%
- Verification endpoint: GET /api/invoices/:id/verify

## Seed Users (password: 123456)
k.asiri/owner, khaled/assistant, hadi/sales, mohnad/sales, mohsen/designer, hamdi/production, ayman/purchasing, bassam/warehouse, ismail/accountant, fatima/customer_service, mohammed/delivery, saddad/installation, quality1/quality, noura/hr, hanan/hr, siham/it

## Logos
- English (logo_teak2_1772689894105.png) → favicon + splash + EN mode
- Arabic (logo_teak1_1772689915503.png) → AR mode

## Mobile
- NO bottom nav — uses hamburger MobileMenuButton opening drawer from `start-0` (right in RTL, left in LTR)
- Double padding fix: app-layout provides `p-4 md:p-6` on `<main>` — pages use `<div className="space-y-6">` NOT their own padding
- Filter tabs: `flex-nowrap` + `shrink-0 whitespace-nowrap` for scrollable mobile tabs

## Running
- `npm run dev` starts Express backend + Vite frontend on port 5000
