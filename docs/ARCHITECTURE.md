# Architecture — Route Relay

Technical approach and the decisions behind it.

---

## High-level shape

```
Passenger phones                Driver phone                Car display
(anyone in the car)             (the nav device)            (CarPlay / Android Auto)
      │                              │                            ▲
      │  type/paste destination      │  tap a route →              │
      │  (Google/Apple link)         │  native maps app launches   │
      ▼                              ▼                            │
┌───────────────────────────────────────────────────┐            │
│  Route Relay (static web app)                     │────────────┘
│  - passenger view: type/paste, vote, queue        │
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

## Roles & device model

The app has **two roles**, but they are *not* fixed accounts — they're flags on a person's
presence in the trip:

- **Driver** — the person whose phone is mirrored to the car (CarPlay / Android Auto).
  Their device runs the driver view: large one-tap queue.
- **Passenger** — everyone else. Their devices run the passenger view: type/paste, vote,
  see the queue.

Rules:
- Roles are **per-device and self-selected** at join time ("I'm driving" / "I'm riding").
  One driver per trip is the norm, but we don't enforce it (3 trusted people).
- The **driver's platform** (`ios` / `android`) is what determines which maps app a tap
  launches, so it drives cross-provider conversion (see "Deep-link handoff").
- Anyone (including the driver) can submit a route; passengers are the primary submitters.

---

## Data model (Realtime Database)

```
/trips
  /<tripCode>            # short, unguessable code (e.g. "X7K2Q")
    meta:
      createdAt: <ISO>
      expiresAt: <ISO>   # room auto-expiry
    members:
      /<memberId>        # e.g. "sam-8f3a"
        name: "Sam"
        role: "driver" | "passenger"
        platform: "ios" | "android"
        lastSeen: <ISO>
    routes:
      /<routeId>
        label: "Scenic detour to the lake"     # optional, free text
        url: "https://maps.app.goo.gl/..."     # canonical link, stored as-is
        provider: "google" | "apple" | "other"
        kind: "destination" | "waypoint"       # new destination vs stop along the way
        status: "pending" | "active" | "done" | "removed"
        votes: 2                               # simple count (client guards one vote/person)
        author: "Sam"                          # nickname of the submitter
        createdAt: <ISO>
        updatedAt: <ISO>
```

Notes:
- `tripCode` is generated client-side from a cryptographically random source and embedded
  in the share URL, e.g. `…/#/trip/X7K2Q`. The hash keeps the code out of server logs.
- `kind` separates "this is our new destination" (`destination`) from "this is a stop
  along the way" (`waypoint`). It's how we later build a multi-stop itinerary.
- `votes` is a plain counter for v1 — a client records that it has voted in `localStorage`
  to prevent double-voting. (A per-member map is over-engineering at 3-person scale.)
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
(no auth, a handful of users, temporary rooms — 3 connections vs a 100-connection Spark
limit). A future migration path to Supabase is documented if the owner later wants
open-source/Postgres.

---

## Deep-link handoff (how switching works)

The driver taps a route → the app opens a URL. Because these are **universal links / app
links**, the OS routes them to the installed maps app, which is mirrored to the car.

The handoff has three steps, applied at tap time on the **driver's** device:

1. **Normalize for one-tap navigation.** If we can safely do so, append the
   straight-to-navigation flag:
   - Google: add `dir_action=navigate` → launches turn-by-turn immediately.
   - Apple: add `start=3` (or leave as-is) → auto-begins navigation after a short delay.
   - We only add these when the link already points at a destination; we never mangle a
     short link.
2. **Cross-provider fallback.** If the route's provider can't open on the driver's device
   (e.g. an Apple link on Android), convert to the driver's maps app when the destination
   is extractable (see `RESEARCH.md` §6 conversion table). Short links can't be converted,
   so they open as-is.
3. **Open.** `window.location.href = url` (or an anchor tap). If no maps app is installed,
   the OS falls back to the browser — we detect this and show a hint.

No custom URL schemes or API keys are required. Full reference details are in
`RESEARCH.md`.

---

## Security posture (summary)

- No user accounts, no passwords.
- Access = knowing the trip code (unguessable) + optional short PIN.
- Rooms auto-expire.
- Input is validated to map domains only; labels render as text (XSS-safe).
- See `SECURITY.md` for the full model and its explicit tradeoffs.

---

## Project conventions (for future sessions)

- `main` is the default branch; feature work uses `openclaw/<topic>` branches.
- No secrets in git. Firebase config goes in a committed `docs/SETUP.md` template with
  placeholder values; the real config is injected at build/run time (or documented locally).
- Small, reviewable commits at each phase boundary.
- Prefer plain HTML/CSS/JS for v1; add a framework or build tool only if a phase's
  requirements clearly justify it.
- Track progress in the **handoff ledger** at the top of `docs/PLAN.md` (see below).
