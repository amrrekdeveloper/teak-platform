# Teak Manufacturing | تيك للتصنيع

## Overview
Landing page for Teak Manufacturing — an integrated Manufacturing + CRM + Project Management platform. Bilingual (Arabic/English), light/dark mode, responsive PWA-ready design.

## Architecture
- **Frontend**: React + TypeScript + Tailwind CSS + Framer Motion
- **Backend**: Express.js (currently minimal — landing page only)
- **UI Components**: Shadcn/ui
- **Routing**: wouter
- **Font**: Zain (Google Fonts) — supports Arabic and English
- **Colors**: Red (primary from logo) + Gray/Silver theme

## Key Files
- `client/src/pages/landing.tsx` — Main landing page with all sections
- `client/src/components/theme-provider.tsx` — Dark/light mode toggle
- `client/src/components/language-provider.tsx` — AR/EN language switching
- `client/src/App.tsx` — Root with providers and routing
- `client/src/index.css` — Theme colors (red/gray from logo)
- `client/index.html` — PWA meta tags, Zain font loading
- `client/public/manifest.json` — PWA manifest

## Design
- Colors derived from logo: Deep red primary (`hsl(0, 72%, 38%)`) + neutral grays
- Zain font for both Arabic and English text
- RTL support for Arabic, LTR for English
- Dark mode with matching red + dark gray palette
- Progress: 40% overall project completion shown

## Running
- `npm run dev` starts both Express backend and Vite frontend on port 5000
