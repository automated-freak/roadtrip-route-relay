# Security Model — Route Relay

Route Relay is intentionally **minimal-security**: it's a temporary, invite-only tool for
a handful of people on the same road trip. This document makes the security posture and
its tradeoffs explicit so future sessions implement it faithfully (and don't accidentally
over-engineer it).

**Design context (2026-08-30):** this app is used by **3 people, all in the same car.**
Security is explicitly *not* a priority — the goal is friction-free handoff. We keep the
unguessable trip code (below) only because it's essentially free; anything heavier is out
of scope and should be resisted.

---

## Threat model

Who are we protecting against, and what do we care about?

| Concern | Priority | Notes |
|---------|----------|-------|
| Random internet strangers joining a trip | Medium | Prevented by an unguessable trip code |
| Trip data leaking publicly | Medium | No PII stored; only map links + labels + nicknames |
| Account takeover / identity theft | N/A | There are no accounts |
| Malicious link injection | Low | Accept only map links; sanitize on render |
| Data persistence / compliance | Low | Trips are temporary; stale rooms auto-clean (Phase 7 sweep) |

We explicitly do **not** build: user accounts, passwords, OAuth, email verification,
audit logs, or per-user permissions.

---

## Access model

1. **Trip code** — each trip gets a short, cryptographically random code (e.g. `X7K2Q`).
   It is generated with a CSPRNG (`crypto.getRandomValues`) and embedded in the share URL
   as a hash fragment: `…/#/trip/X7K2Q`. Hash fragments are not sent to the server, so the
   code stays out of access logs.
2. **Optional PIN — decided: skip (not implemented).** A short numeric PIN shared in
   person would add a second layer on top of the trip code, but as of Phase 7 the
   decision is to **skip it** for v1. Everyone joins in person, an extra gate is friction
   in the car for no real gain, and the unguessable code already covers the "random
   stranger" threat in the model. This is a deliberate decision, not an omission. If the
   owner later wants it, add a `pin` column and a join-time prompt — the route schema
   and the open API make this a small, isolated change.
3. **No enumeration** — the code space is large enough that guessing is impractical, and
   there is no endpoint that lists existing rooms.

The rule: **anyone with the trip URL is a member.** This matches how a real trip works —
you hand someone the link in the car.

---

## Implementation requirements (for the build phases)

- **Open API, no auth:** the SQLite API is deliberately unauthenticated with open CORS
  (`Access-Control-Allow-Origin: *`). Anyone who can reach it can read/write *if they know
  the trip code*; the unguessable code is the real gate. There is no endpoint that lists
  trip codes, so enumeration is impractical.
- **Input validation:** only store `https` links whose host is a known maps domain
  (google.com/maps, maps.app.goo.gl, goo.gl/maps, maps.apple.com). Reject `javascript:`,
  `data:`, and other schemes outright. (Implemented in Phase 4.)
- **Render safety:** treat labels/nicknames as text (never as HTML) to prevent XSS.
- **No secrets in the repo:** the SQLite DB (`backend/data/`) is gitignored; the API base
  URL in `config.js` is public by design (it only points at the droplet).
- **Expiry (implemented, Phase 7):** the server sweeps routes idle longer than
  `STALE_HOURS` (default 7 days) once at startup and then every `SWEEP_INTERVAL_MS` — see
  `backend/server.js`. There is no client-driven expiry endpoint, so a device that stops
  polling can't keep a room alive and no client can trigger deletion. With the 7-day
  default, a one-week trip is never touched and its data self-cleans ~a week after the
  last edit.

---

## Known tradeoffs (accepted)

- **The link is the key.** If someone leaks the trip URL, anyone can join. Accepted —
  it's a temporary road-trip tool, not a banking app.
- **No identity.** "Author" is a self-chosen nickname; there's no way to prove who added a
  route. Accepted — the car can sort that out verbally.
- **Data lives in SQLite on the droplet.** Map links and labels are not sensitive, but they
  do sit in a local file on a single machine. Accepted for a one-week, self-hosted trip.

If the owner later wants stronger guarantees, the migration path is: move to Supabase with
row-level security, add a real login, or self-host. Those are documented as future options,
not v1 scope.
