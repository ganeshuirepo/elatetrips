# ElateExperiences — Adventure Activities & Local Experiences (Klook-style)

> Sibling app #3 of the ElateTrips family. A **things-to-do marketplace**: browse and book
> individual **adventure activities** (trekking, camping, paragliding, kayaking, cycling,
> off-roading) and **local experiences** (tea-estate tours, tribal-village visits, food trails,
> chocolate-making, handicraft walks) — Klook-style. Per-ticket pricing, date & timeslot,
> instant/QR vouchers. No trip planning, no hotels — just activities.

This document mirrors the main app's structure so it can be built the same way and
**reuse the existing `elatetrips-node` backend** wherever possible.

---

## 1. Concept

| | ElateTrips (main) | ElateCelebrations (#2) | **ElateExperiences (this)** |
| --- | --- | --- | --- |
| Primary object | A trip | A celebration package | **An activity / experience** |
| Pricing | Composed cart | Package price | **Per person × qty, per timeslot** |
| Fulfilment | Trip booking | Package booking | **Dated voucher / QR ticket** |
| Feel | Planner (Booking.com) | Tour marketplace (Thrillophilia) | **Activities marketplace (Klook)** |

The core unit is an **activity** with a category, duration, difficulty, meeting point, what's
included, cancellation policy, and **timeslots** with per-person pricing. Users add several to a
cart (mix adventures + experiences), pick date & headcount per item, and check out for vouchers.

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
├─ app/                    # / (browse) · /activity/[id] · /cart · /checkout · /vouchers
├─ components/
│  ├─ layout/              # Header, CategoryNav (Adventure | Experiences), CartPill, UserProfile
│  ├─ activities/          # ActivityGrid · ActivityCard · ActivityFilters
│  │                       #   ActivityDetail (gallery, highlights, itinerary, what's included,
│  │                       #   meeting point + map, cancellation, timeslot picker, qty, reviews)
│  ├─ cart/                # Multi-activity cart (per-item date · slot · pax)
│  ├─ checkout/            # ReviewStep · AuthOtp · Contact · CouponBox · PaymentStep · Voucher
│  └─ ui/                  # Icon, Card, Chip, Stepper  (copy from main app)
├─ domain/                 # Framework-free: ticketPricing, slotAvailability, coupon, format
├─ data/                   # Category metadata + typed fallbacks (real data from backend)
├─ store/                  # slices: catalog(RTKQ) · cart · review · account · vouchers
├─ hooks/                  # useOutsideClick, useDebounce, useGeolocation (meeting-point map)
└─ theme/                  # Same palette bridge (reuse tokens)
```

### Redux slices
- **catalog** — RTK Query (`getActivities`, `getActivity`), filter/sort client-side or via query params.
- **cart** — `Record<activityId, { date, slotId, adults, children }>` (extends the main app's `cartSlice` idea; multiple activities, each dated).
- **review / account / vouchers** — reuse `reviewSlice`, `accountSlice` (+ `listeners.ts`), and an orders-like `vouchers` slice.

### Key screens / flows
1. **Browse** (`/`) — category nav (Adventure vs Local experiences) + filters (category, price, duration, difficulty, rating) + `ActivityGrid`. Reuse `ShopView`'s filter-sidebar + `ProductGrid` layout and the existing `ADVENTURES`/`EXPERIENCES` data as seed.
2. **Activity detail** (`/activity/[id]`) — gallery, highlights, itinerary, what's included/excluded, **meeting point + map** (reuse Photon/geolocation + `PickupSearch` map pattern), cancellation policy, **timeslot + headcount picker** (reuse `Travellers` stepper + a slot chip row), reviews, sticky **Add to cart · ₹N** bar.
3. **Cart** (`/cart`) — per-activity date/slot/pax, live totals (reuse `CartPill` + `unifiedCartSelectors` pattern; here every line is `source: 'activity'`).
4. **Checkout** — reuse main app's Review → Payment (auth OTP, contact, DEALNOW coupon, mock gateway) → issues **vouchers** (QR/booking id) instead of a trip order.
5. **Vouchers** — profile → issued vouchers with QR + details toggle (orders UI, relabelled).

## 4. Backend reuse (`elatetrips-node`)

The backend **already** models activities. Reuse it directly; add thin endpoints only where noted.

| Need | Reuse today | Notes |
| --- | --- | --- |
| Auth (OTP email+SMS, JWT) | ✅ `modules/auth/*` | No change. |
| Activities catalog | ✅ `modules/catalog` — `ActivityModel` already in `catalog.models.ts` + wired in `container.ts` (`activitiesRepo`) | Add `GET /catalog/activities`, `GET /catalog/activities/:id` to `catalog.routes.ts`/`catalog.service.ts`. |
| Coupons (DEALNOW) | ✅ `modules/orders/coupons.ts` | Shared. |
| Orders → **vouchers** | ✅ `modules/orders/*` | A voucher **is** an order with activity line items; the `items[]`/`summary`/`PaymentInfo` schema already fits. Add a `kind: 'voucher'` discriminator + optional QR/booking-code field if you want distinct UX. |
| Pricing | ✅ `modules/pricing/*` | Reuse per-person math helpers; or keep ticket pricing in the frontend `domain/`. |
| Timeslot availability / seat holds | ➕ small addition | Optional: `slots[]` on `ActivityModel` or `GET /catalog/activities/:id/slots`. MVP: static slots. |
| Partner onboarding (activity operators) | ✅ `modules/partner/*` | Operators list activities via the same EOI flow. |

**Composition root:** `container.ts` already wires `activitiesRepo` into `CatalogService`; new endpoints slot into the existing `CatalogController` — no new module needed for the MVP.

**API base:** same `/api/v1` (`NEXT_PUBLIC_API_BASE`). One shared backend serves all three apps.

## 5. Reuse from the main frontend
- `components/ui/*`, `theme/*`, `domain/format.ts`, coupon client mirror, `accountSlice` + `listeners.ts`, `reviewSlice`, Review/Payment screens, `Travellers` stepper, `PickupSearch`/Photon map + geolocation, `ShopView`/`ProductGrid` grid+filters, and the existing `data/activities.ts` (`ADVENTURES`, `EXPERIENCES`) as seed data — all transfer with minimal edits.

## 6. Data model (activity)
```ts
interface Activity {
  id: string;
  title: string;                 // "Doddabetta Sunrise Trek"
  kind: 'adventure' | 'experience';
  category: string;              // 'trekking' | 'tea-tour' | 'food-trail' ...
  destination: string;           // 'ooty'
  images: string[];
  durationH: number;
  difficulty?: 'easy' | 'moderate' | 'hard';
  meetingPoint: { name: string; lat: number; lon: number };
  perPerson: number;             // base ₹/person
  slots: { id: string; label: string; startMin: number; capacity?: number }[];
  highlights: string[]; inclusions: string[]; exclusions: string[];
  cancellation: string;          // policy text
  rating: number; reviews: number;
}
```
(Backed by `ActivityModel` in `catalog.models.ts`; extend that schema rather than adding a new store.)

## 7. Scripts (same as main)
`npm run dev` · `build`/`start` · `typecheck` · `lint` · `test` · `test:e2e` · `format`.

## 8. Deployment (shares the EC2 box)
- New PM2 app `elate-experiences-frontend` on a new port (e.g. `:3200`).
- Backend **shared** — nginx routes `/api/` to the existing `:4000`; no second backend.
- nginx server block (subdomain `experiences.elatetrips.com` or path prefix) + certbot + a GitHub Actions job mirroring `deploy/deploy.sh`.

## 9. Build order (suggested)
1. Scaffold Next app + copy `ui/`, `theme/`, `account`/`review` slices, Review/Payment, `ShopView` grid/filters.
2. RTK Query `catalog` endpoints → expose `GET /catalog/activities`; seed from `data/activities.ts`.
3. Browse grid + filters → activity detail (timeslots, pax, meeting-point map).
4. cart slice (per-item date/slot/pax) → checkout (Review/Payment + coupons) → vouchers.
5. Vouchers screen (QR). Tests. Deploy PM2 app + nginx block.
