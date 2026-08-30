# Research Notes — Route Relay

Findings that informed the plan, with sources. Current as of 2026-08-30.

---

## 1. Hosting a static site (GitHub Pages)

- GitHub Pages serves static files over HTTPS for free, from a repository branch
  (e.g. `main` root or `/docs`).
- Pages requires the repository to be **public** for free hosting; private repos need a
  paid plan. We chose a public repo (the app itself is code-only; the trip *data* lives
  in a SQLite file on the droplet, not the repo).
- Pages is static-only: **no server-side code or secrets** can run. This pushes the
  shared-state problem to the droplet's self-hosted SQLite API (see §2).

## 2. Realtime shared state (decision: self-hosted SQLite)

Sources: Firebase pricing/docs (verified Aug 2026), Bytebase "Supabase vs Firebase"
(updated 2025), AgentDeals 2026 comparison.

The plan originally chose **Firebase Realtime Database**; in Phase 3 we **pivoted to a
self-hosted SQLite API on the droplet** (`backend/server.js`, Node `node:http` +
`node:sqlite`, zero npm deps). Why:

- **No Google account required.** Firebase needs the owner's login to create a project —
  the one blocker we couldn't get around. SQLite is fully self-contained.
- **Zero-ops is unnecessary here.** Three phones polling every ~1.2s is trivial load; we
  don't need a managed realtime service for a one-week trip.
- **Realtime ≈ polling.** SQLite can't push, so the client polls `GET …/routes` every
  ~1.2s. That meets the "appears within ~1s" acceptance bar with far less code than
  WebSockets/SSE.

Historical comparison (kept for reference if the owner later wants a managed backend):
- **Firebase Realtime Database** — purpose-built realtime + offline, a JSON tree with live
  listeners. Its free "Spark" tier (100 connections, 1 GB storage, 10 GB/month download)
  was always ample for 3 phones. Caveat: Firebase removed Cloud Storage from Spark in Feb
  2026 (irrelevant — we only store JSON).
- **Supabase** — open-source Postgres + Realtime channel; the documented fallback if
  open-source/Postgres is preferred later.

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
- Everyone on this trip uses an iPhone, so `maps.apple.com` always opens Apple Maps.
  Google Maps links open the Google Maps app, which is also installed on iOS. No
  cross-provider conversion is needed.

## 5. Why "tap a link → native app" works with no code

On iOS, `https` links to `maps.apple.com` / `www.google.com/maps` are **universal links**.
When the driver taps one, iOS opens the installed maps app directly. This is what lets the
driver's phone hand off to CarPlay with zero custom URL-scheme handling.

The CarPlay constraint that motivates the whole app: **only one phone is mirrored to the
car display at a time.** Everyone else is a passenger. Route Relay is the control surface
that lets passengers queue suggestions and the driver apply them with one tap on the
*mirrored* phone.

---

## 6. Feature research — what actually helps 3 people in a car

Research + reasoning on which features earn their place, prioritized for our scale
(3 trusted people, same car, all on iPhones, security not a concern).

### Must-have (v1 — the core loop)

| Feature | Why | How |
|---------|-----|-----|
| **Type a destination** (not just paste a link) | Passengers usually say "let's hit a Tim Hortons", not paste a URL | App builds `maps.apple.com/directions?destination=…` or `google.com/maps/dir/?api=1&destination=…` from free text |
| **Paste a link** | For pre-researched spots / shared links | classify Google vs Apple vs unknown |
| **One-tap → straight to navigation** | "Switching is one tap" is the whole point | append `dir_action=navigate` (Google) / `start=N` (Apple) |
| **Big touch targets + dark mode** | Driver is glove-friendly, night driving | mobile-first CSS, high contrast |

### Should-have (v1.5 — trip polish)

| Feature | Why | How |
|---------|-----|-----|
| **Multistop itinerary** | "gas → food → hotel" as one ordered trip | build a single multi-waypoint URL (Google `waypoints` / Apple `waypoint`) |
| **Destination vs. waypoint** | distinguish "our new destination" from "a stop along the way" | `kind` field on each route |
| **Active-route highlight** | everyone sees what the driver is currently navigating | `status: active` |
| **Mark done / remove** | keep the queue from getting stale | `status: done` / `removed`, synced |
| **Keep screen awake** | driver's queue shouldn't sleep mid-drive | Screen Wake Lock API (with graceful fallback) |

### Nice-to-have (later / only if asked)

| Feature | Notes |
|---------|-------|
| Subtle "new suggestion" sound | driver might miss it otherwise; keep optional/silent-by-default |
| Route preview thumbnails | needs map APIs/keys — skip for v1 |
| Trip history / saved routes | out of scope for a temporary trip tool |
| Offline cache of past trips | RTDB already caches offline; extra value is low |

### No cross-provider conversion needed

Everyone on the trip uses an iPhone, and both Google Maps and Apple Maps are installed on
iOS. A Google Maps link opens Google Maps; an Apple Maps link opens Apple Maps. No
conversion is required — we still record `provider` per route so we can show a sensible
label/icon.

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

Parser behaviour notes (Phase 4):
- `link-parser.js` is the single implementation; `scripts/test-link-parser.js` runs this
  corpus (22 assertions) and must stay green when the parser changes.
- A string with an explicit scheme (`javascript:`, `data:`, `http:`, …) or a bare-hostname
  shape is treated as a *link* and validated against the known-hosts allowlist. `https`
  only — `http` is rejected with a prompt to use https.
- "not a url at all" and other plain text are treated as *typed destinations* in the
  submit flow (they generate a link), so they're only "bad" in the link-classifier sense
  (`classifyLink()` returns `null`). Empty input is the one case the submit flow rejects
  outright.
- Short links (`maps.app.goo.gl`, `goo.gl/maps`) are stored verbatim; the parser never
  resolves them (they resolve on the target device).

---

## Open questions / known limits

- **iOS 18.4+ unified Maps URL:** newer schema may supersede some `daddr` forms; store
  pasted links verbatim, and only *generate* the unified form for typed destinations.
- **Short-link resolution:** `maps.app.goo.gl` links resolve on the *target* device; store
  as-is and never resolve server-side.
- **Room cleanup:** deferred to Phase 7. With the self-hosted SQLite backend this is a
  simple server-side sweep (delete rows with `updated_at` older than a cutoff, run on a
  timer or at startup) — no Cloud Function needed.
- **Straight-to-nav only works when the phone has a current location**; otherwise the link
  falls back to a route preview (both Google and Apple document this). Acceptable.
