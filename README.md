# Route Relay

Shared turn-by-turn route handoff for road trips.

**Status: Planning / documentation only.** No application code has been written yet.
This repository currently holds the project plan, architecture decisions, and research
notes so that future sessions can build the app phase by phase.

---

## The problem

On a road trip, only **one** phone's GPS (Google Maps or Apple Maps) is mirrored to the
car display via CarPlay / Android Auto. Everyone else in the car is a passenger who
sees a better route, a shortcut, or a stop worth making — but getting that route onto
the driver's screen means:

1. interrupting the driver,
2. taking their phone,
3. searching for the destination,
4. starting navigation again.

That's slow, unsafe, and kills the fun of a spontaneous road trip.

## What this project does

Route Relay is a lightweight, mobile-friendly web app where:

- **Passengers** paste a Google Maps or Apple Maps link (with an optional label) to
  suggest a new route or stop.
- **The driver** opens the same shared page on their own phone and sees a live list of
  suggested routes. Tapping one launches it in Google Maps / Apple Maps on the driver's
  phone, which immediately appears on the car display.
- **Switching navigation is one tap** — no searching, no hand-off of the phone.

## Design goals

- **Mobile-first** — works in Safari (iOS) and Chrome (Android).
- **Minimal security** — it's a temporary, invite-only tool for a handful of people on
  the same trip. No accounts. Access is gated by a shared, unguessable trip code / URL.
- **Zero server maintenance** — static frontend on GitHub Pages plus a free realtime
  backend (Firebase Realtime Database) for the shared list.
- **Instant sync** — when a passenger adds a route, it appears on the driver's screen
  immediately.

## Repository layout

```
roadtrip-route-relay/
├── README.md                 ← you are here
├── index.html                ← placeholder landing page (so GitHub Pages resolves)
├── docs/
│   ├── PLAN.md               ← phased execution plan (start here to build)
│   ├── ARCHITECTURE.md       ← technical decisions and data model
│   ├── RESEARCH.md           ← findings and sources that informed the plan
│   └── SECURITY.md           ← the "minimal security" model and its tradeoffs
└── (future: src/, public/, etc. — created in Phase 2+)
```

## Where to start

1. Read [`docs/PLAN.md`](docs/PLAN.md) for the phased build plan.
2. Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the technical approach.
3. Read [`docs/RESEARCH.md`](docs/RESEARCH.md) for the why-behind-the-choices.

## Quick answers

| Question | Answer |
|----------|--------|
| Hosting | GitHub Pages (free, HTTPS) |
| Frontend | Static, mobile-first (vanilla HTML/CSS/JS to start; PWA-able) |
| Shared state | Firebase Realtime Database (free Spark tier) |
| Auth | None. Shared trip code / URL (see `docs/SECURITY.md`) |
| Map providers | Google Maps + Apple Maps deep links (both handled) |
| Status | Documentation only — no code yet |

## Live site

Once deployed: <https://automated-freak.github.io/roadtrip-route-relay/>

## License

Not yet chosen (decided in a later phase). Treat as all-rights-reserved for now.
