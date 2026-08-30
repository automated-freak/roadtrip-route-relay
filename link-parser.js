/* ==========================================================================
   Route Relay — link parser / classifier (Phase 4)
   Turns free-text destinations and pasted Google/Apple Maps links into a
   classified, canonical, safe route record. Pure functions, no DOM, so it
   runs both in the browser (window.RouteLink) and in Node (for tests).

   Responsibilities:
   - classify a pasted URL as Google Maps / Apple Maps / unknown
   - validate the URL is https + a known maps host (reject javascript:/data:)
   - keep short links (maps.app.goo.gl, goo.gl/maps) verbatim — they resolve
     on the target device, never server-side
   - build canonical deep links for typed destinations (Google + Apple)

   Default provider for typed destinations: Apple Maps (see PRODUCT_SPEC §7) —
   everyone on the trip uses an iPhone and Apple Maps is CarPlay-first. The
   Google URL is still generated (exposed as `googleUrl`) so a provider toggle
   is a one-line change later.
   ========================================================================== */

(function (global) {
  'use strict';

  var DEFAULT_PROVIDER = 'apple'; // per PRODUCT_SPEC §7 (all-iPhone, CarPlay-first)

  /* ------------------------------------------------------------------ *
   * Canonical deep-link builders (typed destinations)
   * ------------------------------------------------------------------ */

  // Google: a "search" URL for near-me queries, otherwise a directions URL
  // with no `origin` (Google falls back to the device's current location).
  function buildGoogleUrl(text) {
    var q = encodeURIComponent(text).replace(/%20/g, '+');
    if (/near\s*me|nearby|around\s*here|close\s*by/i.test(text)) {
      return 'https://www.google.com/maps/search/?api=1&query=' + q;
    }
    return 'https://www.google.com/maps/dir/?api=1&destination=' + q;
  }

  // Apple: unified Maps URL (iOS 18.4+); no `source` → current location.
  function buildAppleUrl(text) {
    return 'https://maps.apple.com/directions?destination=' +
      encodeURIComponent(text) + '&mode=driving';
  }

  /* ------------------------------------------------------------------ *
   * Host classification
   * ------------------------------------------------------------------ */

  function bareHost(hostname) {
    return String(hostname || '').toLowerCase().replace(/^www\./, '');
  }

  // Known maps hosts only (see SECURITY.md "Input validation").
  function hostProvider(hostname) {
    var h = bareHost(hostname);
    if (h === 'google.com' || h.slice(-'.google.com'.length) === '.google.com') return 'google';
    if (h === 'goo.gl' || h.slice(-'.goo.gl'.length) === '.goo.gl') return 'google';
    if (h === 'maps.apple.com') return 'apple';
    return null;
  }

  function isShortLink(hostname) {
    var h = bareHost(hostname);
    return h === 'goo.gl' || h.slice(-'.goo.gl'.length) === '.goo.gl';
  }

  /* ------------------------------------------------------------------ *
   * Link classification + validation
   * ------------------------------------------------------------------ */

  // A light "what would a human see as the label" from a maps URL's
  // destination-ish param, so pasted links get a sensible default label.
  function labelHintFromUrl(url) {
    var want = ['destination', 'daddr', 'query', 'q'];
    var raw = '';
    try {
      for (var i = 0; i < want.length; i++) {
        var v = url.searchParams.get(want[i]);
        if (v) { raw = v; break; }
      }
    } catch (e) { /* leave raw empty */ }
    if (!raw) return '';
    try { raw = decodeURIComponent(raw); } catch (e) { /* leave as-is */ }
    raw = raw.replace(/\+/g, ' ').trim();
    return raw.length > 48 ? raw.slice(0, 48) : raw;
  }

  // Returns { provider, url, short, labelHint } for a valid maps link,
  //         { error } for a rejected link, or null if the string is not a URL.
  function classifyLink(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return null;

    var schemeMatch = s.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
    var url;

    if (schemeMatch) {
      var scheme = schemeMatch[1].toLowerCase();
      if (scheme !== 'https' && scheme !== 'http') {
        return {
          error: '“' + scheme + ':” links aren’t supported — paste an https Google/Apple Maps link, or type a place.',
        };
      }
      try {
        url = new URL(s);
      } catch (e) {
        return { error: 'That doesn’t look like a valid link.' };
      }
    } else if (/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+(\/|$)/.test(s)) {
      // Bare hostname (e.g. maps.app.goo.gl/abc) — assume https.
      try {
        url = new URL('https://' + s);
      } catch (e) {
        return { error: 'That doesn’t look like a valid link.' };
      }
    } else {
      return null; // not a URL → caller treats it as free text
    }

    if (url.protocol !== 'https:') {
      if (url.protocol === 'http:') {
        return { error: 'Only https links are supported — update the link to https.' };
      }
      return { error: '“' + url.protocol + '” links aren’t supported — paste an https Google/Apple Maps link.' };
    }

    var provider = hostProvider(url.hostname);
    if (!provider) {
      return {
        error: 'That link isn’t a Google or Apple Maps link (' + url.hostname +
          '). Paste a Google/Apple Maps link, or type a place instead.',
      };
    }

    // Store the link verbatim (short links must never be re-parsed/normalized).
    var verbatim = schemeMatch ? s : 'https://' + s;

    return {
      provider: provider,
      url: verbatim,
      short: isShortLink(url.hostname),
      labelHint: labelHintFromUrl(url),
    };
  }

  /* ------------------------------------------------------------------ *
   * Top-level parse (used by the submit flow)
   * ------------------------------------------------------------------ */

  // Returns:
  //   { kind:'link',  provider, url, short, labelHint }
  //   { kind:'text',  provider, url, googleUrl, appleUrl, text, labelHint }
  //   { kind:'error', message }
  function parse(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) {
      return { kind: 'error', message: 'Enter a place or paste a Google/Apple Maps link first.' };
    }

    var looksLikeUrl =
      /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s) ||
      /^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+(\/|$)/.test(s);

    if (looksLikeUrl) {
      var r = classifyLink(s);
      if (r && r.error) return { kind: 'error', message: r.error };
      if (r) return { kind: 'link', provider: r.provider, url: r.url, short: r.short, labelHint: r.labelHint };
      // Fall through: not a URL after all (shouldn't happen given looksLikeUrl).
    }

    if (s.length > 200) {
      return { kind: 'error', message: 'That looks too long to be a place — try a shorter description.' };
    }

    var appleUrl = buildAppleUrl(s);
    var googleUrl = buildGoogleUrl(s);
    return {
      kind: 'text',
      provider: DEFAULT_PROVIDER,
      url: DEFAULT_PROVIDER === 'apple' ? appleUrl : googleUrl,
      googleUrl: googleUrl,
      appleUrl: appleUrl,
      text: s,
      labelHint: s.length > 48 ? s.slice(0, 48) : s,
    };
  }

  var RouteLink = {
    DEFAULT_PROVIDER: DEFAULT_PROVIDER,
    parse: parse,
    classifyLink: classifyLink,
    buildGoogleUrl: buildGoogleUrl,
    buildAppleUrl: buildAppleUrl,
    hostProvider: hostProvider,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RouteLink;
  } else {
    global.RouteLink = RouteLink;
  }
})(typeof window !== 'undefined' ? window : globalThis);
