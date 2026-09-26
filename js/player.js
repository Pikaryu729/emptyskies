/* EmptySkies — player. One SoundCloud "transmission" that outlives every page swap: a hidden widget,
   the dock, the [data-play|track|progress|weight|wave] hooks, waveform scars and the real-data level. */
(function () {
  'use strict';
  var ES = window.ES;
  if (!ES) return;
  var html = document.documentElement, tracks = ES.tracks, P = ES.player;

  var OPTS = { auto_play: true, visual: false, show_artwork: false, show_comments: false, show_reposts: false,
    show_teaser: false, hide_related: true, sharing: false, buying: false, download: false, show_playcount: false };
  var COLOR = '&color=%23060608';   // api.js load() turns every option into true/false, so the colour rides on the url
  var HINT = 'tap play on the soundcloud player to start';
  var WORD = { idle: 'now showing', loading: 'tuning', playing: 'now playing', paused: 'paused', blocked: 'tuning',
    ended: 'end of what\'s out', dead: 'player blocked' };
  var LOADED = /^(loading|playing|paused|blocked)$/;

  var state = 'idle', word = '', cur = null, cover = 'avatar', gotCover = false;
  var W = null, frame = null, booted = false, ready = false, switching = false, loaded = null, played = false, dead = false;
  var pending = null, blockT = 0, deadT = 0, collapseT = 0, keyT = 0, revealed = false, muted = false;
  var last = { pos: 0, at: 0 }, run = false, p0 = 0, heard = false, cueAt = null, cueFor = null, dragging = false;
  var env = 0, slow = 0, kick = 0, kickAt = -1e4, uiAt = 0, wAt = 0, wVal = null;
  var waves = {}, levels = {}, prog = [], scars = [], weights = [], scarId = 0;

  function now() { return performance.now(); }
  function clamp(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function each(sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); }
  function clock(ms) { return ('0' + ES.fmt.time(ms)).slice(-5); }            // '01:12'
  function iso(ms) { var s = Math.floor(Math.max(0, ms) / 1000); return 'PT' + Math.floor(s / 60) + 'M' + s % 60 + 'S'; }
  function api(t) { return 'https://api.soundcloud.com/tracks/' + t.id; }
  function live() { return !!cur && (state === 'playing' || state === 'loading' || state === 'blocked'); }
  function target() { return cur && state !== 'ended' ? cur : ES.track(cover) || tracks[0]; }  // what the dock's ▶ plays
  function pos() { return state === 'playing' && run ? Math.min(dur(), last.pos + now() - last.at) : last.pos; }
  function dur() { return cur ? cur.ms : 0; }
  function label(t, p) { return dead ? 'play ' + t.title + ' on SoundCloud (new tab)' : (p ? 'pause ' : 'play ') + t.title; }

  // ---- the dock (3.6)
  var dock = document.createElement('section');
  dock.id = 'dock'; dock.className = 'dock'; dock.setAttribute('aria-label', 'player');
  dock.innerHTML =
    '<button class="dock-play" type="button"><i class="ico" aria-hidden="true"></i></button>' +
    '<p class="dock-meta"><i class="rec" aria-hidden="true"></i><span class="dock-state"></span>' +
    '<span class="dock-sl" aria-hidden="true"></span><span class="dock-what"><a class="dock-title"></a>' +
    '<span class="dock-by">&nbsp;— EmptySkies</span></span>' +
    '<span class="dock-time"><span aria-hidden="true">&nbsp;· </span><time></time> / <time></time></span></p>' +
    '<button class="dock-next" type="button"><i class="ico" aria-hidden="true"></i></button>' +
    '<a class="dock-sc" target="_blank" rel="noopener"><span class="dock-sc-t"></span>↗</a>' +
    '<input class="dock-seek" type="range" min="0" max="1000" step="1" value="0" aria-label="seek">' +
    '<p class="dock-hint" role="status"></p><button class="sc-close" type="button" hidden>close</button>' +
    '<span class="sr-only" id="dock-dead">opens SoundCloud in a new tab</span>';
  function q(c) { return dock.querySelector('.' + c); }
  var playB = q('dock-play'), stateEl = q('dock-state'), slEl = q('dock-sl'), what = q('dock-what'), titleA = q('dock-title'),
    byEl = q('dock-by'), timeEl = q('dock-time'), times = dock.querySelectorAll('time'), nextB = q('dock-next'),
    scA = q('dock-sc'), scT = q('dock-sc-t'), seekR = q('dock-seek'), hint = q('dock-hint'), closeB = q('sc-close');

  function render() {
    var full = !!cur && LOADED.test(state), t = full ? cur : ES.track(cover), tg = target(), sc = cur || t, nx, txt, ae = document.activeElement;
    dock.classList.toggle('is-full', full);
    stateEl.textContent = word || (muted && state === 'playing' ? 'muted' : WORD[state]);   // M is one key: say so
    slEl.textContent = word === 'resume' ? ' ' : state === 'ended' || state === 'dead' ? ' · ' : ' / ';
    titleA.target = '';
    if (state === 'ended') { txt = 'emptyabovebelow: soon ↑'; titleA.href = ES.url('emptyabovebelow/'); }
    else if (t) { txt = t.title; titleA.href = ES.url(t.path); }
    else { txt = 'profile \u2197'; titleA.href = ES.SC; titleA.target = '_blank'; }   // never drop the href: a focused link would lose focus
    if (titleA.textContent !== txt) {
      titleA.textContent = txt;
      if (state === 'idle' && !ES.reduce && what.animate) what.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, easing: 'ease-out' });
    }
    what.hidden = state === 'dead';
    byEl.hidden = timeEl.hidden = seekR.hidden = nextB.hidden = !full;
    scA.hidden = !full && state !== 'dead';
    scT.textContent = state === 'dead' ? 'listen\u00a0on SoundCloud\u00a0' : 'on SoundCloud\u00a0';
    scA.href = sc ? sc.permalink : ES.SC;
    playB.setAttribute('aria-label', label(live() ? cur : tg, live()) + (muted && !dead ? ', muted' : ''));
    nx = full && tracks[tracks.indexOf(cur) + 1];
    nextB.disabled = full && !nx;
    nextB.setAttribute('aria-label', nx ? 'next: ' + nx.title : 'next');
    // a control that just hid or went disabled would drop the keyboard focus to <body>
    if (ae !== playB && dock.contains(ae) && (ae.disabled || ae.closest('[hidden]'))) playB.focus({ preventScroll: true });
  }

  // every hook on screen reflects the state; lists for the current track are cached for the ticker
  function sync() {
    var s = cur && LOADED.test(state) ? cur.slug : null, on = live();
    each('[data-play]', function (b) {
      var t = ES.track(b.getAttribute('data-play')), p = on && !!t && t.slug === s;
      if (dead) b.removeAttribute('aria-pressed'); else b.setAttribute('aria-pressed', p);   // dead: it opens a tab
      if (t && b.hasAttribute('aria-label')) b.setAttribute('aria-label', label(t, p));
      else if (dead) b.setAttribute('aria-describedby', 'dock-dead'); else b.removeAttribute('aria-describedby');
    });
    each('[data-track]', function (el) { el.classList.toggle('is-playing', state === 'playing' && el.getAttribute('data-track') === s); });
    prog = []; scars = []; weights = []; wVal = null;
    each('[data-progress]', function (el) {
      var c = el.getAttribute('data-progress') === s;
      el.classList.toggle('is-current', c);
      if (c) prog.push(el); else el.style.removeProperty('--p');
    });
    each('[data-wave]', function (el) {
      var c = el.getAttribute('data-wave') === s;
      el.classList.toggle('is-current', c);
      el.classList.toggle('is-playing', c && state === 'playing');
      if (c) scars.push(el); else paint(el, 0);
    });
    each('[data-weight]', function (el) {
      el.style.fontWeight = '';
      el.classList.remove('is-meter');
      if (el.getAttribute('data-weight') === s) weights.push(el);
    });
  }

  function vt(p, d) {
    var s = ES.fmt.time(p) + ' of ' + ES.fmt.time(d);
    if (seekR.getAttribute('aria-valuetext') !== s) seekR.setAttribute('aria-valuetext', s);
  }
  function ui() {
    if (!cur) return;
    var p = pos(), d = dur(), f = d ? clamp(p / d) : 0, a = clock(p), b = clock(d);
    if (times[1].textContent !== b) { times[1].textContent = b; times[1].dateTime = iso(d); }
    if (!dragging) {
      if (times[0].textContent !== a) { times[0].textContent = a; times[0].dateTime = iso(p); }
      seekR.value = Math.round(f * 1000);
      seekR.style.setProperty('--p', f.toFixed(4));
      if (document.activeElement !== seekR) vt(p, d);   // a focused slider gets it on input, not every second
    }
    prog.forEach(function (el) { el.style.setProperty('--p', f.toFixed(4)); });
    scars.forEach(function (el) { paint(el, f); });
  }

  function set(s, w) {
    var was = state;
    state = P.state = s; word = w || '';
    P.slug = cur && LOADED.test(s) ? cur.slug : null;   // ended/dead: nothing is loaded
    html.setAttribute('data-player', s);
    if (s === 'playing') html.setAttribute('data-playing', cur.slug); else html.removeAttribute('data-playing');
    if (s === 'paused' && was === 'playing') ES.say('paused');   // 'playing X' waits for real sound (onProgress)
    sync(); render(); ui();
    if (cur && !dragging) vt(pos(), dur());   // ui() spares a focused range; a state or track change must not
    ES.emit('player', { state: s, slug: P.slug });
    if (s === 'playing') ES.tick.add(tick);
  }

  // ---- the SoundCloud widget. Nothing loads before the first play intent.
  function boot(t) {
    if (booted || dead) return;
    booted = true;
    wait();
    var s = document.createElement('script');
    s.src = 'https://w.soundcloud.com/player/api.js';
    s.onerror = die;
    s.onload = function () {   // api.js must be listening before the widget says READY, so the iframe comes second
      if (dead) return;
      if (!window.SC || !SC.Widget) { die(); return; }
      wait();
      var go = state === 'loading';
      if (go) t = cur;
      frame = document.createElement('iframe');
      frame.id = 'sc'; frame.title = 'SoundCloud player'; frame.allow = 'autoplay';
      frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
      frame.addEventListener('load', function () { if (!ready) wait(10000); });
      frame.src = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(api(t)) + '&' +
        Object.keys(OPTS).map(function (k) { return k + '=' + (k === 'auto_play' ? go : OPTS[k]); }).join('&') + COLOR;
      dock.parentNode.insertBefore(frame, dock.nextSibling);   // never moved again: moving an iframe reloads it
      loaded = t.slug;
      var E = SC.Widget.Events;
      W = SC.Widget(frame);
      W.bind(E.READY, onReady);
      W.bind(E.PLAY, onPlay);
      W.bind(E.PAUSE, onPause);
      W.bind(E.FINISH, onFinish);
      W.bind(E.PLAY_PROGRESS, onProgress);
      W.bind(E.ERROR, die);
    };
    document.head.appendChild(s);
  }
  function load(t) {
    ready = false; switching = true; loaded = t.slug; played = false;
    pending = arm;
    wait();
    W.load(encodeURIComponent(api(t)) + COLOR, Object.assign({}, OPTS, { callback: onReady }));
  }
  function onReady() {   // first READY, and the callback of every load()
    if (dead) return;
    ready = true; switching = false;
    clearTimeout(deadT);
    if (muted) W.setVolume(0);
    var p = pending; pending = null;
    if (p) p();
  }
  function exec() {      // bring the widget to cur and play it
    if (!ready) { pending = exec; return; }
    if (loaded !== cur.slug) load(cur);
    else { W.play(); arm(); }
  }
  // dead: no READY 10s after the widget's page has loaded (30s cap for slow networks), an ERROR, or no api.js
  function wait(ms) { clearTimeout(deadT); deadT = setTimeout(die, ms || 30000); }
  // a refused play shows up as PLAY then PAUSE with no sound (onPause). This is the fallback for a widget that
  // never answers at all; slow streams take seconds to start, so it waits long enough not to misread them.
  function arm() {
    clearTimeout(blockT);
    blockT = setTimeout(function () { if (state === 'loading' && ready) { set('blocked'); reveal(); } }, 10000);
  }
  function die() {
    if (dead) return;
    dead = true; ready = false; pending = null;
    clearTimeout(deadT); clearTimeout(blockT);
    collapse();
    if (frame) frame.remove();
    frame = W = null;
    ES.sky.base(null);
    set('dead');
  }
  function reveal() {
    revealed = true;
    frame.classList.add('show'); frame.removeAttribute('aria-hidden'); frame.removeAttribute('tabindex');
    closeB.hidden = false; hint.textContent = HINT;
  }
  function collapse() {
    clearTimeout(collapseT);
    if (!revealed) return;
    revealed = false; closeB.hidden = true; hint.textContent = '';
    if (!frame) return;
    if (document.activeElement === frame) playB.focus();
    frame.classList.remove('show'); frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
  }

  // widget events. Anything between load() and its callback belongs to the old sound.
  function onPlay() {
    if (switching || dead) return;
    if (!LOADED.test(state) || state === 'paused') { W.pause(); return; }   // only play() may start sound
    clearTimeout(blockT);
    if (cueAt != null) { W.seekTo(cueAt); last = { pos: cueAt, at: now() }; cueAt = null; } else last.at = now();
    played = true; run = false;
    if (state !== 'playing') { heard = false; p0 = last.pos; }   // the widget sends PLAY twice on its first start
    if (muted) W.setVolume(0);
    ES.sky.base(cur.slug);
    if (state !== 'playing') set('playing');
  }
  function onPause(e) {
    if (switching || dead || state !== 'playing') return;
    if (e && e.currentPosition > dur() - 1500) { next(); return; }   // the end: FINISH can come late or not at all
    if (!heard) { set('blocked'); reveal(); return; }   // refused by the browser: PLAY, then PAUSE before any sound
    last = { pos: pos(), at: now() };
    set('paused');
  }
  function onFinish() { if (!switching && !dead && (state === 'playing' || state === 'paused')) next(); }
  function onProgress(e) {
    if (switching || dead || !e) return;
    run = e.currentPosition > last.pos + 1;   // interpolate only while the stream really moves (not while buffering)
    if (!heard && e.currentPosition > p0 + 100) {   // the position moved on its own: there is sound
      heard = true;
      if (state === 'playing') ES.say('playing ' + cur.title + (muted ? ', muted' : ''));
      if (revealed) collapseT = setTimeout(collapse, 600);
    }
    last = { pos: e.currentPosition, at: now() };
  }

  // ---- public API
  function play(slug, o) {
    var t = ES.track(slug) || target(), at = o && o.at != null ? Math.max(0, +o.at || 0) : null;
    if (dead) { window.open(t.permalink, '_blank', 'noopener'); return; }
    if (at == null && cueFor && cueFor.slug === t.slug) at = cueFor.at;
    cueFor = null;
    if (t === cur && state === 'playing') { if (at != null) seek(at); return; }
    if (t !== cur || state === 'ended') {
      cur = t; last = { pos: at || 0, at: now() };
      cueAt = at != null ? at : state === 'ended' ? 0 : null;
      wave(t.slug);
    } else if (at != null) { cueAt = at; last = { pos: at, at: now() }; }
    set('loading');
    boot(t);
    exec();
  }
  function toggle(slug) {
    var t = ES.track(slug) || target();
    if (live() && cur === t) pause(); else play(t.slug);
  }
  function pause() {
    if (!live()) return;
    clearTimeout(blockT);
    last = { pos: pos(), at: now() };
    collapse();
    if (ready) W.pause(); else pending = function () { W.pause(); };
    set('paused');
  }
  function next() {
    var i = cur ? tracks.indexOf(cur) : -1;
    if (i >= tracks.length - 1) end(); else play(tracks[i + 1].slug);
  }
  function end() {   // after 01 there is nothing else out
    clearTimeout(blockT);
    if (ready) W.pause();
    collapse();
    last = { pos: 0, at: now() };
    ES.sky.base(null);
    set('ended');
  }
  function seek(ms) {
    if (!cur || !LOADED.test(state)) return;
    ms = Math.max(0, Math.min(dur(), +ms || 0));
    last = { pos: ms, at: now() }; run = false;
    if (ready && played && loaded === cur.slug) W.seekTo(ms); else cueAt = ms;   // applied on the first PLAY
    ui();
  }
  function cue(slug, at, w) {   // load into the dock at a position, never play
    var t = ES.track(slug);
    if (!t || dead) return;
    at = Math.max(0, Math.min(t.ms, +at || 0));
    if (t === cur && LOADED.test(state)) { seek(at); return; }
    if (live()) { cueFor = { slug: t.slug, at: at }; return; }   // don't cut the song that's playing
    cur = t; cueAt = at; last = { pos: at, at: now() };
    wave(t.slug);
    set('paused', w || 'cued');
  }
  function mute() {
    muted = !muted;
    if (ready) W.setVolume(muted ? 0 : 100);
    render();
    return muted;
  }

  Object.assign(P, {
    play: play, toggle: toggle, pause: pause, primary: function () { toggle(); }, next: next, seek: seek, mute: mute, pos: pos, dur: dur,
    cue: function (slug, at) { cue(slug, at); },
    level: function () { return env; }
  });

  // ---- waveforms (P2-1): SoundCloud's own, committed to assets/wave
  function wave(slug) {
    if (!waves[slug]) {
      waves[slug] = ES.FILE ? Promise.reject(Error('no waveform on file://')) : fetch(ES.url('assets/wave/' + slug + '.json')).then(function (r) {
        if (!r.ok) throw Error('wave ' + r.status);
        return r.json();
      }).then(function (j) {
        var s = j.samples, a = s.slice().sort(function (x, y) { return x - y; });
        var lo = a[Math.floor(a.length * 0.05)], hi = a[Math.floor(a.length * 0.99)];
        return (levels[slug] = { s: s, h: j.height || 140, lo: lo, range: Math.max(hi - lo, 40) });
      });
      waves[slug].catch(function () {});
    }
    return waves[slug];
  }

  var ro = window.ResizeObserver && new ResizeObserver(function (list) { list.forEach(function (e) { draw(e.target); }); });
  function draw(el) {
    if (!el.isConnected) { if (ro) ro.unobserve(el); return; }
    var w = levels[el._wave], Wd = Math.round(el.clientWidth);
    if (!w || !Wd || Wd === el._w) return;
    el._w = Wd;
    var s = w.s, N = Math.max(120, Math.min(400, Math.round(Wd / 3))), bw = Wd / N, k = 28 / w.h, d = '';
    for (var i = 0; i < N; i++) {   // max-pool into N bars, one mirrored path
      var m = 0, e = Math.floor((i + 1) * s.length / N);
      for (var j = Math.floor(i * s.length / N); j < e; j++) if (s[j] > m) m = s[j];
      var h = Math.max(0.5, m * k);
      d += 'M' + (i * bw).toFixed(1) + ' ' + (32 - h).toFixed(1) + 'h' + (bw * 0.6).toFixed(2) + 'v' + (2 * h).toFixed(1) + 'h-' + (bw * 0.6).toFixed(2) + 'z';
    }
    var id = 'scar' + (++scarId);
    el.innerHTML = '<svg viewBox="0 0 ' + Wd + ' 64" preserveAspectRatio="none" focusable="false">' +
      '<clipPath id="' + id + '"><rect width="0" height="64"/></clipPath><path class="scar-base" d="' + d + '"/>' +
      '<path class="scar-played" clip-path="url(#' + id + ')" d="' + d + '"/><rect class="scar-head" width="1" height="64"/></svg>';
    el._clip = el.querySelector('clipPath rect'); el._head = el.querySelector('.scar-head');
    paint(el, scars.indexOf(el) >= 0 && dur() ? clamp(pos() / dur()) : 0);
  }
  function paint(el, f) {
    if (!el._clip) return;
    var x = f * el._w;
    el._clip.setAttribute('width', x.toFixed(1));
    el._head.setAttribute('x', Math.max(0, x - 1).toFixed(1));
  }
  function scarClick(e) {
    var el = e.currentTarget, t = ES.track(el._wave), r = el.getBoundingClientRect(), f = clamp((e.clientX - r.left) / r.width);
    if (cur === t && LOADED.test(state)) seek(f * dur()); else play(t.slug, { at: f * t.ms });
  }
  function scarHover(e) {
    var el = e.currentTarget;
    el.style.setProperty('--hx', (e.clientX - el.getBoundingClientRect().left).toFixed(0) + 'px');
  }
  function scan() {   // on every page: build new scars, then sync every hook
    each('[data-wave]', function (el) {
      var slug = el.getAttribute('data-wave');
      if (el._wave || !ES.track(slug)) return;
      el._wave = slug;
      el.setAttribute('aria-hidden', 'true');
      el.addEventListener('click', scarClick);
      el.addEventListener('pointermove', scarHover, { passive: true });
      wave(slug).then(function () { draw(el); if (ro) ro.observe(el); }, function () { el.hidden = true; });
    });
    sync(); render(); ui();
  }

  // ---- the ticker: UI at 10Hz while playing; level, kick and weight meter from the real waveform (P2-2)
  function tick(dt, t) {
    var playing = state === 'playing';
    if (playing && t - uiAt > 100) { uiAt = t; ui(); }
    if (!ES.reduce && cur) {
      var w = levels[cur.slug];
      if (playing && w && dur()) {
        var lvl = clamp((w.s[Math.min(w.s.length - 1, Math.floor(pos() / dur() * w.s.length))] - w.lo) / w.range);
        env += (lvl - env) * (1 - Math.exp(-dt * 8));
        slow += (lvl - slow) * (1 - Math.exp(-dt * 1.5));
        if (env - slow > 0.18 && t - kickAt > 1500) { kick = 1; kickAt = t; }
      } else { env = Math.max(0, env - dt / 0.6); slow = env; }
      kick *= Math.exp(-dt * 6);
      if (kick < 0.002) kick = 0;
      ES.sky.audio(env, kick);
      weight(t);
    } else if (env || kick) { env = slow = kick = 0; ES.sky.audio(0, 0); }
    if (!playing && !env && !kick) ES.tick.remove(tick);
  }
  function weight(t) {
    if (!weights.length || (ES.coarse && t - wAt < 80)) return;
    wAt = t;
    var v = state === 'playing' ? String(200 + Math.round(env * 12) * 50) : '';
    if (v === wVal) return;
    wVal = v;
    weights.forEach(function (el) { el.style.fontWeight = v; el.classList.toggle('is-meter', !!v); });
  }

  // ---- wiring
  function intent(e) {   // warm-up: the first hover/focus/touch on a play control loads api.js + a silent widget
    if (booted || dead) return;
    var el = e.target.closest ? e.target.closest('[data-play], .dock-play') : null;
    if (el) boot(ES.track(el.getAttribute('data-play')) || target());
  }
  ['pointerover', 'focusin', 'touchstart'].forEach(function (n) { document.addEventListener(n, intent, { passive: true }); });
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-play]') : null;
    if (!b) return;
    e.preventDefault();
    toggle(b.getAttribute('data-play'));
  });
  playB.addEventListener('click', function () { toggle(); });
  nextB.addEventListener('click', function () { next(); });
  closeB.addEventListener('click', function () { playB.focus(); collapse(); pause(); });

  function scrub(ms) {   // the range while held: text only; seeks commit on release
    var d = dur();
    times[0].textContent = clock(ms);
    seekR.style.setProperty('--p', d ? (ms / d).toFixed(4) : 0);
    vt(ms, d);
  }
  seekR.addEventListener('input', function () { dragging = true; scrub(seekR.value / 1000 * dur()); });
  seekR.addEventListener('change', function () { dragging = false; seek(seekR.value / 1000 * dur()); });
  seekR.addEventListener('focus', function () { if (cur && !dragging) vt(pos(), dur()); });   // a click fires input first
  seekR.addEventListener('keydown', function (e) {   // arrows move 5s, page keys 30s; one seek after the keys stop
    var k = { ArrowLeft: -5e3, ArrowDown: -5e3, ArrowRight: 5e3, ArrowUp: 5e3, PageDown: -3e4, PageUp: 3e4 }[e.key];
    if (!k || !cur) return;
    e.preventDefault();
    var d = dur(), ms = Math.max(0, Math.min(d, (dragging ? seekR.value / 1000 * d : pos()) + k));
    dragging = true;
    seekR.value = Math.round(ms / d * 1000);
    scrub(ms);
    clearTimeout(keyT);
    keyT = setTimeout(function () { dragging = false; seek(ms); }, 300);
  });

  ES.on('page', function (d) {
    if (!gotCover && d.main) cover = d.main.getAttribute('data-cover') || 'avatar';
    scan();
  });
  ES.on('cover', function (d) {
    gotCover = true;
    if (d.key === cover) return;
    cover = d.key;
    render();
  });
  ES.on('prefs', function () {
    if (!ES.reduce) return;
    env = slow = kick = 0;
    ES.sky.audio(0, 0);
    weights.forEach(function (el) { el.style.fontWeight = ''; el.classList.remove('is-meter'); });
    wVal = null;
  });

  // session resume (P3-6): cued, never autoplaying
  function save() {
    if (cur && LOADED.test(state)) ES.store.sset('player', { slug: cur.slug, pos: Math.round(pos()) });
    else if (state === 'ended') ES.store.sset('player', null);
  }
  setInterval(save, 2000);
  addEventListener('pagehide', save);

  document.body.insertBefore(dock, document.querySelector('body > .foot'));
  var saved = ES.store.sget('player', null), st = saved && ES.track(saved.slug);
  if (st && saved.pos > 0 && saved.pos < st.ms - 1000) cue(st.slug, saved.pos, 'resume'); else set('idle');
  scan();
})();
