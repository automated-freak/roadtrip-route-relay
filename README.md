# Route Relay

Shared turn-by-turn route handoff for road trips.

**Status: Phase 7 complete — hardening, security & edge cases.** The full loop is
built: passengers type/paste stops (Google/Apple deep links), the driver gets a live
queue with one-tap navigation and a combined multistop itinerary, and the backend
self-cleans stale trips. Remaining: deploy + on-device iOS E2E (Phase 8).

---

## The problem

On a road trip, only **one** phone's GPS (Google Maps or Apple Maps) is mirrored to the
car display via CarPlay. Everyone else in the car is a passenger who
sees a better route, a shortcut, or a stop worth making — but getting that route onto
the driver's screen means:

1. interrupting the driver,
2. taking their phone,
3. searching for the destination,
4. starting navigation again.

That's slow, unsafe, and kills the fun of a spontaneous road trip.

## What this project does

Route Relay is a lightweight, mobile-friendly web app where:

- **Passengers** type a destination ("Tim Hortons near me") or paste a Google Maps /
  Apple Maps link (with an optional label) to suggest a new stop or destination.
- **The driver** opens the same shared page on their own phone and sees a live queue of
  suggestions. Tapping one launches it — straight into turn-by-turn navigation — in
  Google Maps / Apple Maps on the driver's phone, which immediately appears on the car
  display.
- **Switching navigation is one tap** — no searching, no hand-off of the phone.

Collaboration features for a small group (≈3 people in the same car, all on iPhones):

- **Type a destination or paste a link** — works with both Google Maps and Apple Maps.
- **Build a multistop itinerary** (gas → food → hotel) and launch it as one route.

## Design goals

- **Mobile-first** — works in Safari on iPhone (iOS).
- **Minimal security** — it's a temporary, invite-only tool for a handful of people on
  the same trip. No accounts. Access is gated by a shared, unguessable trip code / URL.
- **Throwaway-friendly** — static frontend on GitHub Pages plus a tiny self-hosted
  SQLite API (Node, zero dependencies) for the shared list. Built for a small group on a
  single trip; not meant to be maintained long-term.
- **Instant sync** — when a passenger adds a route, it appears on the driver's screen
  immediately.

## Repository layout

```
roadtrip-route-relay/
├── README.md                 ← you are here
├── index.html                ← static app shell (all 3 screens)
├── styles.css                ← mobile-first, dark-mode + safe-area styles
├── app.js                    ← view logic + API client (polls the backend)
├── link-parser.js            ← link classifier + deep-link generator (Phase 4)
├── config.js                 ← runtime config (API base URL — set before deploy)
├── manifest.webmanifest      ← PWA manifest
├── sw.js                     ← service worker (offline shell)
├── icons/                    ← app icons (192/512/maskable/apple-touch)
├── scripts/gen-icons.py      ← regenerates the icons
├── scripts/test-link-parser.js ← runs the Phase 4 test-link corpus
├── backend/
│   ├── server.js             ← SQLite REST API (Node, zero npm deps)
│   └── README.md             ← how to run + expose it
└── docs/
    ├── PLAN.md               ← phased execution plan (start here to build)
    ├── ARCHITECTURE.md       ← technical decisions and data model
    ├── RESEARCH.md           ← findings and sources that informed the plan
    ├── SECURITY.md           ← the "minimal security" model and its tradeoffs
    └── SETUP.md              ← run/deploy the backend + set the API base URL
```

## Where to start

1. Read [`docs/PLAN.md`](docs/PLAN.md) for the phased build plan and the **handoff
   ledger** (each phase is designed to be completed in its own conversation).
2. Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the technical approach.
3. Read [`docs/RESEARCH.md`](docs/RESEARCH.md) for the why-behind-the-choices.

## Quick answers

| Question | Answer |
|----------|--------|
| Hosting | Frontend: GitHub Pages (free, HTTPS). Backend: SQLite API on a droplet |
| Frontend | Static, mobile-first (vanilla HTML/CSS/JS; PWA manifest + icons + service worker) |
| Shared state | Self-hosted SQLite + thin Node API (zero npm deps) |
| Auth | None. Shared trip code / URL (see `docs/SECURITY.md`) |
| Map providers | Google Maps + Apple Maps deep links (both handled on iOS) |
| Collaboration | Multistop itinerary, one-tap navigation |
| Status | Phase 7 complete — hardening, security & edge cases |

## Live site

Once deployed: <https://automated-freak.github.io/roadtrip-route-relay/>

## License

Not yet chosen (decided in a later phase). Treat as all-rights-reserved for now.
