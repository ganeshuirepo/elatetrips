# ElateTrips

Elate Trips — a one-stop travel planning portal for celebration trips across India.

## What's here

| File | Purpose |
| --- | --- |
| `ElateTrips First Page.dc.html` | Main app (Design Component). Requires `support.js` + `image-slot.js` alongside it. |
| `ElateTrips First Page (Standalone).html` | Self-contained build — open this directly in any browser, no other files needed. |
| `support.js` | Runtime for the `.dc.html` component. |
| `image-slot.js` | Drag-and-drop image placeholder web component. |
| `assets/` | Celebration imagery (drop-in placeholders). |
| `ElateTrips Functionality.md` | Functional spec / feature notes. |
| `ElateTrips Standalone Src.dc.html` | Source variant used to generate the standalone build. |

## Run it

- **Quickest:** open `ElateTrips First Page (Standalone).html` in a browser.
- **Editable source:** serve the folder and open `ElateTrips First Page.dc.html` (it loads `support.js` and `image-slot.js` from the same directory).

## Features

- **Plan a trip** — destination search, dates, travellers, celebrations.
- **Cab step** — trip type (local / complete), vehicle selection, and pickup-location search across India (OpenStreetMap-based) with "use my current location".
- **Hotels** — listings with a detailed hotel page (rooms, amenities, collapsible celebration packages and activities).
- **Shopping** — surprise gifts and medical kits, sharing one cart.
- **Review & checkout** — login (OTP), contact + billing details, and share-with-guests.
- **Theming** — five celebration palettes (Lagoon, Sunset, Classic, Rose Soirée, Emerald Fête).
