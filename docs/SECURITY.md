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
| Data persistence / compliance | Low | Trips are temporary; auto-expiry is deferred (Phase 7) |

We explicitly do **not** build: user accounts, passwords, OAuth, email verification,
audit logs, or per-user permissions.

---

## Access model

1. **Trip code** — each trip gets a short, cryptographically random code (e.g. `X7K2Q`).
   It is generated with a CSPRNG (`crypto.getRandomValues`) and embedded in the share URL
   as a hash fragment: `…/#/trip/X7K2Q`. Hash fragments are not sent to the server, so the
   code stays out of access logs.
2. **Optional PIN** — a short numeric PIN shared in person, added in Phase 6 if the owner
   wants an extra layer. (Good default for a road trip: skip it unless asked.)
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
- **Expiry:** room cleanup is deferred to Phase 7. For a one-week trip, stale rows are
  harmless (the DB is small and gets deleted after the trip).

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
