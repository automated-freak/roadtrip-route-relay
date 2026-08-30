# Architecture — Route Relay

Technical approach and the decisions behind it.

---

## High-level shape

```
Passenger phones                Driver phone                Car display
(anyone in the car)             (the nav device)            (CarPlay)
      │                              │                            ▲
      │  type/paste destination      │  tap a route →              │
      │  (Google/Apple link)         │  native maps app launches   │
      ▼                              ▼                            │
┌───────────────────────────────────────────────────┐            │
│  Route Relay (static web app)                     │────────────┘
│  - passenger view: type/paste, queue              │
│  - driver view: live queue, one-tap launch        │
└───────────────┬───────────────────────────────────┘
                │ poll + write (HTTPS)
                ▼
   Route Relay API + SQLite  (self-hosted on a droplet)
   - tiny Node server, ~1.2s polling, zero npm deps
```

Key insight: **Route Relay never draws its own map.** It is a control surface. It stores
and presents map links, then hands them off to the native maps app on the driver's phone,
which is already mirrored to the car. This keeps the app tiny and free.

---

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Hosting | GitHub Pages | Free, HTTPS, zero-ops, works with a static site |
| Frontend | Plain HTML/CSS/JS (v1) | No build step, easy to audit, fast on mobile. Optional PWA manifest for "Add to Home Screen." A framework (e.g. Preact/Svelte) can be added later only if complexity demands it. |
| Shared state | SQLite + thin Node API (self-hosted) | A tiny REST server (`node:http` + `node:sqlite`, zero npm deps) on a droplet; the client polls every ~1.2s. Chosen for a 3-person, one-week trip: no Google account, no external service, full control. See "Backend choice" below. |
| Auth | None (shared trip code) | Minimal-security requirement — see `SECURITY.md` |
| Maps | Google + Apple deep links | Handled as data, not SDKs. No API key required. |

---

## Roles & device model

The app has **two roles**, but they are *not* fixed accounts — they're flags on a person's
presence in the trip:

- **Driver** — the person whose phone is mirrored to the car (CarPlay).
  Their device runs the driver view: large one-tap queue.
- **Passenger** — everyone else. Their devices run the passenger view: type/paste, see the queue.

Rules:
- Roles are **per-device and self-selected** at join time ("I'm driving" / "I'm riding").
  One driver per trip is the norm, but we don't enforce it (3 trusted people).
- Everyone on the trip uses an iPhone, so both **Google Maps and Apple Maps are available
  on every device**. A tap opens whichever app the link belongs to — no conversion needed.
- Anyone (including the driver) can submit a route; passengers are the primary submitters.

---

## Data model (SQLite)

One table, `routes`. There is no `trips` or `members` table — trip isolation is just a
`trip_code` column, and nicknames are stored inline on each route. This matches the
throwaway scale (no presence tracking, no accounts).

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT (PK) | server-generated UUID |
| `trip_code` | TEXT | short, unguessable code (e.g. `X7K2Q`); indexed |
| `label` | TEXT | optional free text |
| `url` | TEXT | canonical link, stored as-is |
| `provider` | TEXT | `google` \| `apple` \| `text` \| `other` |
| `kind` | TEXT | `destination` \| `waypoint` |
| `status` | TEXT | `pending` \| `active` \| `done` \| `removed` |
| `author` | TEXT | nickname of the submitter |
| `sort_order` | INTEGER | higher = newer = top of list |
| `created_at` / `updated_at` | INTEGER | epoch ms |

Notes:
- `trip_code` is generated client-side from a CSPRNG and embedded in the share URL as a
  hash fragment, e.g. `…/#/trip/X7K2Q` — the hash keeps the code out of server logs.
- `kind` separates "our new destination" from "a stop along the way"; it enables the
  multistop itinerary later.
- `sort_order` gives a stable, reorderable list (the reorder endpoint rewrites it).
- The client polls `GET /api/trips/:code/routes` every ~1.2s; any update appears on other
  devices within ~1 second.

---

## Backend choice: self-hosted SQLite + thin API

The original plan used **Firebase Realtime Database**, but we pivoted to a **self-hosted
SQLite API on the droplet** (Phase 3). Rationale:

- **No external account needed.** Firebase requires the owner's Google login to create a
  project — a real blocker for a one-week, three-person trip. A SQLite file + a tiny Node
  server is entirely self-contained.
- **Zero dependencies.** Node's built-in `node:http` + `node:sqlite` mean no `npm install`,
  no SDK, no vendor lock-in.
- **Right-sized for the scale.** Three phones polling every ~1.2s is trivial load; SQLite
  handles it without any of Firebase's setup (rules, project config, billing tier).
- **Realtime via polling, not push.** SQLite has no push mechanism, so the client polls.
  At ~1.2s the "appears within ~1s" requirement is met in practice, with far less code than
  WebSockets/SSE.

Tradeoffs (accepted): the droplet must be reachable over HTTPS (mobile mixed-content), and
there is now a small server to keep running for the trip. For a throwaway that's fine; see
`docs/SETUP.md`. If the owner later wants a managed, always-on backend, Supabase (or
Firebase) is the documented migration path — the route schema maps cleanly.

---

## Deep-link handoff (how switching works)

The driver taps a route → the app opens a URL. Because these are **universal links / app
links**, the OS routes them to the installed maps app, which is mirrored to the car.

The handoff has two steps, applied at tap time on the **driver's** device:

1. **Normalize for one-tap navigation.** If we can safely do so, append the
   straight-to-navigation flag:
   - Google: add `dir_action=navigate` → launches turn-by-turn immediately.
   - Apple: add `start=3` (or leave as-is) → auto-begins navigation after a short delay.
   - We only add these when the link already points at a destination; we never mangle a
     short link.
2. **Open.** `window.location.href = url` (or an anchor tap). Because everyone is on an
   iPhone, the OS opens whichever maps app the link belongs to. If no maps app is
   installed, the OS falls back to the browser — we detect this and show a hint.

No custom URL schemes or API keys are required. Full reference details are in
`RESEARCH.md`.

---

## Security posture (summary)

- No user accounts, no passwords.
- Access = knowing the trip code (unguessable); the API is unauthenticated (open CORS),
  so the trip code is the only gate.
- Input is validated on render (labels render as text, XSS-safe); link validation is Phase 4.
- Rooms auto-expire server-side (Phase 7): routes idle longer than `STALE_HOURS` (default
  7 days) are swept on startup and hourly — no client-driven expiry.
- See `SECURITY.md` for the full model and its explicit tradeoffs.

---

## Project conventions (for future sessions)

- `main` is the default branch; feature work uses `openclaw/<topic>` branches.
- No secrets in git. The SQLite DB file lives under `backend/data/` (gitignored). The API
  base URL goes in `config.js` (committed with a placeholder; set the real value before use).
- Small, reviewable commits at each phase boundary.
- Prefer plain HTML/CSS/JS for v1; add a framework or build tool only if a phase's
  requirements clearly justify it.
- Track progress in the **handoff ledger** at the top of `docs/PLAN.md` (see below).
