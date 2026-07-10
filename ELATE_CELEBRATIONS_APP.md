# ElateCelebrations — Curated Celebration Packages (Thrillophilia-style)

> Sibling app #2 of the ElateTrips family. Where the main **ElateTrips** app is an
> all-in-one trip planner (build your own from hotels + cabs + services), **ElateCelebrations**
> is a **packaged marketplace**: pre-built, priced, ready-to-book celebration experiences
> (birthday getaways, anniversary escapes, honeymoon specials, proposals, bachelor trips)
> browsed and booked like Thrillophilia tours — pick a package, choose a date & pax, pay.

This document mirrors the structure of the main app so it can be built the same way and
**reuse the existing `elatetrips-node` backend** wherever possible.

---

## 1. Concept

| | ElateTrips (main) | **ElateCelebrations (this)** |
| --- | --- | --- |
| Model | Build-your-own, à la carte | **Fixed, curated packages** |
| Primary object | A trip (tabs → cart) | **A celebration package** |
| Discovery | Search trip → tabs | **Browse / filter packages** (grid) |
| Detail | Hotel / service tiles | **Package page** (itinerary, inclusions, gallery, reviews, price) |
| Cart | Multi-source shared cart | **1 package + add-ons + date + pax** |
| Feel | Booking.com-ish planner | **Thrillophilia tour marketplace** |

A package bundles a stay + celebration setup + services + (optionally) cab & experiences at a
single headline price ("₹24,999 / couple"), with variants (e.g. Silver / Gold / Platinum) and
optional add-ons. The customer does **not** assemble it — they pick and book.

## 2. Stack (identical to main app)

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router) + React 19 |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 (layout) + Material UI v9 (controls) |
| State | Redux Toolkit (feature slices + memoized selectors + listener middleware) |
| Async data | **RTK Query → shared `elatetrips-node` API** (`NEXT_PUBLIC_API_BASE`) |
| Forms | React Hook Form + Zod |
| Icons / fonts | Tabler webfont · Playfair Display + Lato |
| Tests | Vitest + RTL (unit) · Playwright (e2e) |
| Deploy | Same EC2 box, new PM2 app + nginx server block (see §8) |

## 3. Architecture (same shape as `src/`)

```
src/
├─ app/                    # App Router: / (browse) · /package/[id] · /checkout · /orders
├─ components/
│  ├─ layout/              # Header, CategoryNav, CartPill, UserProfile  (reuse patterns)
│  ├─ packages/            # PackageGrid · PackageCard · PackageFilters · PackageDetail
│  │                       #   (hero gallery, itinerary, inclusions/exclusions, variants,
│  │                       #    add-ons, date & pax picker, reviews, sticky "Book" bar)
│  ├─ checkout/            # ReviewStep · AuthOtp · Contact/Billing · CouponBox · PaymentStep
│  └─ ui/                  # Icon, Card, Chip, Stepper  (copy from main app)
├─ domain/                 # Framework-free: packagePricing, availability, coupon, format
├─ data/                   # Typed fallbacks / category metadata (real data from backend)
├─ store/                  # slices: catalog(RTKQ) · booking · review · account · orders
├─ hooks/                  # useOutsideClick, useDebounce
└─ theme/                  # Same palette bridge (reuse tokens)
```

### Redux slices
- **catalog** — RTK Query endpoints hitting the backend catalog (`getPackages`, `getPackage`).
- **booking** — the current selection: `{ packageId, variantId, date, pax, addOnIds[] }`.
- **review** — contact/billing, applied coupon (reuse main app's `reviewSlice` shape).
- **account** — JWT session (reuse `accountSlice` + `listeners.ts` verbatim).
- **orders** — the user's past bookings.

### Key screens / flows
1. **Browse** (`/`) — hero + category chips (Birthday, Anniversary, Honeymoon, Proposal, Bachelor, Group) + filters (destination, price, duration, rating) + sorted `PackageGrid`. Mirrors `ShopView`'s filter-sidebar + grid.
2. **Package detail** (`/package/[id]`) — gallery carousel (reuse `PackageTiles`/hotel gallery pattern), overview, day-by-day itinerary, inclusions/exclusions, variant selector, add-ons, **date + pax picker** (reuse `DatesField`/`Travellers`), reviews, sticky **Book now · ₹N** bar.
3. **Checkout** — reuse the main app's Review → Payment screens almost verbatim (auth OTP, contact/billing, DEALNOW coupon, mock Razorpay-shaped gateway).
4. **Orders** — profile → bookings list with a details toggle (reuse main app's orders UI).

## 4. Backend reuse (`elatetrips-node`) — the important part

The existing backend **already** models packages. Reuse it directly; add thin endpoints only where noted.

| Need | Reuse today | Notes |
| --- | --- | --- |
| Auth (signup/login, email+SMS OTP, JWT) | ✅ `modules/auth/*` | No change. `/api/v1/auth/*` |
| Packages catalog | ✅ `modules/catalog` — `PackageModel`, `CelebrationModel`, `OptionModel` already in `catalog.models.ts` + `container.ts` | Add `GET /catalog/packages`, `GET /catalog/packages/:id` to `catalog.routes.ts`/`catalog.service.ts` if not exposed yet. |
| Coupons (DEALNOW 10% ≤ ₹500) | ✅ `modules/orders/coupons.ts` | Shared server-side validation. |
| Orders (create + list, counter ids, PaymentInfo) | ✅ `modules/orders/*` | The order `items[]`/`summary` schema already accepts arbitrary line items — a package is one line. |
| Pricing helpers | ✅ `modules/pricing/*` | Reuse for any cab/experience add-ons. |
| Partner onboarding (package suppliers) | ✅ `modules/partner/*` | Vendors publish packages via the same EOI flow. |
| Package availability / seats | ➕ small addition | Optional: an `availability` field on `PackageModel` or a `GET /catalog/packages/:id/availability`. Start with "always available", add later. |

**Composition root:** the DI container (`container.ts`) already wires a `packagesRepo` + `CatalogService`; new endpoints slot into the existing `CatalogController` with zero new modules in the MVP.

**API base:** point `NEXT_PUBLIC_API_BASE` at the same `/api/v1` (same-origin in prod, `http://localhost:4000/api/v1` in dev). One backend serves all three apps.

## 5. Reuse from the main frontend (copy, don't fork logic)
- `components/ui/*` (Icon, Card, Chip, Stepper), `theme/*` palette bridge, `domain/format.ts`, `domain/coupons` client mirror, `store/slices/accountSlice.ts` + `store/listeners.ts`, `store/slices/reviewSlice.ts`, the Review/Payment screens, `DatesField`/`Travellers`, and the `PackageTiles` gallery/detail-modal components — all transfer with minimal edits.

## 6. Data model (package)
```ts
interface CelebrationPackage {
  id: string;
  title: string;               // "Lakeside Anniversary Escape"
  occasion: 'birthday' | 'anniversary' | 'honeymoon' | 'proposal' | 'bachelor' | 'group';
  destination: string;         // 'ooty'
  images: string[];
  durationDays: number;
  fromPrice: number;           // headline "from ₹"
  variants: { id: string; name: string; price: string; perks: string[] }[]; // Silver/Gold/Platinum
  itinerary: { day: number; title: string; items: string[] }[];
  inclusions: string[];
  exclusions: string[];
  addOns: { id: string; label: string; price: number }[];
  rating: number; reviews: number;
}
```
(Backed by `PackageModel` in `catalog.models.ts`; extend that schema rather than inventing a new store.)

## 7. Scripts (same as main)
`npm run dev` · `build`/`start` · `typecheck` · `lint` · `test` · `test:e2e` · `format`.

## 8. Deployment (shares the EC2 box)
- New PM2 app `elate-celebrations-frontend` on a new port (e.g. `:3100`).
- Backend is **shared** — no second backend; nginx routes `/api/` to the existing `:4000`.
- Add an nginx server block (subdomain `celebrations.elatetrips.com` or path prefix), certbot for HTTPS, and a GitHub Actions job mirroring `deploy/deploy.sh`.

## 9. Build order (suggested)
1. Scaffold Next app + copy `ui/`, `theme/`, `account`/`review` slices, Review/Payment.
2. Wire RTK Query `catalog` endpoints to the shared backend; expose `GET /catalog/packages`.
3. Browse grid + filters → package detail (variants, date/pax, add-ons).
4. booking slice → checkout (reuse Review/Payment + coupons + orders).
5. Orders screen. Tests. Deploy PM2 app + nginx block.
