# Research Notes — Route Relay

Findings that informed the plan, with sources. Current as of 2026-08-30.

---

## 1. Hosting a static site (GitHub Pages)

- GitHub Pages serves static files over HTTPS for free, from a repository branch
  (e.g. `main` root or `/docs`).
- Pages requires the repository to be **public** for free hosting; private repos need a
  paid plan. We chose a public repo (the app itself is code-only; the trip *data* lives
  in Firebase, not the repo).
- Pages is static-only: **no server-side code or secrets** can run. This forces the
  shared-state problem onto a BaaS (see §2).

## 2. Realtime shared state (Firebase vs Supabase)

Sources: Firebase pricing/docs (verified Aug 2026), Bytebase "Supabase vs Firebase"
(updated 2025), AgentDeals 2026 comparison.

- **Firebase Realtime Database** = purpose-built realtime + offline + mobile-first. Its
  database is a JSON tree with real-time listeners — ideal for "everyone sees the same
  list, instantly."
- **Supabase** = open-source Postgres with a Realtime channel; better for SQL/relational
  needs, open-source control, and predictable pricing.
- **Decision:** Firebase Realtime Database for v1 (matches the core realtime requirement,
  free tier, zero-ops). Supabase documented as the fallback if open-source/Postgres is
  preferred later.

**Exact free ("Spark") tier limits** (for 3 people in a car, all of them irrelevant):

| Limit | Value | Headroom for us |
|-------|-------|-----------------|
| Simultaneous connections | 100 | 3 phones = 3 connections |
| Stored data | 1 GB | map links ≈ bytes per trip |
| Download | 10 GB/month | negligible |

Caveats worth knowing:
- Firebase **removed Cloud Storage from the Spark plan in Feb 2026** (Blaze + credit card
  now required for file storage). **Not relevant** — we don't store files, only JSON.
- There was a broader "Spark → Blaze migration" push in early 2026 around Firebase Studio
  and Cloud Storage. Realtime Database on Spark remains the right, free choice here; just
  avoid any Firebase feature that needs Storage or paid quotas.

## 3. Google Maps deep links

Sources: Google for Developers — "Maps URLs" (Get Started / URL scheme for iOS), updated
2026-08-25.

Supported formats:
- Universal links: `https://www.google.com/maps/...` (open Google Maps app on iOS/Android).
- Short share links: `https://maps.app.goo.gl/...` and `https://goo.gl/maps/...`.
- Cross-platform directions URL:
  `https://www.google.com/maps/dir/?api=1&origin=<...>&destination=<...>&travelmode=driving`
- Search URL: `https://www.google.com/maps/search/?api=1&query=<...>`
- iOS URL schemes (`comgooglemaps://`, `comgooglemapsurl://`) exist for native-only
  features, but **we don't need them** — presenting the https link is enough for the OS to
  hand off to the app.

Useful parameters for our one-tap handoff:

| Param | Purpose | Note |
|-------|---------|------|
| `origin` / `destination` | Route endpoints (address or query string) | omit `origin` → uses device location |
| `travelmode` | `driving`, `walking`, `bicycling`, `transit`, `two-wheeler` | default driving |
| `waypoints` | Intermediate stops, pipe-separated `A\|B\|C` | **multistop** support |
| `dir_action=navigate` | Launch **turn-by-turn navigation** immediately | ⭐ key: jumps past route preview |
| `avoid` | `tolls`, `highways`, `ferries` (comma-separated) | route preferences |

Key points:
- **`dir_action=navigate`** is the standout finding: adding it to a directions URL makes
  the driver's tap go straight into navigation (when device location is available) instead
  of a route preview. This is exactly the "switching navigation is one tap" goal.
- **No API key is required** to construct or open any of these links.

## 4. Apple Maps deep links

Sources: Apple "Adopting unified Maps URLs" (MapKit), Apple URL Scheme Reference (archive),
Apple Developer Forums thread #784030.

Two URL generations matter:

### 4a. Legacy scheme (pre-iOS 18.4, still works for address strings)
- `https://maps.apple.com/?daddr=<destination>` — directions from current location.
  Optional `saddr=<origin>` and `dirflg=d|w|r` (drive/walk/transit).
- Regression caveat (Apple Developer Forums, May 2025): raw **coordinate** URLs
  (`daddr=37.77,-122.41`) stopped behaving reliably on newer iOS. Address strings still work.

### 4b. Unified Maps URL (iOS 18.4+, macOS 15.4+, watchOS 11.4+)
The path-based schema Apple now recommends. For our use, the `/directions` path:

| Param | Purpose | Values |
|-------|---------|--------|
| `source` | Origin (address or `lat,lng`) | optional — omit → current location |
| `destination` | Destination (address or `lat,lng`) | required |
| `waypoint` | Intermediate stop — **repeatable** | `lat,lng` or address |
| `mode` | `driving`, `walking`, `transit`, `cycling` | default driving |
| `avoid` | `tolls`, `highways`, `busy-roads`, `stairs` | comma-separated |
| `transit-preferences` | `bus`, `subway`, `commuter`, `ferry` | transit only |
| `start` | **Starts navigation after N seconds** | integer (seconds) |

Examples (from Apple's docs):
- `https://maps.apple.com/directions?destination=<place>&mode=driving`
- `https://maps.apple.com/directions?source=37.7954,-122.3936&destination=<place>&mode=driving`
- multistop: `...&destination=<place>&waypoint=<A>&waypoint=<B>&mode=driving`

Key points:
- **`start=<seconds>`** is Apple's equivalent of Google's `dir_action=navigate`: it
  auto-begins navigation after a short delay. This lets us offer "tap → auto-start nav."
- **Multistop** is natively supported via repeated `waypoint` params (matches Google's
  `waypoints`).
- Practical implication for us: when a passenger pastes a `maps.apple.com` link, **store
  and replay it verbatim** rather than re-parsing coordinates. For typed destinations we
  generate the unified form ourselves (`destination=<place>&mode=driving`).

Platform note:
- `maps.apple.com` opens Apple Maps on iOS. On Android there is **no Apple Maps app**, so
  the link falls back to the browser. We should detect this and offer a **Google Maps
  equivalent** instead (see §6 cross-provider conversion).

## 5. Why "tap a link → native app" works with no code

On modern iOS and Android, `https` links to `maps.apple.com` / `www.google.com/maps` are
**universal links / app links**. When the driver taps one, the OS opens the installed maps
app directly. This is what lets the driver's phone hand off to CarPlay / Android Auto with
zero custom URL-scheme handling.

The CarPlay / Android Auto constraint that motivates the whole app: **only one phone is
mirrored to the car display at a time.** Everyone else is a passenger. Route Relay is the
control surface that lets passengers queue suggestions and the driver apply them with one
tap on the *mirrored* phone.

---

## 6. Feature research — what actually helps 3 people in a car

Research + reasoning on which features earn their place, prioritized for our scale
(3 trusted people, same car, security not a concern).

### Must-have (v1 — the core loop)

| Feature | Why | How |
|---------|-----|-----|
| **Type a destination** (not just paste a link) | Passengers usually say "let's hit a Tim Hortons", not paste a URL | App builds `maps.apple.com/directions?destination=…` or `google.com/maps/dir/?api=1&destination=…` from free text |
| **Paste a link** | For pre-researched spots / shared links | classify Google vs Apple vs unknown |
| **One-tap → straight to navigation** | "Switching is one tap" is the whole point | append `dir_action=navigate` (Google) / `start=N` (Apple) |
| **Cross-provider fallback** | Driver's phone dictates the app (Android has no Apple Maps; some iOS users prefer Google Maps) | convert Apple ↔ Google when we can extract the destination |
| **Big touch targets + dark mode** | Driver is glove-friendly, night driving | mobile-first CSS, high contrast |

### Should-have (v1.5 — the "collaboration" value)

| Feature | Why | How |
|---------|-----|-----|
| **Vote / endorse a suggestion** | 3 people can quickly agree on the next stop | one-tap 👍 per route; sort queue by votes |
| **Multistop itinerary** | "gas → food → hotel" as one ordered trip | build a single multi-waypoint URL (Google `waypoints` / Apple `waypoint`) |
| **Destination vs. waypoint** | distinguish "our new destination" from "a stop along the way" | `kind` field on each route |
| **Active-route highlight** | everyone sees what the driver is currently navigating | `status: active` |
| **Mark done / remove** | keep the queue from getting stale | `status: done` / `removed`, synced |
| **Keep screen awake** | driver's queue shouldn't sleep mid-drive | Screen Wake Lock API (with graceful fallback) |

### Nice-to-have (later / only if asked)

| Feature | Notes |
|---------|-------|
| Presence ("who's online") | 3 people in one car — mildly useful, low priority |
| Subtle "new suggestion" sound | driver might miss it otherwise; keep optional/silent-by-default |
| Route preview thumbnails | needs map APIs/keys — skip for v1 |
| Trip history / saved routes | out of scope for a temporary trip tool |
| Offline cache of past trips | RTDB already caches offline; extra value is low |

### Cross-provider conversion table

| Passenger submits | Driver on iOS (Apple Maps) | Driver on Android (Google Maps) |
|-------------------|-----------------------------|---------------------------------|
| Apple `?daddr=<place>` | open as-is | → `google.com/maps/dir/?api=1&destination=<place>&dir_action=navigate` |
| Apple `/directions?destination=<place>` | open as-is | → `google.com/maps/dir/?api=1&destination=<place>&dir_action=navigate` |
| Google `dir/?api=1&destination=<place>` | open as-is (Google Maps installed) | open as-is |
| Google short link (`maps.app.goo.gl`) | open as-is | open as-is |

**Known limit:** short links (`maps.app.goo.gl`, `goo.gl/maps`) hide the destination, so
they **cannot be converted cross-provider** without resolving them server-side (which we
don't do — they resolve on the target device). In that case we open them as-is and let the
OS pick the app.

---

## Test link corpus (for Phase 4)

Representative links to validate the parser against:

Good (should be accepted):
- `https://www.google.com/maps/dir/?api=1&origin=Toronto&destination=Montreal&travelmode=driving`
- `https://www.google.com/maps/dir/?api=1&destination=Niagara+Falls&dir_action=navigate`
- `https://www.google.com/maps/dir/?api=1&destination=Montreal&waypoints=Kingston|Ottawa&travelmode=driving`
- `https://www.google.com/maps/search/?api=1&query=best+poutine+near+me`
- `https://maps.app.goo.gl/AbCdEfGh123`
- `https://goo.gl/maps/xYz123`
- `https://maps.apple.com/?daddr=Niagara+Falls,+ON`
- `https://maps.apple.com/?saddr=Toronto&daddr=Montreal&dirflg=d`
- `https://maps.apple.com/directions?destination=Montreal&mode=driving`
- `https://maps.apple.com/directions?destination=Montreal&waypoint=Kingston&mode=driving`

Typed-destination (should generate a valid link):
- `Tim Hortons near me` → Google search URL or Apple `directions?destination=…`
- `Niagara Falls, ON` → Google `dir/?api=1&destination=…` or Apple `directions?destination=…`

Bad (should be rejected with a clear message):
- (empty string)
- `https://example.com/not-a-map`
- `not a url at all`
- `javascript:alert(1)`
- `data:text/html,hello`

---

## Open questions / known limits

- **Apple Maps on Android:** no native app; falls back to web. Mitigation: detect the
  driver's OS and convert to Google Maps when possible (§6).
- **iOS 18.4+ unified Maps URL:** newer schema may supersede some `daddr` forms; store
  pasted links verbatim, and only *generate* the unified form for typed destinations.
- **Short-link resolution:** `maps.app.goo.gl` links resolve on the *target* device; store
  as-is, never resolve server-side, and never try cross-provider conversion on them.
- **Room cleanup:** Firebase free tier has no server for cron; expiry will be client-driven
  (a client that sees an expired room clears it) or via a scheduled Cloud Function if
  needed later.
- **Straight-to-nav only works when the phone has a current location**; otherwise the link
  falls back to a route preview (both Google and Apple document this). Acceptable.
