# Architecture — Route Relay

Technical approach and the decisions behind it.

---

## High-level shape

```
Passenger phones                Driver phone                Car display
(anyone in the car)             (the nav device)            (CarPlay / Android Auto)
      │                              │                            ▲
      │  paste Google/Apple link     │  tap a route →              │
      │                              │  native maps app launches   │
      ▼                              ▼                            │
┌───────────────────────────────────────────────────┐            │
│  Route Relay (static web app)                     │────────────┘
│  - passenger view: submit route                   │
│  - driver view: live queue, one-tap launch        │
└───────────────┬───────────────────────────────────┘
                │ realtime subscribe/write
                ▼
   Firebase Realtime Database ("trip rooms")
   - free tier, realtime push, no server to run
```

Key insight: **Route Relay never draws its own map.** It is a control surface. It stores
and presents map links, then hands them off to the native maps app on the driver's phone,
which is already mirrored to the car. This keeps the app tiny, free, and cross-platform.

---

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Hosting | GitHub Pages | Free, HTTPS, zero-ops, works with a static site |
| Frontend | Plain HTML/CSS/JS (v1) | No build step, easy to audit, fast on mobile. Optional PWA manifest for "Add to Home Screen." A framework (e.g. Preact/Svelte) can be added later only if complexity demands it. |
| Shared state | Firebase Realtime Database | Purpose-built for realtime push + offline support; free Spark tier; no backend to deploy. See "Backend options" below. |
| Auth | None (shared trip code) | Minimal-security requirement — see `SECURITY.md` |
| Maps | Google + Apple deep links | Handled as data, not SDKs. No API key required. |

---

## Data model (Realtime Database)

```
/trips
  /<tripCode>            # short, unguessable code (e.g. "X7K2Q")
    meta:
      createdAt: <ISO>
      expiresAt: <ISO>   # room auto-expiry
    routes:
      /<routeId>
        label: "Scenic detour to the lake"
        url: "https://maps.app.goo.gl/..."   # canonical link
        provider: "google" | "apple" | "other"
        status: "pending" | "active" | "done" | "removed"
        author: "Sam"           # optional nickname
        createdAt: <ISO>
        updatedAt: <ISO>
```

Notes:
- `tripCode` is generated client-side from a cryptographically random source and embedded
  in the share URL, e.g. `…/#/trip/X7K2Q`. The hash keeps the code out of server logs.
- `status` lets the driver mark the active route and clear completed ones.
- Realtime listeners mean any client update is pushed to all connected clients instantly.

---

## Backend options (evaluated)

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **Firebase Realtime Database** | Real-time push, offline, free tier, mobile-first, zero-ops | Google-managed; proprietary | ✅ **Recommended** |
| Firebase Firestore | Richer queries | Slightly heavier; realtime is a bolt-on vs RTDB's core | Alternative |
| Supabase | Open source, Postgres, SQL, Realtime channel | Free tier rate-limits; more setup for pure realtime | Good alternative if open-source/Postgres preferred |
| Self-hosted server | Full control | Violates "zero maintenance"; needs a host + TLS | ❌ Not for v1 |
| LocalStorage only | Trivial | Not shared across devices — defeats the purpose | ❌ |

**Why Firebase Realtime Database:** the entire product is "everyone sees the same list,
updates appear immediately." RTDB was built for exactly that and is free at this scale
(no auth, a handful of users, temporary rooms). A future migration path to Supabase is
documented if the owner later wants open-source/Postgres.

---

## Deep-link handoff (how switching works)

The driver taps a route → the app opens the stored URL (`window.location.href = url` or an
anchor click). Because these are **universal links / app links**, the OS routes them to the
installed maps app:

- **Google Maps links** (`www.google.com/maps/...`, `maps.app.goo.gl/...`, `goo.gl/maps/...`)
  open the Google Maps app on both iOS and Android.
- **Apple Maps links** (`maps.apple.com/?daddr=...`) open Apple Maps on iOS. On Android,
  Apple Maps has no app, so they fall back to the browser.

No custom URL schemes or API keys are required. Full reference details are in
`RESEARCH.md`.

---

## Security posture (summary)

- No user accounts, no passwords.
- Access = knowing the trip code (unguessable) + optional short PIN.
- Rooms auto-expire.
- See `SECURITY.md` for the full model and its explicit tradeoffs.

---

## Project conventions (for future sessions)

- `main` is the default and only protected branch; feature work uses `openclaw/<topic>`
  branches.
- No secrets in git. Firebase config goes in a committed `docs/SETUP.md` template with
  placeholder values; the real config is injected at build/run time (or documented locally).
- Small, reviewable commits at each phase boundary.
- Prefer plain HTML/CSS/JS for v1; add a framework or build tool only if a phase's
  requirements clearly justify it.
