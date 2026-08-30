/* Route Relay — runtime config (Phase 3+).
   The static frontend talks to the SQLite backend over this base URL.
   Not a secret — it's just the public HTTPS endpoint of the droplet API.

   Set `apiBase` to the backend's public HTTPS URL (e.g. a Cloudflare quick-tunnel
   URL from `cloudflared tunnel --url http://127.0.0.1:8787`). Leave empty for
   same-origin (only if the backend serves this app itself). */
window.RR_CONFIG = {
  apiBase: 'https://lets-smoking-films-seasonal.trycloudflare.com',
};
