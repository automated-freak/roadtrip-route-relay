# Project Plan — Route Relay

This is the phased execution plan. Work through the phases **in order**. Each phase is
independently verifiable and ends with a concrete "definition of done" so future
sessions can pick up exactly where the last one left off.

> **Rule:** No phase is complete until its "Definition of done" checklist is fully met.
> Prefer small, reviewable changes over big-bang rewrites.

---

## 🗂️ Handoff ledger

This ledger is the source of truth for **what's done, what's next, and how to pick up the
work in a fresh conversation.** The project is designed so each phase can be handled in a
new session.

**How to use it:**

1. **Starting a session:** read this ledger first, then the phase marked "In progress" (or
   the first "Not started" phase). Read `docs/ARCHITECTURE.md` and `docs/RESEARCH.md` for
   context.
2. **Working:** build only the current phase. Small commits. Verify against the phase's
   Definition of done.
3. **Finishing a phase:** check off its Definition-of-done items, update its row below
   (status → Done, date, summary), write a one-line handoff note for the *next* phase, and
   commit. Mark the next phase "In progress" only if you are actually starting it.
4. **Stuck or blocked:** note it in the ledger row so the next session doesn't rediscover
   the problem.

| # | Phase | Status | Last worked | Outcome / notes | Handoff to next session |
|---|-------|--------|-------------|-----------------|--------------------------|
| 0 | Foundation & tooling | ✅ Done | 2026-08-29 | Repo + docs + placeholder `index.html` created; Pages enabled | Start Phase 1 |
| 1 | Product spec & UX wireframes | ⬜ Not started | — | — | — |
| 2 | Frontend shell | ⬜ Not started | — | — | — |
| 3 | Backend integration (realtime) | ⬜ Not started | — | — | — |
| 4 | Route submission & parsing | ⬜ Not started | — | — | — |
| 5 | Driver queue & one-tap handoff | ⬜ Not started | — | — | — |
| 6 | Collaboration polish | ⬜ Not started | — | — | — |
| 7 | Hardening & edge cases | ⬜ Not started | — | — | — |
| 8 | Deploy & handoff | ⬜ Not started | — | — | — |

Legend: ✅ Done · 🔄 In progress · ⬜ Not started · ⚠️ Blocked

---

## Phase 0 — Foundation & tooling (DONE in this repo)

Set up the repository and the bare minimum so the project has a home and a live URL.

**Scope**
- Create the `roadtrip-route-relay` repository (public, so GitHub Pages is free).
- Add documentation: this plan, architecture, research notes, security model.
- Add a placeholder `index.html` so GitHub Pages serves something at the live URL.
- Enable GitHub Pages from the `main` branch (root).

**Definition of done**
- [x] Repo exists at `github.com/automated-freak/roadtrip-route-relay`
- [x] `README.md`, `docs/PLAN.md`, `docs/ARCHITECTURE.md`, `docs/RESEARCH.md`, `docs/SECURITY.md` present
- [x] Placeholder `index.html` present
- [x] GitHub Pages enabled and resolving at the live URL
- [x] Initial commit pushed to `main`

---

## Phase 1 — Product spec & UX wireframes

Turn the concept into concrete screens and interactions so the build doesn't drift.

**Scope**
- Define the two roles and the device model: **Driver** (the phone on the car display) and
  **Passenger** (everyone else). Roles are self-selected at join time, not accounts.
- Define the screens:
  1. **Landing / create-or-join trip** — generate or enter a trip code; choose "I'm driving"
     or "I'm riding"; pick nickname.
  2. **Passenger view** — big "Add a stop" button, **type-or-paste** field, optional label,
     optional "stop along the way vs new destination" toggle, vote buttons, live list.
  3. **Driver view** — large, glove-friendly queue, one-tap launch, active-route highlight,
     "mark done / clear" actions, screen stays awake.
- Sketch rough wireframes (text or simple SVG in `docs/wireframes/`).
- Write the acceptance criteria for each screen, including cross-provider and one-tap-nav
  behaviors from `docs/RESEARCH.md` §6.

**Definition of done**
- [ ] `docs/wireframes/` contains a wireframe for each screen
- [ ] `docs/PRODUCT_SPEC.md` written with roles, flows, and acceptance criteria
- [ ] Reviewed against `docs/ARCHITECTURE.md` for feasibility

---

## Phase 2 — Frontend shell (static, mobile-first, no backend)

Build the static site with mock data so the layout and interaction feel right before
any backend work.

**Scope**
- Create the static site structure (`src/`, `index.html` at root for Pages, or a build
  step if a framework is chosen — recommend plain HTML/CSS/JS for v1).
- Mobile-first responsive CSS: large touch targets, no horizontal scroll, dark mode
  friendly for night driving, safe-area handling for notched phones.
- Implement the three screens as static templates driven by a local JS mock store.
- Add a basic PWA manifest + app icons so it can be "Added to Home Screen."

**Definition of done**
- [ ] Site renders correctly at 375px and 390px widths (iPhone sizes) and on a desktop
- [ ] All interactions work with mocked data (no network)
- [ ] PWA manifest + icons present; "Add to Home Screen" works on at least one device
- [ ] Lighthouse mobile score ≥ 90 (performance/accessibility/best practices)

---

## Phase 3 — Backend integration (realtime shared state)

Wire the frontend to Firebase Realtime Database so the list is shared across devices in
real time.

**Scope**
- Create a Firebase project (Spark/free tier).
- Configure Realtime Database with **test-mode rules for development** (open read/write
  — see `docs/SECURITY.md`; tighten in Phase 7).
- Add a trip "room" concept: each trip is a node keyed by a short code.
- Replace the mock store with a realtime store: subscribe to the trip node, render
  updates live, handle reconnects and initial empty state.
- Keep Firebase config values out of source control (use a template / docs note).

**Definition of done**
- [ ] A route added on device A appears on device B within ~1 second, no refresh
- [ ] Trip rooms are isolated (code A can't see code B's routes)
- [ ] Firebase config not committed; setup steps documented in `docs/SETUP.md`
- [ ] Real app data renders in the three screens from Phase 2

---

## Phase 4 — Route submission & parsing

Make it trivial for passengers to submit a destination — **typed or pasted**.

**Scope**
- Accept **free-text destination** (e.g. "Tim Hortons near me") and turn it into a valid
  Google/Apple directions URL.
- Accept a **pasted link** (and/or a raw destination string).
- Classify the link: Google Maps vs Apple Maps vs unknown.
- Normalize common formats:
  - Google: `https://www.google.com/maps/...`, `https://maps.app.goo.gl/...`, `https://goo.gl/maps/...`, cross-platform `https://www.google.com/maps/dir/?api=1&...`
  - Apple: legacy `https://maps.apple.com/?daddr=...` (and `saddr`/`dirflg` variants), and the newer **unified Maps URL** format (`/directions?...` — iOS 18.4+; see `docs/RESEARCH.md`).
- Set the route's `kind` (destination vs waypoint) and `provider`.
- Store the canonical link + a user-supplied label + timestamp + author nickname (optional).
- Show helpful validation errors for unsupported/empty input (reject `javascript:`, `data:`, etc.).

**Definition of done**
- [ ] Google and Apple links are both accepted and correctly classified
- [ ] Typed destinations produce a valid Google and Apple URL
- [ ] Short links (`maps.app.goo.gl`) stored as-is (they resolve on the target device)
- [ ] A list of representative test links (good + bad) documented in `docs/RESEARCH.md`
- [ ] Validation errors are clear and non-blocking

---

## Phase 5 — Driver queue & one-tap handoff

Deliver the core value: one-tap route switching on the driver's phone.

**Scope**
- Driver view: live queue of routes, sorted by votes (then newest), manually reorderable.
- Tapping a route opens the deep link on the driver's phone (which launches the native
  maps app → CarPlay / Android Auto). No in-app map, no searching.
- **One-tap navigation:** append `dir_action=navigate` (Google) / `start=N` (Apple) so the
  tap jumps straight into turn-by-turn when possible.
- **Cross-provider fallback:** if the route's provider can't open on the driver's device,
  convert it when the destination is extractable (see `docs/RESEARCH.md` §6).
- Track an "active" route (the one currently navigating) and show it prominently.
- Allow marking routes done / removing them (with a lightweight confirmation to avoid
  accidental clears).
- **Keep screen awake** while the driver view is open (Screen Wake Lock API, graceful fallback).
- Handle the case where no maps app is installed (open in browser instead).

**Definition of done**
- [ ] Driver can launch any submitted route in ≤ 2 taps
- [ ] Straight-to-navigation works on Google (Android + iOS) and Apple (iOS)
- [ ] Cross-provider fallback works (Apple link → Google Maps on Android)
- [ ] Active route is visually distinct from the queue
- [ ] Done/remove actions work and sync to all devices
- [ ] Tested on iOS Safari + Android Chrome (real devices or emulators)

---

## Phase 6 — Collaboration polish

Add the features that make 3 people in a car actually want to use this.

**Scope**
- **Voting:** one-tap 👍 per route; queue sorts by votes; each person votes once per route
  (guard via `localStorage`).
- **Multistop itinerary:** build a single multi-waypoint route from an ordered selection
  (Google `waypoints=|`, Apple repeated `waypoint=`) so the driver launches the whole plan
  at once.
- **Presence:** show who's joined (name + role), with a lightweight "last seen" heartbeat.
- **Notifications (optional):** a subtle sound/haptic + visual badge when a new route or
  vote arrives, disabled by default or easily muted.

**Definition of done**
- [ ] Voting works and reorders the driver's queue
- [ ] A multistop itinerary can be built and launched in one tap
- [ ] Presence shows current members with roles
- [ ] New-activity notification is non-intrusive and can be muted

---

## Phase 7 — Hardening, security & edge cases

Make the "minimal security" model explicit and production-safe enough for real trips.

**Scope**
- Replace open dev rules with a shared-access model: a random, unguessable trip code and
  optional short PIN (see `docs/SECURITY.md`).
- Rate-limit / clean up stale rooms (trips auto-expire after N hours of inactivity).
- Handle edge cases: iOS 18.4+ unified Maps URLs, Apple Maps on Android (web fallback),
  no-network states, duplicate submissions, empty-queue UX.
- PWA polish: offline shell, updated icons, splash screen.

**Definition of done**
- [ ] Security model in `docs/SECURITY.md` is implemented and matches the code
- [ ] Stale trips are cleaned up automatically
- [ ] Edge cases from `docs/RESEARCH.md` are handled or explicitly documented as known limits
- [ ] No secrets committed

---

## Phase 8 — Deploy & handoff

Ship it and make it usable by non-technical trip members.

**Scope**
- Deploy to GitHub Pages (main branch) and verify the live URL.
- Test the full flow end-to-end on a real road-trip scenario.
- Write a short user guide (`docs/USER_GUIDE.md`): how to create a trip, share the code,
  submit a route, and drive with it.
- Final pass on accessibility, performance, and mobile viewport.

**Definition of done**
- [ ] Live URL works on iOS Safari and Android Chrome
- [ ] `docs/USER_GUIDE.md` written
- [ ] Full happy-path flow verified (create trip → submit → driver launches → done)
- [ ] Open questions / known limits captured in README or a `docs/ROADMAP.md`

---

## Execution notes for future sessions

- **Small commits per phase.** Commit working code at each phase boundary.
- **Update the handoff ledger** at the top of this file every time you finish (or get
  blocked on) a phase. This is what lets the next conversation resume cleanly.
- **Verify before declaring done.** Run the definition-of-done checklist, not just "it compiles."
- **No secrets in git.** Firebase/web config goes in a template; real values live locally / in docs.
- **Reversible by default.** Don't force-push or rewrite history without explicit approval.
- When in doubt about a decision, consult `docs/RESEARCH.md` and `docs/ARCHITECTURE.md` first.
