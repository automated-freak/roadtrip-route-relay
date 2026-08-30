# Setup & deployment — Route Relay

How to get the shared SQLite backend running and the frontend talking to it. Written for
a throwaway, 3-person, one-week trip.

## 1. Run the backend (on the droplet)

```bash
cd backend
node server.js
```

- Listens on `http://127.0.0.1:8787` by default.
- Creates `backend/data/relay.db` on first run (gitignored).
- Zero npm dependencies (needs Node ≥ 22.5 for the built-in `node:sqlite`; Node 24 is
  installed).
- **Auto-cleans stale trips:** routes idle longer than `STALE_HOURS` (default `168`, i.e.
  7 days) are deleted on startup and every hour (`SWEEP_INTERVAL_MS`). Override either
  with env vars if you want a longer/shorter window.

## 2. Expose it over HTTPS

The frontend is served over HTTPS (GitHub Pages), and mobile browsers block mixed-content
`http://` fetches — so the API must be HTTPS. The zero-friction way is a **Cloudflare quick
tunnel** (outbound only; no firewall or port changes):

```bash
cloudflared tunnel --url http://127.0.0.1:8787
```

It prints a public URL like `https://random-name.trycloudflare.com`. Copy it.

> The URL changes if the tunnel restarts. Keep the tunnel process alive for the trip and
> update `config.js` whenever the URL changes.

## 3. Point the frontend at the API

Edit `config.js` and set `apiBase` to the tunnel URL:

```js
window.RR_CONFIG = { apiBase: 'https://random-name.trycloudflare.com' };
```

Commit and push; GitHub Pages then serves the updated `config.js` to the phones.

## 4. Verify

```bash
curl -s https://random-name.trycloudflare.com/health
# => {"ok":true,"service":"route-relay",...}
```

Open the app on a phone, create a trip, and confirm a second phone on the same code sees
the route appear within ~1 second.

## Reset / teardown

```bash
# wipe the DB
rm -f backend/data/relay.db*

# stop the backend + tunnel (Ctrl-C / kill the processes)
```

After the trip: stop the server and tunnel, then optionally delete `backend/data/` (or the
whole droplet).
