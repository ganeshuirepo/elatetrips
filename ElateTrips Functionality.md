# ElateTrips — First Page Functionality

A celebration-focused travel booking flow. The user plans one trip and attaches travel logistics plus occasion-led add-ons in a single guided journey. The flow runs in three steps: **Plan → Hotels → Review**.

---

## Step 1 — Plan

### Destination & dates
- **Destination search** with type-ahead. Ooty is live ("Queen of the Nilgiris"); Coorg, Munnar and Goa are shown as coming soon.
- **Tour dates** picked as a start→end range from a calendar.
- **Travellers** — adults and children steppers (adults minimum 1). The traveller count drives downstream limits (vehicle type, voucher headcount).

### Celebration type
Select up to 4 from: **Birthday, Anniversary, Honeymoon, Wedding, Bachelor Party, Milestone, Wellness, Proposal.**

**Combination rules** (incompatible tiles dim automatically):
- **Group A** — Birthday, Anniversary, Milestone, Wellness can be combined together.
- **Group B** — Wedding, Honeymoon, Wellness, Bachelor Party can be combined together.
- **Wellness** sits in both groups, so it bridges either set.
- **Proposal** is exclusive — it cannot be combined with any other celebration.

### Per-celebration day (and age)
- Each selected celebration gets a **day** picked from a dropdown limited to the tour dates.
- **Birthday** and **Milestone** additionally take an **age** field in the same row — the age drives package filtering on the Hotels step.

### Transport
- **Own transport** — no cab needed.
- **I need a cab** — choose a trip type:
  - **Local trips** — set the number of days (capped at the tour length).
  - **Complete trip** — cab booked for the full tour; enter **pickup city** and **pickup address**.

---

## Step 2 — Hotels

### Cab details (only when a cab was chosen)
- **Vehicle type**, filtered by traveller count:
  - **6 or fewer** travellers → Hatchback, Sedan, SUV (no coaches). 5–6 narrows to SUV.
  - **More than 6** → Tempo Traveller, Mini Bus, Bus (no cars).
  - Changing the traveller count clears a now-invalid vehicle selection.
- **Pickup details** (for a complete trip) — city and address.

### Hotel preferences
- **Star rating**, **amenities**, and **activities** the hotel provides.

### Celebration packages
- Curated add-ons shown per selected celebration, as **voucher-style cards** (icon, name, short description, price). Selecting a card expands it to a dated voucher badge tied to that celebration's day.
- The celebration's **selected date** is shown on the right of each celebration's group header.
- **Age-bound filtering** — Birthday and Milestone packages are filtered by the age entered on Step 1 (e.g. Kids activities ≤12, Magician show ≤15, adult-only options 18+).
- **Unique across celebrations** — a shared package (e.g. In-room decoration) appears under only the first celebration that offers it; never duplicated.
- Package catalogue includes decor, dining, photoshoots, plus experiences like **Magician show, Kids activities, Live guitarist, Custom dishes, Special welcome entry.**

### Wedding (special package)
When **Wedding** is selected, a dedicated form replaces the standard chips:
- **Couple name** and **number of guests**
- **Budget range** slider from ₹50,000 to ₹10 Lakh+
- **Pre-wedding ceremonies** (Engagement, Roka/Tilak, Haldi, Mehendi, Sangeet)
- **Post-wedding ceremonies** (Reception, Griha Pravesh, Satyanarayan Puja)
- A note that an **engagement manager will contact the user** to craft the plan.

### Activities & experiences (combined)
A single section of **Klook-style dated vouchers** spanning adventures (Trekking, Rafting, Ziplining, ATV, Paragliding, Camping) and local experiences (Sightseeing, Food tour, Workshops, Cultural events, Dining add-ons, Kid-friendly):
- Selecting one expands the card to a **day picker** (limited to tour dates) and a **headcount stepper**.
- Headcount is **capped at the number of travellers**; it auto-clamps if travellers are reduced.
- Each voucher shows a **per-person price** and a live line total (qty × price), confirmed by a green voucher badge once a day is set.

### Local guide
- No manual selection. A **dedicated local guide is included on every trip**, assigned from the backend to plan the itinerary and coordinate with hotels, event managers, and partners. Shown as an informational note.

### Cost summary
A running breakdown on the Hotels page:
- **Celebration packages** subtotal
- **Activities & experiences** subtotal
- **Add-ons total**
- Hotel and cab fares are quoted separately after partner confirmation.

---

## Step 3 — Review
A single summary card lists destination, tour dates, travellers, transport, hotel rating, amenities, activities, experiences, and per-celebration packages, with the **add-ons total**, then a **Confirm booking** action.

---

## Validation & flow rules
- Continue to Hotels is unlocked only when destination, dates, every celebration's day (and age where required), and transport mode are set.
- Review is unlocked only when cab details (vehicle, and pickup for a complete trip) are complete.
- Local-trip day count and activity headcount are both bounded by the trip (tour length / traveller count).
- Theme is tweakable (festive, classic, rose, emerald, gala); hero and max-celebrations are configurable.
