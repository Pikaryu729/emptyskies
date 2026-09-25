/* EmptySkies — core. The ES namespace every other script builds on.
   The track data lives here and only here. Load order: core, sky, player, site, barb. */
(function () {
  'use strict';
  var FILE = location.protocol === 'file:';
  var ROOT = new URL('../', document.currentScript.src).href;
  var SC = 'https://soundcloud.com/emptyskies-416412725/';

  // newest first. ms = SoundCloud widget duration. dates are UTC, never converted.
  var tracks = [
    { n: '05', slug: 'nohand2hold', title: 'NoHand2Hold', id: 2399402322, permalink: SC + 'nohand2hold',
      genre: 'rap', uploaded: '2026-09-12T20:13:30Z', ms: 225206, cap: 'no hand 2 hold so i put racks in my jeans..', credit: '', depth: -1.2 },
    { n: '04', slug: 'deathalliwant', title: 'DeathAlliWant', id: 2399399265, permalink: SC + 'deathalliwant',
      genre: 'rap', uploaded: '2026-09-12T20:05:20Z', ms: 173425, cap: 'im tryn tryna die.', credit: 'after Michelangelo, The Last Judgment (detail)', depth: -1.4 },
    { n: '03', slug: 'mylittlesoldier', title: 'MyLittleSoldier', id: 2386744950, permalink: SC + 'mylittlesoldier',
      genre: 'alt rock', uploaded: '2026-08-23T14:21:46Z', ms: 249926, cap: 'hold close', credit: 'after Egon Schiele, Death and the Maiden (1915)', depth: -1.6 },
    { n: '02', slug: 'miracleoflife', title: 'MiracleOfLife', id: 2386067952, permalink: SC + 'mircle-of-life-2',
      genre: 'alt rock', uploaded: '2026-08-22T02:41:12Z', ms: 121264, cap: '', credit: '', depth: -1.8 },
    { n: '01', slug: 'bubbles', title: 'Bubbles', id: 2386052295, permalink: SC + 'bubbles',
      genre: 'ambient', uploaded: '2026-08-22T02:01:40Z', ms: 225075, cap: 'whispers of many broken promises', credit: '', depth: -2.0 }
  ];
  tracks.forEach(function (t) { t.path = 'music/' + t.slug + '/'; });
  var bySlug = {};
  tracks.forEach(function (t) { bySlug[t.slug] = t; });

  var world = [
    { key: 'above', path: 'emptyabovebelow/', depth: 1, label: 'emptyabovebelow' },
    { key: 'surface', path: '', depth: 0, label: 'surface' },
    { key: 'released', path: '#released', depth: -1, label: 'released' }
  ].concat(tracks.map(function (t) {
    return { key: t.slug, path: t.path, depth: t.depth, label: t.n + ' ' + t.title };
  }), [{ key: 'floor', path: 'links/', depth: -3, label: 'links' }]);

  // absolute href for a root-relative path. file: has no directory indexes, so name them.
  function url(p) {
    var u = new URL(p, ROOT);
    if (FILE && /\/$/.test(u.pathname)) u.pathname += 'index.html';
    return u.href;
  }
  // root-relative path of a url ('' = home, 'links/', 'music/bubbles/'), or null if outside the site
  function rel(u) {
    var base = new URL(u, location.href).href.split(/[?#]/)[0];
    if (base.indexOf(ROOT) !== 0) return null;
    var p = base.slice(ROOT.length).replace(/(^|\/)index\.html$/, '$1');
    if (p && !/\/$|\.\w+$/.test(p)) p += '/';
    return p;
  }
  function depthOf(u) {
    var p = rel(u);
    if (p === null) return -4;
    if (p === '' && new URL(u, location.href).hash === '#released') return -1;
    if (p === 'music/') return -1;
    for (var i = 0; i < world.length; i++) if (world[i].path === p) return world[i].depth;
    return -4;
  }

  function mq(q) {
    var m = window.matchMedia ? matchMedia(q) : { matches: false };
    m.watch = function (fn) {
      if (m.addEventListener) m.addEventListener('change', fn); else if (m.addListener) m.addListener(fn);
    };
    return m;
  }

  // one rAF for everyone. fn(dt seconds, clamped to .05, now ms). sleeps while hidden or idle.
  var fns = [], raf = 0, last = 0;
  function loop(now) {
    raf = 0;
    if (document.hidden || !fns.length) { last = 0; return; }
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60, list = fns;
    last = now;
    for (var i = 0; i < list.length; i++) list[i](dt, now);
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function wake() { if (!raf && fns.length && !document.hidden) raf = requestAnimationFrame(loop); }
  document.addEventListener('visibilitychange', function () { last = 0; wake(); });

  var live = document.createElement('p');
  live.id = 'live'; live.className = 'sr-only'; live.setAttribute('aria-live', 'polite');
  document.body.appendChild(live);
  var sayT = 0;
  function say(text) {
    live.textContent = '';
    clearTimeout(sayT);
    sayT = setTimeout(function () { live.textContent = text; }, 60);
  }

  function area(kind) { try { return window[kind]; } catch (e) { return null; } }
  function sget(s, k, d) {
    try { var v = s && s.getItem('es:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
  }
  function sset(s, k, v) { try { if (s) s.setItem('es:' + k, JSON.stringify(v)); } catch (e) {} }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  var fmt = {
    time: function (ms) { var s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + pad(s % 60); },
    ago: function (iso) {
      var d = Math.floor((Date.now() - Date.parse(iso)) / 864e5);
      return d <= 0 ? 'today' : d === 1 ? '1 day ago' : d + ' days ago';
    },
    depth: function (d) {
      if (d <= -4) return '−∞';
      return (d > 0.004 ? '+' : d < -0.004 ? '−' : '') + Math.abs(d).toFixed(2);
    },
    utc: function (iso) {  // '09.12.26 · 20:13 UTC'
      var t = new Date(iso);
      return pad(t.getUTCMonth() + 1) + '.' + pad(t.getUTCDate()) + '.' + pad(t.getUTCFullYear() % 100) +
        ' · ' + pad(t.getUTCHours()) + ':' + pad(t.getUTCMinutes()) + ' UTC';
    }
  };

  var noop = function () {};
  var done = function () { return Promise.resolve(); };
  var mReduce = mq('(prefers-reduced-motion: reduce)'), mCoarse = mq('(hover: none)');

  var ES = window.ES = {
    ROOT: ROOT, FILE: FILE, SC: SC,
    url: url, rel: rel, depthOf: depthOf,
    reduce: mReduce.matches, coarse: mCoarse.matches,
    sleep: function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); },
    tracks: tracks, world: world,
    track: function (slug) { return bySlug[slug] || null; },
    tick: {
      add: function (fn) { if (fns.indexOf(fn) < 0) fns = fns.concat(fn); wake(); },
      remove: function (fn) { fns = fns.filter(function (f) { return f !== fn; }); }
    },
    say: say,
    emit: function (name, detail) { document.dispatchEvent(new CustomEvent('es:' + name, { detail: detail || {} })); },
    on: function (name, fn) {
      var h = function (e) { fn(e.detail, e); };
      document.addEventListener('es:' + name, h);
      return function () { document.removeEventListener('es:' + name, h); };
    },
    store: {
      get: function (k, d) { return sget(area('localStorage'), k, d); },
      set: function (k, v) { sset(area('localStorage'), k, v); },
      sget: function (k, d) { return sget(area('sessionStorage'), k, d); },
      sset: function (k, v) { sset(area('sessionStorage'), k, v); }
    },
    fmt: fmt,
    pages: {},
    // stand-ins until sky.js / player.js / site.js / barb.js replace them, so a missing module never throws
    sky: { gl: false, d: 0, page: noop, preview: noop, base: noop, ink: done, drain: done, ripple: noop, audio: noop },
    player: {
      state: 'idle', slug: null,
      play: function (slug) { var t = bySlug[slug]; if (t) window.open(t.permalink, '_blank', 'noopener'); },
      toggle: function (slug) { ES.player.play(slug); },
      pause: noop, next: noop, seek: noop,
      pos: function () { return 0; }, dur: function () { return 0; }, level: function () { return 0; }
    },
    menu: { open: noop, close: noop },
    router: { go: function (u) { location.href = u; }, current: rel(location.href) }
  };

  mReduce.watch(function () { ES.reduce = mReduce.matches; ES.emit('prefs'); });
  mCoarse.watch(function () { ES.coarse = mCoarse.matches; ES.emit('prefs'); });
})();
