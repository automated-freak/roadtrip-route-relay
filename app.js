/* ==========================================================================
   Route Relay — Phase 3 frontend (SQLite backend integration)
   All three screens are driven by a shared, server-side store: a thin Node +
   SQLite REST API on the droplet (see backend/server.js). The client polls
   GET /api/trips/:code/routes every ~1.2s and mutates via POST/PATCH/DELETE.

   Phase 4 adds real link classification/generation (see link-parser.js);
   Phase 5 adds the real deep-link handoff (window.location.href = url).

   Design decisions locked (see docs/PRODUCT_SPEC.md §7):
   - Whole card is tappable on the driver view (1 tap) — the "▶ Navigate"
     button is a visible affordance that triggers the same action.
   - Empty nickname falls back to "You".
   - Typed-destination default provider is Apple Maps (all-iPhone, CarPlay-first).
     The Google URL is also generated and kept on the parse result for a future
     provider toggle — see link-parser.js (RouteLink.DEFAULT_PROVIDER).
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Store + API layer. Routes now live in the SQLite backend; the local
   * `store.routes` array is a live copy refreshed by polling.
   * ------------------------------------------------------------------ */
  const store = {
    tripCode: '',
    role: 'passenger', // 'driver' | 'passenger'
    nickname: '',
    routes: [],
    reorderMode: false,
  };

  const API_BASE = (window.RR_CONFIG && window.RR_CONFIG.apiBase) || '';
  const POLL_MS = 1200;
  let pollingTimer = null;
  let online = true;

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers, { 'Content-Type': 'application/json' });
    return fetch(API_BASE + path, opts).then((res) => {
      if (!res.ok) {
        return res.text().then((t) => {
          let msg = t;
          try { msg = JSON.parse(t).error || t; } catch (e) { /* not json */ }
          throw new Error(msg || 'HTTP ' + res.status);
        });
      }
      if (res.status === 204) return null;
      return res.json();
    });
  }

  function routesPath() {
    return `/api/trips/${encodeURIComponent(store.tripCode)}/routes`;
  }

  function setConnection(state) {
    if (state === online) return;
    online = state;
    if (!state) toast('Offline — reconnecting…', 4000);
    else toast('Back online ✓');
  }

  async function fetchRoutes() {
    if (!store.tripCode) return;
    try {
      const data = await api(routesPath());
      store.routes = (data && data.routes) || [];
      setConnection(true);
      renderCurrent();
    } catch (e) {
      setConnection(false);
    }
  }

  function startPolling() {
    stopPolling();
    fetchRoutes();
    pollingTimer = setInterval(fetchRoutes, POLL_MS);
  }

  function stopPolling() {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
  }

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // Escape user-generated text before injecting into HTML (SECURITY.md).
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  const PROVIDER_LABEL = {
    google: 'Google Maps',
    apple: 'Apple Maps',
    text: 'Maps',
    other: 'Link',
  };

  const KIND_LABEL = {
    destination: 'destination',
    waypoint: 'stop on the way',
  };

  function providerLabel(p) {
    return PROVIDER_LABEL[p] || PROVIDER_LABEL.other;
  }

  function kindLabel(k) {
    return KIND_LABEL[k] || KIND_LABEL.destination;
  }

  function timeAgo(ts) {
    const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
  }

  // Unambiguous alphabet (no 0/O, 1/I/L) for the trip code.
  const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  function generateCode(length) {
    length = length || 5;
    const bytes = new Uint8Array(length);
    if (window.crypto && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      // Extremely unlikely fallback (ancient browsers).
      for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    let out = '';
    for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    return out;
  }

  function shareUrl(code) {
    return `${location.origin}${location.pathname}#/trip/${code}`;
  }

  let toastTimer = null;
  function toast(msg, ms) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    // Force reflow so the transition replays on rapid successive toasts.
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('show');
    }, ms || 2200);
  }

  /* ------------------------------------------------------------------ *
   * Wake lock (Screen Wake Lock API, graceful fallback)
   * ------------------------------------------------------------------ */
  let wakeLock = null;

  function setAwake(state) {
    const el = $('#awake-indicator');
    if (state === 'on') {
      el.textContent = '👁 Screen awake — stays on while this view is open';
      el.classList.add('is-on');
    } else if (state === 'unsupported') {
      el.textContent = '👁 Screen-awake not supported on this device';
      el.classList.remove('is-on');
    } else {
      el.textContent = '👁 Screen awake paused';
      el.classList.remove('is-on');
    }
  }

  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) {
      setAwake('unsupported');
      return;
    }
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      setAwake('on');
      wakeLock.addEventListener('release', () => setAwake('off'));
    } catch (e) {
      setAwake('off');
    }
  }

  async function releaseWakeLock() {
    if (wakeLock) {
      try {
        await wakeLock.release();
      } catch (e) {
        /* already released */
      }
      wakeLock = null;
    }
  }

  // Re-acquire the lock if the driver re-tabs to the page while driving.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentView === 'driver') requestWakeLock();
  });

  /* ------------------------------------------------------------------ *
   * View routing
   * ------------------------------------------------------------------ */
  let currentView = 'landing';

  function showView(name) {
    currentView = name;

    $$('.view').forEach((v) => {
      v.hidden = v.id !== `view-${name}`;
    });

    // Driver view is always dark; others follow system preference.
    document.documentElement.classList.toggle('dark', name === 'driver');

    if (name === 'driver') {
      renderDriver();
      requestWakeLock();
    } else {
      releaseWakeLock();
      if (name === 'passenger') renderPassenger();
      else renderLanding();
    }

    window.scrollTo(0, 0);
  }

  // Re-render the current view (used after async fetches without toggling wake lock).
  function renderCurrent() {
    if (currentView === 'driver') renderDriver();
    else if (currentView === 'passenger') renderPassenger();
    else renderLanding();
  }

  /* ------------------------------------------------------------------ *
   * Rendering
   * ------------------------------------------------------------------ */
  function renderLanding() {
    const code = $('#trip-code');
    code.value = store.tripCode || '';
    $('#nickname').value = store.nickname || '';
    setRoleInput(store.role);
    updateCopyButton();
  }

  function setRoleInput(role) {
    const input = $(`input[name="role"][value="${role}"]`);
    if (input) input.checked = true;
  }

  function getRoleInput() {
    const checked = $('input[name="role"]:checked');
    return checked ? checked.value : 'passenger';
  }

  function updateCopyButton() {
    const btn = $('#btn-copy');
    if (store.tripCode) {
      btn.hidden = false;
    } else {
      btn.hidden = true;
    }
  }

  function updateHeaderBadges() {
    const code = store.tripCode || '?????';
    $('#passenger-badge').textContent = `${code} · Riding`;
    $('#driver-badge').textContent = `${code} · Driving`;
  }

  function metaLine(route) {
    const kind = kindLabel(route.kind);
    const provider = providerLabel(route.provider);
    const author = route.author || 'You';
    return `${kind} · ${provider} · by ${esc(author)}`;
  }

  function statusBadge(route) {
    if (route.status === 'active') return '<span class="card-badge">Now navigating</span>';
    if (route.status === 'done') return '<span class="card-badge">Done</span>';
    return '';
  }

  /* ----- Passenger queue ----- */
  function renderPassenger() {
    updateHeaderBadges();
    const list = $('#passenger-queue');
    const empty = $('#passenger-empty');

    if (store.routes.length === 0) {
      list.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    list.innerHTML = store.routes
      .map((r) => {
        const active = r.status === 'active' ? ' card-active' : '';
        const done = r.status === 'done' ? ' card-done' : '';
        return `
          <li>
            <button class="card${active}${done}" type="button" data-preview="${esc(r.id)}"
                    aria-label="${esc(r.label || 'Untitled stop')}, ${kindLabel(r.kind)}, ${providerLabel(r.provider)}">
              <p class="card-label">${esc(r.label || 'Untitled stop')}</p>
              <p class="card-meta">${metaLine(r)} · ${timeAgo(r.createdAt)}</p>
              ${statusBadge(r)}
            </button>
          </li>`;
      })
      .join('');
  }

  /* ----- Driver queue ----- */
  function renderDriver() {
    updateHeaderBadges();
    renderActive();
    renderDriverQueue();
  }

  function renderActive() {
    const host = $('#active-route');
    const active = store.routes.find((r) => r.status === 'active');

    if (!active) {
      host.innerHTML = `<div class="empty">Nothing navigating right now — tap a route below.</div>`;
      return;
    }

    host.innerHTML = `
      <div class="active-card">
        <p class="card-label">${esc(active.label || 'Untitled stop')}</p>
        <p class="card-meta">${metaLine(active)} · ${timeAgo(active.createdAt)}</p>
        <div class="active-actions">
          <button class="btn btn-primary" type="button" data-navigate="${esc(active.id)}">↻ Re-navigate</button>
          <button class="btn btn-secondary" type="button" data-done="${esc(active.id)}">Mark done</button>
        </div>
      </div>`;
  }

  function renderDriverQueue() {
    const list = $('#driver-queue');
    const empty = $('#driver-empty');
    const pending = store.routes.filter((r) => r.status === 'pending');

    if (pending.length === 0) {
      list.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    list.innerHTML = pending
      .map((r, idx) => {
        const reorder = store.reorderMode
          ? `<div class="reorder-controls">
               <button class="btn btn-secondary" type="button" data-move="${esc(r.id)}" data-dir="-1" ${idx === 0 ? 'disabled' : ''} aria-label="Move up">▲</button>
               <button class="btn btn-secondary" type="button" data-move="${esc(r.id)}" data-dir="1" ${idx === pending.length - 1 ? 'disabled' : ''} aria-label="Move down">▼</button>
             </div>`
          : '';
        return `
          <li>
            <div class="card card-driver" data-navigate="${esc(r.id)}" role="button" tabindex="0"
                 aria-label="Navigate to ${esc(r.label || 'Untitled stop')}">
              <p class="card-label">${esc(r.label || 'Untitled stop')}</p>
              <p class="card-meta">${metaLine(r)} · ${timeAgo(r.createdAt)}</p>
              <div class="nav-row">
                <button class="btn btn-primary btn-navigate" type="button" data-navigate="${esc(r.id)}">▶ Navigate</button>
                <button class="btn btn-done" type="button" data-done="${esc(r.id)}">Mark done</button>
              </div>
              ${reorder}
            </div>
          </li>`;
      })
      .join('');
  }

  /* ------------------------------------------------------------------ *
   * Actions
   * ------------------------------------------------------------------ */
  function joinTrip() {
    let code = ($('#trip-code').value || '').trim().toUpperCase();
    if (!code) code = generateCode();

    store.tripCode = code;
    store.role = getRoleInput();
    store.nickname = ($('#nickname').value || '').trim();

    // Update the share URL so the code is in the hash.
    try {
      history.replaceState(null, '', `#/trip/${code}`);
    } catch (e) {
      location.hash = `#/trip/${code}`;
    }

    startPolling();
    showView(store.role === 'driver' ? 'driver' : 'passenger');
  }

  function newCode() {
    store.tripCode = generateCode();
    renderLanding();
    $('#trip-code').focus();
    toast('New trip code generated');
  }

  function copyLink() {
    if (!store.tripCode) return;
    const url = shareUrl(store.tripCode);
    const done = () => toast('Share link copied');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(() => fallbackCopy(url, done));
    } else {
      fallbackCopy(url, done);
    }
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      done();
    } catch (e) {
      toast(`Share this link:\n${text}`, 5000);
    }
    document.body.removeChild(ta);
  }

  function toggleAddPanel(open) {
    const panel = $('#suggestion-panel');
    const btn = $('#btn-add-stop');
    const show = open != null ? open : panel.hidden;
    panel.hidden = !show;
    btn.setAttribute('aria-expanded', String(show));
    if (show) {
      $('#panel-error').hidden = true;
      $('#dest-input').focus();
    }
  }

  async function submitRoute() {
    const input = $('#dest-input').value.trim();
    const labelInput = $('#label-input').value.trim();
    const kind = ($('input[name="kind"]:checked') || {}).value || 'destination';
    const err = $('#panel-error');

    const parsed = window.RouteLink.parse(input);

    if (parsed.kind === 'error') {
      err.textContent = parsed.message;
      err.hidden = false;
      return;
    }

    err.hidden = true;

    const label = labelInput || (parsed.labelHint || '');
    const payload = {
      label,
      url: parsed.url,
      provider: parsed.provider,
      kind,
      author: store.nickname || 'You',
    };

    const btn = $('#btn-submit');
    btn.disabled = true;
    try {
      const created = await api(routesPath(), {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      store.routes.unshift(created);
      renderCurrent();
      $('#dest-input').value = '';
      $('#label-input').value = '';
      toggleAddPanel(false);
      toast('Added to trip ✓');
    } catch (e) {
      err.textContent = 'Couldn’t add — ' + (e.message || 'check connection');
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  }

  // Stub for the one-tap handoff. Phase 5 replaces this with a real deep-link
  // open: window.location.href = normalizedUrl(route).
  async function navigate(id) {
    const route = store.routes.find((r) => r.id === id);
    if (!route) return;

    try {
      await api(routesPath() + '/' + encodeURIComponent(id) + '/activate', { method: 'POST' });
    } catch (e) {
      toast('Couldn’t activate — ' + (e.message || 'offline'));
      return;
    }
    await fetchRoutes();

    if (route.url) {
      toast(`▶ Opening ${providerLabel(route.provider)} — ${route.label || 'stop'}`);
      // Real implementation (Phase 5):
      // window.location.href = route.url;
      console.info('[relay] would navigate to:', route.url);
    } else {
      toast(`▶ Navigate to “${route.label || 'stop'}” (link set in Phase 4)`);
    }
  }

  async function markDone(id) {
    try {
      await api(routesPath() + '/' + encodeURIComponent(id), {
        method: 'PATCH',
        body: JSON.stringify({ status: 'done' }),
      });
    } catch (e) {
      toast('Couldn’t update — ' + (e.message || 'offline'));
      return;
    }
    await fetchRoutes();
    toast('Marked done');
  }

  async function clearQueue() {
    const pending = store.routes.filter((r) => r.status === 'pending');
    if (pending.length === 0) {
      toast('Queue is already clear');
      return;
    }
    if (!confirm(`Clear ${pending.length} queued route${pending.length === 1 ? '' : 's'}?`)) {
      return;
    }
    try {
      await Promise.all(
        pending.map((r) => api(routesPath() + '/' + encodeURIComponent(r.id), { method: 'DELETE' }))
      );
    } catch (e) {
      toast('Couldn’t clear — ' + (e.message || 'offline'));
      return;
    }
    store.reorderMode = false;
    $('#btn-reorder').setAttribute('aria-pressed', 'false');
    await fetchRoutes();
    toast('Queue cleared');
  }

  async function moveRoute(id, dir) {
    const ordered = store.routes.slice().sort((a, b) => b.sortOrder - a.sortOrder);
    const pendingIdx = ordered
      .map((r, i) => (r.status === 'pending' ? i : -1))
      .filter((i) => i >= 0);
    const from = ordered.findIndex((r) => r.id === id);
    const pFrom = pendingIdx.indexOf(from);
    const pTo = pFrom + dir;
    if (pFrom < 0 || pTo < 0 || pTo >= pendingIdx.length) return;
    const to = pendingIdx[pTo];

    const tmp = ordered[from];
    ordered[from] = ordered[to];
    ordered[to] = tmp;

    try {
      await api(routesPath() + '/reorder', {
        method: 'POST',
        body: JSON.stringify({ orderedIds: ordered.map((r) => r.id) }),
      });
    } catch (e) {
      toast('Couldn’t reorder — ' + (e.message || 'offline'));
      return;
    }
    await fetchRoutes();
  }

  function toggleReorder() {
    store.reorderMode = !store.reorderMode;
    $('#btn-reorder').setAttribute('aria-pressed', String(store.reorderMode));
    renderDriverQueue();
  }

  /* ------------------------------------------------------------------ *
   * Event wiring
   * ------------------------------------------------------------------ */
  function bindEvents() {
    $('#btn-new').addEventListener('click', newCode);
    $('#btn-copy').addEventListener('click', copyLink);
    $('#btn-join').addEventListener('click', joinTrip);

    // Enter in the code or nickname field joins.
    ['trip-code', 'nickname'].forEach((id) => {
      document.getElementById(id).addEventListener('keydown', (e) => {
        if (e.key === 'Enter') joinTrip();
      });
    });

    // Pasting a full share URL into the code field extracts the code.
    $('#trip-code').addEventListener('input', (e) => {
      const v = e.target.value.trim();
      const m = v.match(/#\/trip\/([A-Za-z0-9]+)/);
      if (m) {
        e.target.value = m[1].toUpperCase();
      }
      store.tripCode = e.target.value.toUpperCase();
      updateCopyButton();
    });

    $('#btn-add-stop').addEventListener('click', () => toggleAddPanel());
    $('#btn-cancel-add').addEventListener('click', () => toggleAddPanel(false));
    $('#btn-submit').addEventListener('click', submitRoute);
    $('#dest-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitRoute();
    });

    $('#btn-reorder').addEventListener('click', toggleReorder);
    $('#btn-clear').addEventListener('click', clearQueue);

    // Delegated clicks for dynamically rendered cards.
    document.addEventListener('click', (e) => {
      const navEl = e.target.closest('[data-navigate]');
      if (navEl) {
        navigate(navEl.dataset.navigate);
        return;
      }
      const doneEl = e.target.closest('[data-done]');
      if (doneEl) {
        markDone(doneEl.dataset.done);
        return;
      }
      const moveEl = e.target.closest('[data-move]');
      if (moveEl) {
        moveRoute(moveEl.dataset.move, parseInt(moveEl.dataset.dir, 10));
        return;
      }
      const previewEl = e.target.closest('[data-preview]');
      if (previewEl) {
        const r = store.routes.find((x) => x.id === previewEl.dataset.preview);
        if (r) toast(`${esc(r.label || 'Untitled stop')} — ${providerLabel(r.provider)} · the driver applies routes`);
        return;
      }
    });

    // Keyboard activation on the tappable driver cards (role="button").
    document.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('card-driver')) {
        e.preventDefault();
        navigate(e.target.dataset.navigate);
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */
  function boot() {
    // Parse a shared trip URL (#/trip/CODE) so the code auto-fills on landing.
    const m = location.hash.match(/#\/trip\/([A-Za-z0-9]+)/);
    if (m) {
      store.tripCode = m[1].toUpperCase();
    }
    bindEvents();
    renderLanding();
    showView('landing');

    // Register the service worker for offline shell + installability.
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {
          /* SW registration is best-effort; app works without it. */
        });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
