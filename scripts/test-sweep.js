'use strict';
/**
 * Validates the backend's stale-trip sweep (Phase 7) against a throwaway DB.
 * Run: node scripts/test-sweep.js
 *
 * Drives the sweep directly via the server module's exports (no network), so it
 * is deterministic and fast. It verifies the cutoff semantics: a route with an
 * `updated_at` older than the cutoff is removed, a route at/after the cutoff
 * survives, and the sweep is a global timestamp cleanup (not trip-scoped).
 */
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

// Point the server at a temp DB BEFORE requiring it (env is read at load time).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-sweep-'));
process.env.DATA_DIR = tmp;
process.env.DB_PATH = path.join(tmp, 'relay.db');
process.env.HOST = '127.0.0.1';
process.env.PORT = '0';

const srv = require('../backend/server.js');

let pass = 0;
let fail = 0;

function t(name, fn) {
  try {
    fn();
    pass += 1;
    console.log('  \u2713 ' + name);
  } catch (e) {
    fail += 1;
    console.error('  \u2717 ' + name + '\n    ' + e.message);
  }
}

const APPLE = 'https://maps.apple.com/directions?destination=Montreal&mode=driving';

t('inserts two routes and returns both', () => {
  const a = srv.insertRoute('SWEEP1', { label: 'fresh', url: APPLE });
  const b = srv.insertRoute('SWEEP1', { label: 'stale', url: APPLE });
  assert.ok(a && a.id, 'route a created');
  assert.ok(b && b.id, 'route b created');
  assert.strictEqual(srv.getRoutes('SWEEP1').length, 2);
});

t('sweep removes only routes older than the cutoff', () => {
  const routes = srv.getRoutes('SWEEP1');
  const stale = routes.find((r) => r.label === 'stale');
  const fresh = routes.find((r) => r.label === 'fresh');
  assert.ok(stale && fresh, 'both routes present');

  const now = srv.now();
  // Deterministic timestamps: stale is old, fresh is "now".
  srv.db.prepare('UPDATE routes SET updated_at = ? WHERE id = ?').run(now - 100000, stale.id);
  srv.db.prepare('UPDATE routes SET updated_at = ? WHERE id = ?').run(now, fresh.id);

  const removed = srv.sweepStaleRoutes(now);
  assert.strictEqual(removed, 1, 'exactly one route removed');

  const remaining = srv.getRoutes('SWEEP1');
  assert.strictEqual(remaining.length, 1, 'one route remains');
  assert.strictEqual(remaining[0].id, fresh.id, 'the fresh route survives');
});

t('cutoff is strict — updated_at == cutoff survives', () => {
  const fresh = srv.getRoutes('SWEEP1')[0];
  const removed = srv.sweepStaleRoutes(fresh.updatedAt);
  assert.strictEqual(removed, 0, 'nothing at the boundary is removed');
  assert.strictEqual(srv.getRoutes('SWEEP1').length, 1);
});

t('a cutoff far in the past leaves fresh routes alone', () => {
  const removed = srv.sweepStaleRoutes(srv.now() - 60 * 60 * 1000);
  assert.strictEqual(removed, 0);
  assert.strictEqual(srv.getRoutes('SWEEP1').length, 1);
});

t('sweep is a global timestamp cleanup, not trip-scoped', () => {
  // A fresh route in a different trip survives the same sweep.
  const other = srv.insertRoute('OTHER', { label: 'other-fresh', url: APPLE });
  srv.db.prepare('UPDATE routes SET updated_at = ? WHERE id = ?').run(srv.now(), other.id);

  const removed = srv.sweepStaleRoutes(srv.now() - 1000);
  assert.strictEqual(removed, 0, 'no route is older than now-1000ms');
  assert.strictEqual(srv.getRoutes('OTHER').length, 1, 'OTHER route untouched');
});

// Cleanup.
srv.db.close();
fs.rmSync(tmp, { recursive: true, force: true });

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
