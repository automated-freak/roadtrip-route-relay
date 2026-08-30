# Route Relay — backend

A tiny SQLite-backed REST API for shared road-trip routes. Zero npm dependencies
(Node's built-in `node:http` + `node:sqlite`).

## Run

```bash
cd backend
node server.js
```

Defaults to `http://127.0.0.1:8787`, storing data in `backend/data/relay.db`
(created on first run). Override with env vars:

| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | `8787` | Listen port |
| `HOST` | `127.0.0.1` | Bind address (`0.0.0.0` to expose directly) |
| `DATA_DIR` | `./data` | Directory for the SQLite file |
| `DB_PATH` | `<DATA_DIR>/relay.db` | Full path to the SQLite file |
| `STALE_HOURS` | `168` | Hours of inactivity after which a route is swept (7 days) |
| `SWEEP_INTERVAL_MS` | `3600000` | How often the stale sweep runs (1 hour) |

## Expose over HTTPS (for the phones)

The frontend on GitHub Pages is served over HTTPS, and mobile browsers block
mixed-content (`http://` fetches). So the API must be reachable over HTTPS. The
zero-friction way for a throwaway trip is a **Cloudflare quick tunnel** (outbound
only — no firewall/port changes):

```bash
cloudflared tunnel --url http://127.0.0.1:8787
```

This prints a public `https://<random>.trycloudflare.com` URL. Put that URL in the
frontend's `config.js` as `apiBase`. The URL stays valid as long as the tunnel
process is running; it changes if you restart the tunnel, so update `config.js` again.

## Reset the database

```bash
rm -f backend/data/relay.db*
node server.js   # recreates the schema on start
```

## API

| Method | Path | Body | Returns |
|--------|------|------|---------|
| GET | `/health` | — | `{ ok: true }` |
| GET | `/api/trips/:code/routes` | — | `{ routes: [...] }` newest-first |
| POST | `/api/trips/:code/routes` | `{ label, url, provider, kind, author }` | created route (201) |
| PATCH | `/api/trips/:code/routes/:id` | partial fields (e.g. `{ status: "done" }`) | updated route |
| DELETE | `/api/trips/:code/routes/:id` | — | 204 |
| POST | `/api/trips/:code/routes/:id/activate` | — | activated route (demotes the previous active) |
| POST | `/api/trips/:code/routes/reorder` | `{ orderedIds: [...] }` (full-trip order) | `{ routes: [...] }` |

Trip rooms are isolated by `trip_code`; a client can only ever see/change the routes
for the code it queries (there is no endpoint that lists codes).

## Stale-trip cleanup

Routes whose `updated_at` is older than `STALE_HOURS` (default 7 days) are deleted
server-side. The sweep runs once at startup and then every `SWEEP_INTERVAL_MS`. It is
purely time-based (`DELETE … WHERE updated_at < cutoff`) and there is **no client-driven
expiry endpoint** — a device that stops polling can't keep a room alive, and no client
code can trigger deletion. With the 7-day default, a one-week trip is never touched
and its data self-cleans about a week after the last edit. See `docs/SECURITY.md` and
`docs/SETUP.md`.
