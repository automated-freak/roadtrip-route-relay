'use strict';
/**
 * Validates link-parser.js against the test-link corpus in docs/RESEARCH.md.
 * Run: node scripts/test-link-parser.js
 */
const assert = require('node:assert');
const RouteLink = require('../link-parser.js');

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

const GOOD_LINKS = [
  { url: 'https://www.google.com/maps/dir/?api=1&origin=Toronto&destination=Montreal&travelmode=driving', provider: 'google', short: false },
  { url: 'https://www.google.com/maps/dir/?api=1&destination=Niagara+Falls&dir_action=navigate', provider: 'google', short: false },
  { url: 'https://www.google.com/maps/dir/?api=1&destination=Montreal&waypoints=Kingston|Ottawa&travelmode=driving', provider: 'google', short: false },
  { url: 'https://www.google.com/maps/search/?api=1&query=best+poutine+near+me', provider: 'google', short: false },
  { url: 'https://maps.app.goo.gl/AbCdEfGh123', provider: 'google', short: true },
  { url: 'https://goo.gl/maps/xYz123', provider: 'google', short: true },
  { url: 'https://maps.apple.com/?daddr=Niagara+Falls,+ON', provider: 'apple', short: false },
  { url: 'https://maps.apple.com/?saddr=Toronto&daddr=Montreal&dirflg=d', provider: 'apple', short: false },
  { url: 'https://maps.apple.com/directions?destination=Montreal&mode=driving', provider: 'apple', short: false },
  { url: 'https://maps.apple.com/directions?destination=Montreal&waypoint=Kingston&mode=driving', provider: 'apple', short: false },
];

const BAD_LINKS = [
  '',
  'https://example.com/not-a-map',
  'not a url at all',
  'javascript:alert(1)',
  'data:text/html,hello',
  'http://maps.apple.com/?daddr=x',
  'ftp://maps.google.com/foo',
];

console.log('Good links (accepted + classified):');
for (const c of GOOD_LINKS) {
  t(c.url, () => {
    const r = RouteLink.parse(c.url);
    assert.strictEqual(r.kind, 'link', 'should be a link');
    assert.strictEqual(r.provider, c.provider, 'provider');
    assert.strictEqual(r.short, c.short, 'short flag');
    assert.ok(/^https:\/\//.test(r.url), 'url is https');
  });
}

console.log('Short links stored verbatim:');
t('maps.app.goo.gl/AbCdEfGh123', () => {
  const r = RouteLink.parse('https://maps.app.goo.gl/AbCdEfGh123');
  assert.strictEqual(r.url, 'https://maps.app.goo.gl/AbCdEfGh123');
});
t('goo.gl/maps/xYz123', () => {
  const r = RouteLink.parse('https://goo.gl/maps/xYz123');
  assert.strictEqual(r.url, 'https://goo.gl/maps/xYz123');
});

console.log('Bad links (rejected as links with a clear message):');
for (const c of BAD_LINKS) {
  t(JSON.stringify(c), () => {
    const link = RouteLink.classifyLink(c);
    if (c === '' || c === 'not a url at all') {
      assert.strictEqual(link, null, 'should be null (not a link)');
    } else {
      assert.ok(link && typeof link.error === 'string', 'should reject with a message');
    }
  });
}

console.log('Typed destinations (generate Google + Apple URLs):');
t('Tim Hortons near me', () => {
  const r = RouteLink.parse('Tim Hortons near me');
  assert.strictEqual(r.kind, 'text');
  assert.strictEqual(r.provider, 'apple', 'default provider');
  assert.ok(/^https:\/\/maps\.apple\.com\/directions\?destination=/.test(r.appleUrl), 'apple url');
  assert.ok(/^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/.test(r.googleUrl), 'google search url');
});
t('Niagara Falls, ON', () => {
  const r = RouteLink.parse('Niagara Falls, ON');
  assert.strictEqual(r.kind, 'text');
  assert.ok(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/.test(r.googleUrl), 'google dir url');
  assert.ok(/^https:\/\/maps\.apple\.com\/directions\?destination=/.test(r.appleUrl), 'apple url');
});
t('empty input is an error', () => {
  const r = RouteLink.parse('   ');
  assert.strictEqual(r.kind, 'error');
  assert.ok(r.message, 'has a message');
});

console.log('Navigation normalization (Phase 5 — one-tap handoff):');
t('short link opens verbatim (maps.app.goo.gl)', () => {
  const url = 'https://maps.app.goo.gl/AbCdEfGh123';
  assert.strictEqual(RouteLink.normalizeForNavigation(url), url);
});
t('short link opens verbatim (goo.gl/maps)', () => {
  const url = 'https://goo.gl/maps/xYz123';
  assert.strictEqual(RouteLink.normalizeForNavigation(url), url);
});
t('Google directions URL gains dir_action=navigate', () => {
  assert.strictEqual(
    RouteLink.normalizeForNavigation('https://www.google.com/maps/dir/?api=1&destination=Montreal'),
    'https://www.google.com/maps/dir/?api=1&destination=Montreal&dir_action=navigate'
  );
});
t('Google directions URL with dir_action is left unchanged', () => {
  const url = 'https://www.google.com/maps/dir/?api=1&destination=Niagara+Falls&dir_action=navigate';
  assert.strictEqual(RouteLink.normalizeForNavigation(url), url);
});
t('Google search URL is not mangled', () => {
  const url = 'https://www.google.com/maps/search/?api=1&query=best+poutine+near+me';
  assert.strictEqual(RouteLink.normalizeForNavigation(url), url);
});
t('Google waypoints pipe survives normalization', () => {
  assert.strictEqual(
    RouteLink.normalizeForNavigation('https://www.google.com/maps/dir/?api=1&destination=Montreal&waypoints=Kingston|Ottawa&travelmode=driving'),
    'https://www.google.com/maps/dir/?api=1&destination=Montreal&waypoints=Kingston|Ottawa&travelmode=driving&dir_action=navigate'
  );
});
t('Apple legacy URL gains start=3', () => {
  assert.strictEqual(
    RouteLink.normalizeForNavigation('https://maps.apple.com/?daddr=Niagara+Falls,+ON'),
    'https://maps.apple.com/?daddr=Niagara+Falls,+ON&start=3'
  );
});
t('Apple unified URL gains start=3', () => {
  assert.strictEqual(
    RouteLink.normalizeForNavigation('https://maps.apple.com/directions?destination=Montreal&mode=driving'),
    'https://maps.apple.com/directions?destination=Montreal&mode=driving&start=3'
  );
});
t('Apple URL with start already set is left unchanged', () => {
  const url = 'https://maps.apple.com/directions?destination=Montreal&start=1&mode=driving';
  assert.strictEqual(RouteLink.normalizeForNavigation(url), url);
});
t('unknown host is left unchanged', () => {
  const url = 'https://example.com/x';
  assert.strictEqual(RouteLink.normalizeForNavigation(url), url);
});
t('non-https is left unchanged (no mangling)', () => {
  assert.strictEqual(RouteLink.normalizeForNavigation('javascript:alert(1)'), 'javascript:alert(1)');
});

console.log('Multistop itinerary (Phase 6):');
t('placeToken extracts Google destination', () => {
  assert.strictEqual(
    RouteLink.placeToken('https://www.google.com/maps/dir/?api=1&destination=Montreal&travelmode=driving'),
    'Montreal'
  );
});
t('placeToken extracts Google destination with waypoints', () => {
  assert.strictEqual(
    RouteLink.placeToken('https://www.google.com/maps/dir/?api=1&destination=Montreal&waypoints=Kingston|Ottawa'),
    'Montreal'
  );
});
t('placeToken extracts Google search query', () => {
  assert.strictEqual(
    RouteLink.placeToken('https://www.google.com/maps/search/?api=1&query=best+poutine+near+me'),
    'best poutine near me'
  );
});
t('placeToken extracts Apple legacy daddr', () => {
  assert.strictEqual(
    RouteLink.placeToken('https://maps.apple.com/?daddr=Niagara+Falls,+ON'),
    'Niagara Falls, ON'
  );
});
t('placeToken extracts Apple unified destination', () => {
  assert.strictEqual(
    RouteLink.placeToken('https://maps.apple.com/directions?destination=Montreal&mode=driving'),
    'Montreal'
  );
});
t('placeToken is empty for short links', () => {
  assert.strictEqual(RouteLink.placeToken('https://maps.app.goo.gl/AbCdEfGh123'), '');
});
t('placeToken is empty for non-maps/unknown/non-https', () => {
  assert.strictEqual(RouteLink.placeToken('https://example.com/x'), '');
  assert.strictEqual(RouteLink.placeToken('javascript:alert(1)'), '');
});

t('buildItinerary google multi-stop', () => {
  assert.strictEqual(
    RouteLink.buildItinerary('google', ['Toronto', 'Kingston', 'Ottawa']),
    'https://www.google.com/maps/dir/?api=1&destination=Ottawa&waypoints=Toronto|Kingston&travelmode=driving'
  );
});
t('buildItinerary google single-stop (no waypoints)', () => {
  assert.strictEqual(
    RouteLink.buildItinerary('google', ['Montreal']),
    'https://www.google.com/maps/dir/?api=1&destination=Montreal&travelmode=driving'
  );
});
t('buildItinerary apple multi-stop (repeated waypoint)', () => {
  assert.strictEqual(
    RouteLink.buildItinerary('apple', ['Toronto', 'Kingston', 'Ottawa']),
    'https://maps.apple.com/directions?destination=Ottawa&waypoint=Toronto&waypoint=Kingston&mode=driving'
  );
});
t('buildItinerary apple single-stop', () => {
  assert.strictEqual(
    RouteLink.buildItinerary('apple', ['Montreal']),
    'https://maps.apple.com/directions?destination=Montreal&mode=driving'
  );
});
t('buildItinerary empty/invalid returns empty', () => {
  assert.strictEqual(RouteLink.buildItinerary('apple', []), '');
  assert.strictEqual(RouteLink.buildItinerary('google', null), '');
  assert.strictEqual(RouteLink.buildItinerary('unknown', ['A', 'B']), '');
});

t('normalizeForNavigation applies to built apple itinerary (+start)', () => {
  const built = RouteLink.buildItinerary('apple', ['Toronto', 'Kingston', 'Ottawa']);
  assert.strictEqual(
    RouteLink.normalizeForNavigation(built),
    'https://maps.apple.com/directions?destination=Ottawa&waypoint=Toronto&waypoint=Kingston&mode=driving&start=3'
  );
});
t('normalizeForNavigation applies to built google itinerary (+dir_action)', () => {
  const built = RouteLink.buildItinerary('google', ['Toronto', 'Kingston', 'Ottawa']);
  assert.strictEqual(
    RouteLink.normalizeForNavigation(built),
    'https://www.google.com/maps/dir/?api=1&destination=Ottawa&waypoints=Toronto|Kingston&travelmode=driving&dir_action=navigate'
  );
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
