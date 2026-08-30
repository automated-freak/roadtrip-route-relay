'use strict';

/**
 * Route Relay — backend (Phase 3)
 * A tiny SQLite-backed REST API for shared road-trip routes.
 *
 * Stack: Node's built-in `node:http` + `node:sqlite`. Zero npm dependencies.
 * Designed for a throwaway, 3-person, one-week trip — no auth, open CORS.
 * (See docs/SECURITY.md for the accepted tradeoffs.)
 *
 * Endpoints:
 *   GET    /health                                  -> { ok: true }
 *   GET    /api/trips/:code/routes                  -> { routes: [...] }   (sortOrder DESC)
 *   POST   /api/trips/:code/routes                  -> created route
 *   PATCH  /api/trips/:code/routes/:id              -> updated route (partial)
 *   DELETE /api/trips/:code/routes/:id              -> 204
 *   POST   /api/trips/:code/routes/:id/activate     -> set active, demote previous
 *   POST   /api/trips/:code/routes/reorder          -> { orderedIds: [...] } full-trip order
 *
 * Maintenance: a stale-trip sweep deletes routes whose updated_at is older than
 * STALE_HOURS (see sweepStaleRoutes). It runs once at startup and then on a
 * timer (SWEEP_INTERVAL_MS). No client-driven expiry.
 *
 * Env (optional): PORT (default 8787), HOST (default 127.0.0.1),
 *                 DATA_DIR (default ./data), DB_PATH (default <DATA_DIR>/relay.db),
 *                 STALE_HOURS (default 168), SWEEP_INTERVAL_MS (default 3600000)
 */

const http = require('node:http');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'relay.db');
// Stale-trip sweep: a route is "stale" once it has gone this long without any
// update (create/patch/activate/reorder). Default 168h = 7 days, matching the
// one-week-trip scope in docs/SECURITY.md — a week-long trip is never touched,
// and its data self-cleans ~a week after the last edit.
const STALE_HOURS = Number(process.env.STALE_HOURS || 168);
const STALE_MS = STALE_HOURS * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = Number(process.env.SWEEP_INTERVAL_MS || 60 * 60 * 1000);

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS routes (
    id         TEXT PRIMARY KEY,
    trip_code  TEXT NOT NULL,
    label      TEXT,
    url        TEXT,
    provider   TEXT,
    kind       TEXT,
    status     TEXT NOT NULL DEFAULT 'pending',
    author     TEXT,
    sort_order INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_routes_trip ON routes(trip_code);
`);

let orderCounter = Date.now();

const VALID_STATUS = new Set(['pending', 'active', 'done', 'removed']);
const VALID_KIND = new Set(['destination', 'waypoint']);
const VALID_PROVIDER = new Set(['google', 'apple', 'text', 'other']);
const TRIP_RE = /^[A-Za-z0-9_-]{1,64}$/;

function now() { return Date.now(); }

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function rowToRoute(row) {
  return {
    id: row.id,
    tripCode: row.trip_code,
    label: row.label || '',
    url: row.url || '',
    provider: row.provider || 'other',
    kind: row.kind || 'destination',
    status: row.status || 'pending',
    author: row.author || 'You',
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getRoutes(tripCode) {
  const stmt = db.prepare(
    'SELECT * FROM routes WHERE trip_code = ? ORDER BY sort_order DESC, created_at DESC'
  );
  return stmt.all(tripCode).map(rowToRoute);
}

function getRoute(tripCode, id) {
  const stmt = db.prepare('SELECT * FROM routes WHERE trip_code = ? AND id = ?');
  const row = stmt.get(tripCode, id);
  return row ? rowToRoute(row) : null;
}

function insertRoute(tripCode, fields) {
  const id = crypto.randomUUID();
  const ts = now();
  orderCounter += 1;
  const stmt = db.prepare(`
    INSERT INTO routes (id, trip_code, label, url, provider, kind, status, author, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id, tripCode,
    fields.label || '', fields.url || '',
    fields.provider || 'other', fields.kind || 'destination',
    fields.status || 'pending', fields.author || 'You',
    orderCounter, ts, ts
  );
  return getRoute(tripCode, id);
}

function updateRoute(tripCode, id, patch) {
  const existing = getRoute(tripCode, id);
  if (!existing) return null;

  if (patch.status !== undefined && !VALID_STATUS.has(patch.status)) throw httpError(400, 'invalid status');
  if (patch.kind !== undefined && !VALID_KIND.has(patch.kind)) throw httpError(400, 'invalid kind');
  if (patch.provider !== undefined && !VALID_PROVIDER.has(patch.provider)) throw httpError(400, 'invalid provider');

  const label = patch.label !== undefined ? patch.label : existing.label;
  const url = patch.url !== undefined ? patch.url : existing.url;
  const provider = patch.provider !== undefined ? patch.provider : existing.provider;
  const kind = patch.kind !== undefined ? patch.kind : existing.kind;
  const status = patch.status !== undefined ? patch.status : existing.status;
  const author = patch.author !== undefined ? patch.author : existing.author;

  db.prepare(`
    UPDATE routes SET label=?, url=?, provider=?, kind=?, status=?, author=?, updated_at=?
    WHERE trip_code=? AND id=?
  `).run(label, url, provider, kind, status, author, now(), tripCode, id);

  return getRoute(tripCode, id);
}

function activateRoute(tripCode, id) {
  const target = getRoute(tripCode, id);
  if (!target) return null;
  // Demote any currently-active route in this trip back to pending.
  db.prepare(
    "UPDATE routes SET status='pending', updated_at=? WHERE trip_code=? AND status='active'"
  ).run(now(), tripCode);
  db.prepare(
    "UPDATE routes SET status='active', updated_at=? WHERE trip_code=? AND id=?"
  ).run(now(), tripCode, id);
  return getRoute(tripCode, id);
}

function deleteRoute(tripCode, id) {
  const res = db.prepare('DELETE FROM routes WHERE trip_code = ? AND id = ?').run(tripCode, id);
  return res.changes > 0;
}

// Delete routes idle longer than the cutoff (epoch ms). Server-side only — the
// client has no expiry endpoint, so a stale trip can't be kept alive by an app
// that stops polling. Called once at startup and then on a timer.
function sweepStaleRoutes(cutoffMs) {
  if (cutoffMs === undefined) cutoffMs = now() - STALE_MS;
  const res = db.prepare('DELETE FROM routes WHERE updated_at < ?').run(cutoffMs);
  if (res.changes > 0) {
    console.log(`[route-relay] sweep: removed ${res.changes} stale route(s) (updated_at < ${cutoffMs})`);
  }
  return res.changes;
}

function reorderRoutes(tripCode, orderedIds) {
  if (!Array.isArray(orderedIds)) throw httpError(400, 'orderedIds must be an array');
  if (new Set(orderedIds).size !== orderedIds.length) throw httpError(400, 'duplicate ids in orderedIds');

  const existing = getRoutes(tripCode);
  const existingIds = new Set(existing.map((r) => r.id));
  if (orderedIds.length !== existingIds.size) throw httpError(400, 'orderedIds must list every route in the trip exactly once');
  for (const id of orderedIds) {
    if (!existingIds.has(id)) throw httpError(400, 'unknown route id: ' + id);
  }

  const stmt = db.prepare('UPDATE routes SET sort_order=?, updated_at=? WHERE trip_code=? AND id=?');
  const n = orderedIds.length;
  orderedIds.forEach((id, i) => {
    stmt.run(n - i, now(), tripCode, id); // index 0 => highest sort_order (top of list)
  });
  return getRoutes(tripCode);
}

/* ----- HTTP helpers ----- */

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 1_000_000) {
        reject(httpError(413, 'body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(httpError(400, 'invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/* ----- Routing ----- */

const server = http.createServer(async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  try {
    if (req.method === 'GET' && pathname === '/health') {
      return sendJson(res, 200, { ok: true, service: 'route-relay', time: now() });
    }

    // Match /reorder BEFORE the generic :id route (the word "reorder" would otherwise be read as an id).
    const mReorder = pathname.match(/^\/api\/trips\/([^/]+)\/routes\/reorder$/);
    const mActivate = pathname.match(/^\/api\/trips\/([^/]+)\/routes\/([^/]+)\/activate$/);
    const m = pathname.match(/^\/api\/trips\/([^/]+)\/routes$/);
    const mOne = pathname.match(/^\/api\/trips\/([^/]+)\/routes\/([^/]+)$/);

    if (mReorder && req.method === 'POST') {
      const code = mReorder[1];
      if (!TRIP_RE.test(code)) throw httpError(400, 'invalid trip code');
      const body = await readBody(req);
      return sendJson(res, 200, { routes: reorderRoutes(code, body.orderedIds) });
    }

    if (m && req.method === 'GET') {
      const code = m[1];
      if (!TRIP_RE.test(code)) throw httpError(400, 'invalid trip code');
      return sendJson(res, 200, { routes: getRoutes(code) });
    }

    if (m && req.method === 'POST') {
      const code = m[1];
      if (!TRIP_RE.test(code)) throw httpError(400, 'invalid trip code');
      const body = await readBody(req);
      if (!body.label && !body.url) throw httpError(400, 'label or url required');
      return sendJson(res, 201, insertRoute(code, body));
    }

    if (mActivate && req.method === 'POST') {
      const [code, id] = [mActivate[1], mActivate[2]];
      const route = activateRoute(code, id);
      if (!route) throw httpError(404, 'route not found');
      return sendJson(res, 200, route);
    }

    if (mOne && req.method === 'PATCH') {
      const [code, id] = [mOne[1], mOne[2]];
      const body = await readBody(req);
      const route = updateRoute(code, id, body);
      if (!route) throw httpError(404, 'route not found');
      return sendJson(res, 200, route);
    }

    if (mOne && req.method === 'DELETE') {
      const [code, id] = [mOne[1], mOne[2]];
      if (!deleteRoute(code, id)) throw httpError(404, 'route not found');
      res.writeHead(204);
      res.end();
      return;
    }

    throw httpError(404, 'not found');
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    sendJson(res, status, { error: e.message || 'server error' });
  }
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`[route-relay] listening on http://${HOST}:${PORT}`);
    console.log(`[route-relay] database: ${DB_PATH}`);
    console.log(
      `[route-relay] stale sweep: routes idle > ${STALE_HOURS}h removed every ${Math.round(SWEEP_INTERVAL_MS / 60000)}m`
    );
    sweepStaleRoutes(); // clean up at startup
    setInterval(sweepStaleRoutes, SWEEP_INTERVAL_MS);
  });
}

// Exported for tests (scripts/test-sweep.js) and reuse; no side effects beyond
// DB init when required.
module.exports = {
  server,
  db,
  sweepStaleRoutes,
  insertRoute,
  getRoutes,
  getRoute,
  updateRoute,
  activateRoute,
  deleteRoute,
  reorderRoutes,
  now,
  rowToRoute,
  VALID_STATUS,
  VALID_KIND,
  VALID_PROVIDER,
  TRIP_RE,
  STALE_MS,
};
