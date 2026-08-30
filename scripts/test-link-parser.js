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

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
