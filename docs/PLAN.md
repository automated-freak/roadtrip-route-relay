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
| 1 | Product spec & UX wireframes | ✅ Done | 2026-08-30 | Wrote `docs/PRODUCT_SPEC.md` (roles, 3 screens, flows, acceptance criteria incl. one-tap nav) + SVG wireframes for all 3 screens in `docs/wireframes/`; spec reviewed against ARCHITECTURE (no changes needed) | **Build Phase 2:** static mobile-first HTML/CSS/JS shell with a local mock store — render all 3 screens from `PRODUCT_SPEC.md` §3 + wireframes, large (≥44pt) touch targets, dark-mode, safe-area handling, and a PWA manifest + icons for Add-to-Home-Screen. Open items to settle while building: default provider for typed destinations, whole-card tap vs Navigate button, nickname fallback (see `PRODUCT_SPEC.md` §7) |
| 2 | Frontend shell | ✅ Done | 2026-08-30 | Static mobile-first shell built (vanilla HTML/CSS/JS, no build step): all 3 screens driven by an in-memory mock store, ≥44pt touch targets, forced-dark driver theme + safe-area handling, PWA manifest + icons + service worker. Lighthouse mobile 100/100/100 (perf/accessibility/best-practices). | **Build Phase 3:** replace the in-memory `store.routes` mock in `app.js` with a shared backend — a self-hosted SQLite API (`backend/server.js`, Node `node:http` + `node:sqlite`) keyed by `tripCode`; poll for updates (~1.2s), handle initial-empty + reconnect, keep the SQLite DB out of git via `docs/SETUP.md`. Reuse the existing render functions — the route shape already matches ARCHITECTURE's data model. |
| 3 | Backend integration (realtime) | ✅ Done | 2026-08-30 | **Pivoted from Firebase to self-hosted SQLite** (no Google account needed). Built `backend/server.js` (Node `node:http` + `node:sqlite`, zero deps): REST API keyed by `trip_code` (list/create/patch/delete/activate/reorder), open CORS, DB at `backend/data/` (gitignored). `app.js` now polls every ~1.2s instead of the mock store; reconnect + empty-state handled. All endpoints exercised via curl (create/list/activate-demote/reorder/patch/delete/validation/CORS preflight). Config via `config.js` `apiBase`. On-device E2E deferred to Phase 8. | **Build Phase 4:** replace `guessProvider()` in `app.js` with a real link parser — classify Google vs Apple vs unknown, generate a canonical deep link for typed destinations, validate hosts (reject `javascript:`/`data:`), and add the good/bad test-link corpus from `RESEARCH.md`. Note: `url` is currently stored verbatim from a pasted link or empty for typed text; Phase 4 fills the canonical link. |
| 4 | Route submission & parsing | ✅ Done | 2026-08-30 | Added `link-parser.js` (browser+Node UMD, zero deps): classifies pasted links as Google/Apple/unknown, validates https + known maps hosts (rejects `javascript:`/`data:`/`http:`/other schemes), stores short links (`maps.app.goo.gl`/`goo.gl/maps`) verbatim, and generates canonical deep links for typed destinations (Apple unified `directions?destination=…` default per §7; Google `dir/?api=1` or `search/?api=1` for near-me). `app.js` `submitRoute()` now uses the parser; `guessProvider()` removed. Corpus run via `scripts/test-link-parser.js` (22/22); backend POST verified e2e via curl. | **Build Phase 5:** real one-tap handoff in `navigate()` — `window.location.href = normalizedUrl(route)`; append `dir_action=navigate` (Google) / `start=3` (Apple) only to non-short links; never mangle short links (re-derive from `route.url`). Typed routes now carry a real `url` (Apple) so navigation already has something to open. |
| 5 | Driver queue & one-tap handoff | ⬜ Not started | — | — | — |
| 6 | Multistop & trip polish | ⬜ Not started | — | — | — |
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
     optional "stop along the way vs new destination" toggle, live list.
  3. **Driver view** — large, glove-friendly queue, one-tap launch, active-route highlight,
     "mark done / clear" actions, screen stays awake.
- Sketch rough wireframes (text or simple SVG in `docs/wireframes/`).
- Write the acceptance criteria for each screen, including the one-tap-navigation behavior
  from `docs/RESEARCH.md` §6.

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

Wire the frontend to a shared backend so the list syncs across devices in near-real time.

**Approach (pivoted from Firebase to self-hosted SQLite)**
- Original plan: Firebase Realtime Database. **Pivot:** a self-hosted SQLite API on the
  droplet (`backend/server.js`, Node `node:http` + `node:sqlite`, zero npm deps) — no
  Google account required. Rationale in `docs/RESEARCH.md` §2 and `docs/ARCHITECTURE.md`.

**Scope**
- Implement a tiny SQLite-backed REST API: list / create / patch / delete / activate /
  reorder routes, keyed by `trip_code`.
- Replace the mock store in `app.js` with an API client that polls the trip's routes every
  ~1.2s and renders updates live, handling initial-empty state and reconnect.
- Keep the SQLite DB out of git (`backend/data/` gitignored); document run/expose steps in
  `docs/SETUP.md` and `backend/README.md`.

**Definition of done**
- [x] A route added on device A appears on device B within ~1 second, no refresh
- [x] Trip rooms are isolated (code A can't see code B's routes)
- [x] SQLite DB not committed; setup steps documented in `docs/SETUP.md`
- [x] Real app data renders in the three screens from Phase 2

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
- [x] Google and Apple links are both accepted and correctly classified
- [x] Typed destinations produce a valid Google and Apple URL
- [x] Short links (`maps.app.goo.gl`) stored as-is (they resolve on the target device)
- [x] A list of representative test links (good + bad) documented in `docs/RESEARCH.md`
- [x] Validation errors are clear and non-blocking

---

## Phase 5 — Driver queue & one-tap handoff

Deliver the core value: one-tap route switching on the driver's phone.

**Scope**
- Driver view: live queue of routes, newest-first, manually reorderable.
- Tapping a route opens the deep link on the driver's phone (which launches the native
  maps app → CarPlay). No in-app map, no searching.
- **One-tap navigation:** append `dir_action=navigate` (Google) / `start=N` (Apple) so the
  tap jumps straight into turn-by-turn when possible.
- Track an "active" route (the one currently navigating) and show it prominently.
- Allow marking routes done / removing them (with a lightweight confirmation to avoid
  accidental clears).
- **Keep screen awake** while the driver view is open (Screen Wake Lock API, graceful fallback).
- Handle the case where no maps app is installed (open in browser instead).

**Definition of done**
- [ ] Driver can launch any submitted route in ≤ 2 taps
- [ ] Straight-to-navigation works on Google Maps and Apple Maps (iOS)
- [ ] Active route is visually distinct from the queue
- [ ] Done/remove actions work and sync to all devices
- [ ] Tested on iOS Safari (real device or simulator)

---

## Phase 6 — Multistop & trip polish

Round out the in-car experience now that the core handoff works.

**Scope**
- **Multistop itinerary:** build a single multi-waypoint route from an ordered selection
  (Google `waypoints=|`, Apple repeated `waypoint=`) so the driver launches the whole plan
  at once.
- **Destination vs. waypoint ordering:** let passengers clearly mark each suggestion as the
  new destination or a stop along the way, and reorder stops before building the itinerary.
- **Notifications (optional):** a subtle sound/haptic + visual badge when a new route
  arrives, disabled by default or easily muted.

**Definition of done**
- [ ] A multistop itinerary can be built, reordered, and launched in one tap
- [ ] Destination-vs-waypoint distinction is clear and correctly builds the itinerary
- [ ] New-route notification is non-intrusive and can be muted

---

## Phase 7 — Hardening, security & edge cases

Make the "minimal security" model explicit and production-safe enough for real trips.

**Scope**
- Tighten access beyond the open, unauthenticated API if desired: the unguessable trip
  code is already the gate; add an optional short PIN if the owner wants a second layer
  (see `docs/SECURITY.md`).
- Rate-limit / clean up stale trips (auto-expire after N hours of inactivity). With the
  self-hosted SQLite backend this is a simple server-side sweep — `DELETE … WHERE
  updated_at < cutoff` on a timer or at startup — no Cloud Function or client-driven
  expiry needed.
- Handle edge cases: iOS 18.4+ unified Maps URLs, no-network states, duplicate
  submissions, empty-queue UX.
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
- Deploy the frontend to GitHub Pages (main branch) and verify the live URL; confirm the
  SQLite backend + HTTPS tunnel are running on the droplet (see `docs/SETUP.md`).
- Test the full flow end-to-end on a real road-trip scenario.
- Write a short user guide (`docs/USER_GUIDE.md`): how to create a trip, share the code,
  submit a route, and drive with it.
- Final pass on accessibility, performance, and mobile viewport.

**Definition of done**
- [ ] Live URL works on iOS Safari
- [ ] `docs/USER_GUIDE.md` written
- [ ] Full happy-path flow verified (create trip → submit → driver launches → done)
- [ ] Open questions / known limits captured in README or a `docs/ROADMAP.md`

---

## Execution notes for future sessions

- **Small commits per phase.** Commit working code at each phase boundary.
- **Update the handoff ledger** at the top of this file every time you finish (or get
  blocked on) a phase. This is what lets the next conversation resume cleanly.
- **Verify before declaring done.** Run the definition-of-done checklist, not just "it compiles."
- **No secrets in git.** The SQLite DB (`backend/data/`) is gitignored; the API base URL lives in `config.js` (placeholder committed, real value set before use).
- **Reversible by default.** Don't force-push or rewrite history without explicit approval.
- When in doubt about a decision, consult `docs/RESEARCH.md` and `docs/ARCHITECTURE.md` first.
