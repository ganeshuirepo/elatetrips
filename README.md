<<<<<<< HEAD
# ElateTrips — React + Next.js

Celebration-first travel planning for India, re-platformed from the original standalone
HTML/JS app onto a modern, type-safe React stack.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | **Next.js 16** (App Router) + React 19 |
| Language | **TypeScript** (strict) |
| Styling — layout | **Tailwind CSS v4** (utilities, intrinsic responsiveness) |
| Styling — components | **Material UI v9** (buttons, inputs, fields) |
| State | **Redux Toolkit** (feature slices + memoized selectors + listener middleware) |
| Async data | **RTK Query** (Photon geocoding) |
| Forms | **React Hook Form + Zod** (contact / billing) |
| Icons / fonts | Tabler webfont · `next/font` (Playfair Display + Lato) |
| Tests | **Vitest + RTL** (unit) · **Playwright** (e2e) |

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (next/core-web-vitals) |
| `npm test` | Vitest unit suite (domain rules, pricing, formatters) |
| `npm run test:e2e` | Playwright happy-path suite |
| `npm run format` | Prettier (+ Tailwind class sort) |

## Architecture

```
src/
├─ app/                 # App Router entry (layout, page, globals.css)
├─ components/
│  ├─ layout/           # Header, ThemeSwitcher, CartPill, StepIndicator
│  ├─ planner/          # Wizard steps: plan · cab · hotels · shop · review
│  ├─ shop/             # Gifts / Medical catalogues
│  └─ ui/               # MUI-wrapped primitives (Icon, Card, Chip, Stepper)
├─ domain/              # Framework-free logic: rules, pricing, calendar, format, photon
├─ data/                # Typed mock catalogues (hotels, packages, vehicles, shop…)
├─ store/               # Redux Toolkit store, slices, selectors, RTK Query, listeners
├─ hooks/               # useOutsideClick, useDebounce, useGeolocation
└─ theme/               # Palettes → CSS variables + MUI theme bridge
```

### Key design decisions

- **Single source of design tokens** — one palette object drives both the CSS custom
  properties (Tailwind / inline) and the MUI theme, so the 5 celebration themes
  (Lagoon, Sunset, Classic, Rose Soirée, Emerald Fête) swap at runtime with no drift.
- **Pure domain layer** — celebration combination rules, vehicle-by-pax filtering,
  age-gated package filtering, fare estimation and the calendar grid are framework-free
  and unit-tested for parity with the original.
- **MUI for controls, Tailwind for layout** — the two never style the same element.
- **No media queries** — responsiveness comes from CSS Grid `auto-fit` + `minmax()`,
  flexbox `flex-wrap`, and `clamp()`. Tailwind breakpoint prefixes are intentionally avoided.
- **Single-route client wizard** — `plan → cab → hotels → shop → review` is driven by
  Redux state under `/`; the cab step only appears when a cab is chosen.

## Functional scope

Mirrors `ElateTrips Functionality.md` from the source project: destination search, tour
date range, travellers, celebration selection (with combination + age rules), transport
(own / cab · local / complete trip with OpenStreetMap pickup search + geolocation),
hotels (filters, detail, rooms), celebration packages, wedding form, activity/experience
vouchers, shared gifts/medical cart, and OTP review + checkout. All data is mock.

## Legacy standalone prototype

The original single-file HTML/JS prototype this app was re-platformed from is still kept
in the repo root for reference:

| File | Purpose |
| --- | --- |
| `ElateTrips First Page (Standalone).html` | Self-contained build — open directly in any browser. |
| `ElateTrips First Page.dc.html` | Design Component variant; loads `support.js` + `image-slot.js` from the same directory. |
| `ElateTrips Standalone Src.dc.html` | Source variant used to generate the standalone build. |
| `support.js` | Runtime for the `.dc.html` component. |
| `image-slot.js` | Drag-and-drop image placeholder web component. |
| `ElateTrips Functionality.md` | Functional spec / feature notes (the new app mirrors this). |
