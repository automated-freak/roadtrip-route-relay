# Product Spec — Route Relay

Phase 1 deliverable. Turns the concept into concrete roles, screens, flows, and
acceptance criteria so the build phases (2–8) don't drift.

> Companion docs: `docs/ARCHITECTURE.md` (technical approach + data model),
> `docs/RESEARCH.md` (deep-link details + feature research), `docs/SECURITY.md`
> (minimal security model). Wireframes live in `docs/wireframes/`.

---

## 1. Product summary

Route Relay is a **control surface**, not a map. It lets the passengers in a car queue up
destinations and stops, and lets the driver apply any of them with **one tap** — straight
into turn-by-turn navigation on the phone that is already mirrored to the car display via
CarPlay.

- **Who:** 3 people, all in the same car, all on iPhones.
- **What it does:** passengers type/paste a place; the driver sees a live queue and taps
  one item to launch it in Google Maps or Apple Maps.
- **What it never does:** draws its own map, does routing, searches the web, or converts
  between map providers.

---

## 2. Roles & device model

There are exactly two roles, and they are **self-selected flags at join time — not
accounts.**

| Role | Who | Device | View |
|------|-----|--------|------|
| **Driver** | The person whose phone is mirrored to the car | iPhone + CarPlay | Driver view (large glove-friendly queue) |
| **Passenger** | Everyone else | iPhone | Passenger view (type/paste + live queue) |

Rules:

- Roles are chosen once at join ("I'm driving" / "I'm riding") and can be changed.
- One driver per trip is the norm, but **not enforced** (3 trusted people).
- A role is **per-device**, and it only determines *which view opens by default*. Anyone —
  including the driver — can still submit a route; passengers are just the primary
  submitters.
- **Both Google Maps and Apple Maps are assumed installed on every device.** A tap opens
  whichever app the link belongs to; there is **no cross-provider conversion**.
- No presence tracking: we don't care who is currently "online," only that the shared
  queue updates instantly.

---

## 3. Screens

Three screens total. Each is mobile-first, dark-mode friendly, with touch targets ≥ 44 pt.

### Screen 1 — Landing / create-or-join trip

**Purpose:** get a person into a trip as driver or passenger, with a nickname.

**Layout (top → bottom):**
1. Wordmark / title ("Route Relay").
2. **Trip code** — a short unguessable code (e.g. `X7K2Q`) with a "New" button that
   generates a fresh code. Entering an existing code (or pasting a shared trip URL, which
   auto-fills it) joins that trip.
3. **Role picker** — a two-option segmented control: "I'm driving" / "I'm riding".
4. **Nickname** — optional free-text (defaults to something neutral if empty).
5. **Join trip** — primary action.

**Interactions:**
- "New" generates a code from `crypto.getRandomValues` (CSPRNG) and updates the share URL
  to `…/#/trip/<CODE>`.
- Pasting a trip link into the code field (or opening the app from a shared URL) fills the
  code automatically.
- Role selection sets which view the device lands on after joining.

**Acceptance criteria:**
- [ ] A user can generate a fresh unguessable code with one tap.
- [ ] A user can enter or paste an existing code (or shared link) to join.
- [ ] Choosing "I'm driving" opens the driver view; "I'm riding" opens the passenger view.
- [ ] Nickname is optional; empty nickname falls back to a neutral placeholder.
- [ ] The whole landing is usable on a notched iPhone with no horizontal scroll.

### Screen 2 — Passenger view

**Purpose:** let a passenger submit a new destination or stop in ~2 taps, and watch the
shared queue.

**Layout (top → bottom):**
1. Header with trip code + role badge.
2. **"Add a stop"** — large primary button.
3. **Suggestion panel** (expands when "Add a stop" is tapped):
   - **Type-or-paste field** — one field accepts free text ("Tim Hortons near me") *or* a
     pasted Google/Apple Maps link.
   - **Label** — optional free text.
   - **Kind toggle** — "New destination" vs "Stop on the way".
   - **Add to trip** — submit.
4. **Live queue** — newest-first list of all suggestions, each showing label, kind,
   provider, author, and status (pending / active / done). The active route is highlighted.

**Interactions:**
- Tapping a queue item could open its link on this device (read-only preview), but the
  primary job of a passenger is *submitting*, not launching.
- Submitting writes a route to the shared trip room; it appears on every device in ~1 s.

**Acceptance criteria:**
- [ ] "Add a stop" opens the suggestion panel.
- [ ] A free-text destination is accepted and produces a valid Google **or** Apple link
      (generation logic lives in Phase 4; this screen only needs the input).
- [ ] A pasted Google/Apple link is accepted and classified (Google vs Apple vs unknown).
- [ ] Label is optional and stored.
- [ ] "New destination" vs "Stop on the way" maps to `kind` = `destination` / `waypoint`.
- [ ] The queue renders live (new items appear without refresh) and newest-first.
- [ ] Empty/unsupported input shows a clear, non-blocking validation message.

### Screen 3 — Driver view

**Purpose:** give the driver a glove-friendly queue where one tap switches navigation, and
keep the screen awake while driving.

**Layout (top → bottom):**
1. Header with trip code + role badge + "screen awake" indicator.
2. **Active route** — prominently highlighted card for the route currently navigating,
   with "Re-navigate" and "Mark done" actions.
3. **Queue ("Up next")** — large cards, newest-first (manually reorderable), each with a
   full-width "▶ Navigate" button.
4. **Queue actions** — reorder + "Clear queue" (with a light confirmation).

**Interactions:**
- Tapping "▶ Navigate" (or the card) opens the route's deep link on the driver's phone.
  Because these are universal links, iOS opens the matching maps app, which is mirrored to
  CarPlay. See §4 for the one-tap behavior.
- "Mark done" sets the route's status to `done`; "Clear queue" removes/clears items, synced
  to all devices.
- While this view is open, the app requests a **Screen Wake Lock** so the phone doesn't
  sleep mid-drive (graceful fallback if the API is unsupported).

**Acceptance criteria:**
- [ ] Any submitted route can be launched in **≤ 2 taps** (tap card → Navigate, or a single
      tap on the card itself).
- [ ] Tapping Navigate launches Google Maps or Apple Maps (whichever the link belongs to).
- [ ] The active route is visually distinct from the rest of the queue.
- [ ] "Mark done" and "Clear queue" work and sync to all devices.
- [ ] The screen stays awake while the driver view is open (with graceful fallback).
- [ ] If no maps app can open the link, the browser fallback shows a helpful hint.
- [ ] Large touch targets throughout (glove-friendly); no horizontal scroll.

---

## 4. One-tap navigation behavior

The core value: **switching navigation is one tap.** Details from `docs/RESEARCH.md` §6.

When the driver taps a route, the app applies two steps at tap time:

1. **Normalize for straight-to-navigation** (only when the link already points at a
   destination; short links are never mangled):
   - **Google:** append `dir_action=navigate` → launches turn-by-turn immediately.
   - **Apple:** append `start=3` (or `start=N`) → auto-begins navigation after a short delay.
2. **Open** the URL via `window.location.href` (or an anchor tap). iOS routes the universal
   link to the installed maps app, which is mirrored to CarPlay.

Acceptance criteria for this behavior:

- [ ] A Google directions URL with `dir_action=navigate` jumps straight into turn-by-turn.
- [ ] An Apple Maps URL with `start=N` auto-begins navigation.
- [ ] Pasted short links (`maps.app.goo.gl`, `goo.gl/maps`) are opened **verbatim** — never
      re-parsed or mangled (they resolve on the target device).
- [ ] Straight-to-nav degrades gracefully to a route preview when the phone lacks a current
      location (documented behavior for both Google and Apple).
- [ ] No custom URL schemes or API keys are required.

---

## 5. User flows

### 5.1 Create a trip
1. Driver opens Route Relay → taps **New** to generate a code (e.g. `X7K2Q`).
2. Picks "I'm driving", enters a nickname, taps **Join trip** → lands on the **driver view**.
3. Shares the trip link (`…/#/trip/X7K2Q`) in the car.

### 5.2 Join a trip
1. Passenger opens the shared link (or enters the code manually).
2. Picks "I'm riding", enters a nickname, taps **Join trip** → lands on the **passenger view**.
3. The passenger's queue view is now live-connected to the same trip room.

### 5.3 Submit a suggestion (passenger)
1. Passenger taps **Add a stop**.
2. Types "Tim Hortons near me" (or pastes a link), optionally adds a label, picks
   "Stop on the way".
3. Taps **Add to trip** → the route appears on every device within ~1 s.

### 5.4 Apply a suggestion (driver)
1. Driver sees the new item in the "Up next" queue.
2. Taps **▶ Navigate** → the native maps app launches straight into turn-by-turn → CarPlay.
3. The route becomes the **active route** (highlighted) on all devices.
4. When done, driver taps **Mark done** (or **Clear queue** to remove stale items).

### 5.5 Multistop (Phase 6, but designed-for now)
1. Passengers mark some items "Stop on the way" and one item "New destination".
2. Driver reorders and launches a single combined itinerary (Google `waypoints=` /
   Apple repeated `waypoint=`). The `kind` field added now is what enables this later.

---

## 6. Feasibility review against `docs/ARCHITECTURE.md`

The spec is consistent with the architecture. Point-by-point:

| Spec requirement | Architecture support | Feasible? |
|------------------|----------------------|-----------|
| Two self-selected roles, no accounts | "Roles are per-device and self-selected" | ✅ matches |
| 3 screens, static, mobile-first | Plain HTML/CSS/JS on GitHub Pages, no framework | ✅ |
| Realtime shared queue | SQLite + thin Node API trip rooms | ✅ |
| Both map providers, no conversion | "Handled as data, not SDKs"; both apps on iOS | ✅ |
| One-tap navigation | Deep-link handoff: normalize `dir_action=navigate` / `start=N`, then open | ✅ |
| Active-route highlight | `status: active` field already in data model | ✅ |
| Mark done / clear | `status: done` / `removed` fields already in data model | ✅ |
| Screen awake | Screen Wake Lock API (web platform feature, static-compatible) | ✅ |
| Kind toggle (destination vs waypoint) | `kind` field already in data model | ✅ |
| Unguessable code, no enumeration | `tripCode` from CSPRNG, hash-fragment URL | ✅ |
| Validation (reject non-map links) | SECURITY.md "Input validation" requirement | ✅ |

**Verdict:** No architecture changes are required to satisfy this spec. The data model
(`routes` with `kind`/`provider`/`status`) already covers every field the
screens display. The only behaviors deferred to their build phases are: link
classification/generation (Phase 4), one-tap normalization (Phase 5), multistop
(Phase 6), and the security tightening (Phase 7) — exactly as planned.

**Two minor notes carried forward:**
1. The landing screen implies a **"New code" generation + share-URL** behavior; this is
   already described in ARCHITECTURE (§Data model, `tripCode`), so Phase 2 can implement it
   against the mock store without ambiguity.
2. The passenger view's "tap a queue item to preview" is **optional** and not in scope for
   v1 — passengers submit; the driver launches. The spec marks it read-only/optional so it
   doesn't become scope creep.

---

## 7. Open questions / decisions to confirm

1. **Default provider for typed destinations** — ✅ **Decided (Phase 4): Apple Maps** by
   default (native on every iPhone, CarPlay-first). The Google URL is generated too and
   kept on the parse result (`RouteLink.DEFAULT_PROVIDER` in `link-parser.js`), so a
   provider toggle is a one-line change. A visible per-submission Google fallback is not
   built yet (deferred).
2. **Single-tap vs two-tap on driver cards** — tapping the whole card (1 tap) vs a
   dedicated "▶ Navigate" button (2 taps). Proposed: **whole card is tappable** (1 tap),
   with "Mark done" as a separate, smaller target. Worth a quick usability check in Phase 2.
3. **PIN layer** — SECURITY.md mentions an *optional* short PIN (Phase 6). Proposed default:
   **skip** for a road trip; the unguessable code is the gate. Confirm before Phase 6.
4. **Nickname default** — when empty, propose a neutral fallback ("You", or auto-numbered
   "Rider 1"). Minor; decide in Phase 2.
