# Research Notes — Route Relay

Findings that informed the plan, with sources. Current as of 2026-08-29.

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

Sources: Bytebase "Supabase vs Firebase" comparison (updated 2025), WeWeb 2026 comparison,
TrustRadius reviewer roundup.

- **Firebase** = purpose-built realtime + offline + mobile-first. Its Realtime Database
  is a JSON tree with real-time listeners — ideal for "everyone sees the same list,
  instantly."
- **Supabase** = open-source Postgres with a Realtime channel; better for SQL/relational
  needs, open-source control, and predictable pricing.
- **Decision:** Firebase Realtime Database for v1 (matches the core realtime requirement,
  free tier, zero-ops). Supabase documented as the fallback if open-source/Postgres is
  preferred later.

## 3. Google Maps deep links

Source: Google for Developers — "Maps URLs" and "Google Maps URL Scheme for iOS".

Supported formats:
- Universal links: `https://www.google.com/maps/...` (open Google Maps app on iOS/Android).
- Short share links: `https://maps.app.goo.gl/...` and `https://goo.gl/maps/...`.
- Cross-platform directions URL:
  `https://www.google.com/maps/dir/?api=1&origin=<...>&destination=<...>&travelmode=driving`.
- iOS URL schemes (`comgooglemaps://`, `comgooglemapsurl://`) exist for native-only
  features like turn-by-turn, but **we don't need them** — presenting the https link is
  enough for the OS to hand off to the app.

Key point: **no API key is required** to construct or open these links.

## 4. Apple Maps deep links

Sources: Apple "Map Links" URL scheme reference; Apple Developer Forums thread #784030;
"Adopting unified Maps URLs" (MapKit).

Supported format:
- `https://maps.apple.com/?daddr=<destination>` — directions from current location.
  Optional `saddr=<origin>` and `dirflg=d|w|r` (drive/walk/transit).

Important caveat (from the Apple Developer Forums, May 2025):
- Raw `daddr=<lat>,<lng>` coordinate URLs regressed on newer iOS; Apple recommends the
  **unified Maps URL** schema introduced in iOS 18.4.
- Practical implication: prefer human-readable address strings or the unified schema for
  destinations; when a passenger pastes a `maps.apple.com` link, store and replay it
  verbatim rather than re-parsing coordinates.

Platform note:
- `maps.apple.com` opens Apple Maps on iOS. On Android there is **no Apple Maps app**, so
  the link falls back to the browser. The app should detect this and warn Android users
  to use Google Maps links instead.

## 5. Why "tap a link → native app" works with no code

On modern iOS and Android, `https` links to `maps.apple.com` / `www.google.com/maps` are
**universal links / app links**. When the driver taps one, the OS opens the installed maps
app directly. This is what lets the driver's phone hand off to CarPlay / Android Auto with
zero custom URL-scheme handling.

---

## Test link corpus (for Phase 4)

Representative links to validate the parser against:

Good (should be accepted):
- `https://www.google.com/maps/dir/?api=1&origin=Toronto&destination=Montreal&travelmode=driving`
- `https://maps.app.goo.gl/AbCdEfGh123`
- `https://goo.gl/maps/xYz123`
- `https://maps.apple.com/?daddr=Niagara+Falls,+ON`
- `https://maps.apple.com/?saddr=Toronto&daddr=Montreal&dirflg=d`

Bad (should be rejected with a clear message):
- (empty string)
- `https://example.com/not-a-map`
- `not a url at all`

---

## Open questions / known limits

- **Apple Maps on Android:** no native app; falls back to web. Mitigation: detect OS and
  warn.
- **iOS 18.4+ unified Maps URL:** newer schema may supersede some `daddr` forms; handle
  verbatim and avoid re-parsing coordinates.
- **Short-link resolution:** `maps.app.goo.gl` links resolve on the *target* device; we
  store them as-is and never need to resolve them server-side.
- **Room cleanup:** Firebase free tier has no server for cron; expiry will be client-driven
  (a client that sees an expired room clears it) or via a scheduled Cloud Function if
  needed later.
