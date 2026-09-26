/* EmptySkies — site. The chrome that never reloads (bar, menu, gauge, corners, clock), the page hooks
   ([data-ago] [data-clock] [data-night] [data-type] [data-share]), ES.pages, keys and the one secret. */
(function () {
  'use strict';
  var ES = window.ES, doc = document, html = doc.documentElement;
  var SC = 'https://soundcloud.com/emptyskies-416412725', IG = 'https://www.instagram.com/emptyabovebelow/';
  // desktop chrome (3-chrome.css says the same): touch screens of any width get the menu
  var mDesk = matchMedia('(min-width: 900px) and (pointer: fine), (min-width: 900px) and (pointer: none)');
  var LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || doc).querySelectorAll(s)); }
  function on(t, ev, fn, o) { t.addEventListener(ev, fn, o); }
  function watch(m, fn) { if (m.addEventListener) m.addEventListener('change', fn); else m.addListener(fn); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ext(href, text) { return '<a href="' + href + '" target="_blank" rel="noopener">' + text + '</a>'; }

  // the world key a link points at ('above' 'surface' 'released' <slug> 'floor'), or null
  function place(a) {
    var k = a.getAttribute('data-k');
    if (k) return k;
    var p = ES.rel(a.href);
    if (p === null) return null;
    if (p === '') return a.hash === '#released' ? 'released' : 'surface';
    for (var i = 0; i < ES.world.length; i++) if (ES.world[i].path === p) return ES.world[i].key;
    return null;
  }
  var HERE = { home: 'surface', album: 'above', links: 'floor' };
  // aria-current: the page's own place gets "page"; on a song page "released" gets "true". returns the link to focus.
  function mark(links, cur) {
    var song = !!ES.track(cur), best = null;
    links.forEach(function (a) {
      var k = place(a), v = k && k === cur ? 'page' : song && k === 'released' ? 'true' : '';
      if (v) a.setAttribute('aria-current', v); else a.removeAttribute('aria-current');
      if (v === 'page' || (v && !best)) best = a;
    });
    return best;
  }

  // every sky preview from here goes through one pair: pv (rows, idle cycle) under npv (nav hover)
  var pv = null, npv = null, npT = 0;
  function sky() { ES.sky.preview(npv || pv); }
  function preview(k) { pv = k; sky(); }

  var fontsP = doc.fonts && doc.fonts.load ? Promise.all([
    doc.fonts.load('1em "Cloister Black"'), doc.fonts.load('300 10px "JetBrains Mono"')
  ]).then(function () { return doc.fonts.ready; }) : Promise.resolve();

  /* ---------- bar: sliding underline ---------- */
  var bar = $('.bar'), nav = $('.bar-nav'), navCur = null, fontsOk = false;
  function line() {
    if (!nav) return;
    var r = nav.getBoundingClientRect();
    if (!r.width) return;
    var b = navCur && navCur.getBoundingClientRect();
    if (b) nav.style.setProperty('--x', (b.left - r.left) + 'px');
    nav.style.setProperty('--w', (b ? b.width : 0) + 'px');
    if (fontsOk && !nav.classList.contains('is-set')) { void nav.offsetWidth; nav.classList.add('is-set'); }
  }
  fontsP.then(null, function () {}).then(function () { fontsOk = true; line(); });

  /* ---------- mobile menu (dialog#menu) ---------- */
  var btn = null, menu = null;
  function alt(w) {
    var d = w.depth;
    return (d > 0 ? '+' : d < 0 ? '−' : '') + (ES.track(w.key) ? Math.abs(d).toFixed(1) : Math.abs(d));
  }
  function open() {
    if (!menu || menu.open || mDesk.matches) return;
    menu.showModal();
    btn.setAttribute('aria-expanded', 'true');
    var a = $('[aria-current=page]', menu) || $('[aria-current]', menu);
    if (a) a.focus();
  }
  function close() { if (menu && menu.open) menu.close(); }
  Object.assign(ES.menu, { open: open, close: close });

  if (bar && window.HTMLDialogElement && HTMLDialogElement.prototype.showModal) {
    menu = doc.createElement('dialog');
    menu.id = 'menu';
    menu.setAttribute('aria-label', 'menu');
    menu.innerHTML = '<div class="m-top"><span class="m-mark" aria-hidden="true">EmptySkies</span>' +
      '<button class="menu-close" type="button">close</button></div><nav aria-label="site"><ol class="m-list">' +
      ES.world.map(function (w, i) {
        var t = ES.track(w.key);
        return '<li class="' + (t ? 'm-song' : 'm-big') + '" style="--i:' + i + '"><span class="m-alt" aria-hidden="true">' + alt(w) + '</span>' +
          '<a href="' + ES.url(w.path) + '" data-k="' + w.key + '">' + (t ? '<span class="m-n">' + t.n + '</span> ' + t.title : w.label) + '</a>' +
          (t ? '<button class="m-play" type="button" data-play="' + t.slug + '" aria-label="play ' + t.title + '" aria-pressed="false"></button>' : '') +
          '</li>';
      }).join('') + '</ol></nav><p class="m-foot" style="--i:' + ES.world.length + '"><span>Baltimore <span data-clock></span></span>' +
      ext(SC, 'SoundCloud ↗') + ext(IG, 'Instagram ↗') + '</p>';
    doc.body.appendChild(menu);

    btn = doc.createElement('button');
    btn.className = 'menu-btn';
    btn.type = 'button';
    btn.textContent = 'menu';
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'menu');
    bar.appendChild(btn);
    html.classList.add('has-menu');   // only now may the css hide the inline nav

    var via = null;   // the link that closed the menu, if one did
    on(btn, 'click', open);
    on($('.menu-close', menu), 'click', close);
    // close before the router (or a native #hash jump) acts on the link, so scrolling is unlocked
    on(menu, 'click', function (e) { var a = e.target.closest('a[href]'); if (a) { via = a; close(); } });
    on(menu, 'close', function () {
      var a = via, t;
      via = null;
      btn.setAttribute('aria-expanded', 'false');
      // a link: the router focuses a new page's h1 or #target, but a same-page #hash jump moves no focus, so do it here
      if (a) {
        t = a.hash && ES.rel(a.href) === ES.rel(location.href) && doc.getElementById(a.hash.slice(1));
        if (t) {
          if (t.tabIndex < 0 && !t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1');
          t.focus({ preventScroll: true });
        }
        return;
      }
      // Esc, close, or grown past the menu (the button is gone then)
      (mDesk.matches ? navCur || $('.bar-nav a') : btn).focus({ preventScroll: true });
    });
  }

  /* ---------- depth gauge ---------- */
  var gauge = doc.createElement('nav'), gN, gO, gH = 0, gy = -1, gs = '';
  gauge.id = 'gauge';
  gauge.setAttribute('aria-label', 'depth');
  gauge.innerHTML = '<ol>' + ES.world.map(function (w) {
    return '<li class="' + (ES.track(w.key) ? 'g-s' : 'g-b') + '" style="--d:' + w.depth + '"><a href="' + ES.url(w.path) +
      '" data-k="' + w.key + '"><span class="g-l">' + w.label + '</span><i class="g-t"></i></a></li>';
  }).join('') + '</ol><div class="g-needle" aria-hidden="true"><i></i><output>0.00</output></div>';
  doc.body.appendChild(gauge);
  gN = $('.g-needle', gauge);
  gO = $('output', gauge);

  // the sky keeps d current in every mode (it snaps under reduced motion) and knows the depth anchors
  function depthNow() { return +ES.sky.d || 0; }
  function needle() {
    if (!mDesk.matches) return;
    var d = depthNow(), deep = d <= -3.995;
    var y = deep ? gH + 8 : Math.min(1, Math.max(0, (1 - d) / 4)) * gH;
    if (Math.abs(y - gy) > 0.5) { gy = y; gN.style.transform = 'translateY(' + y.toFixed(1) + 'px)'; }
    var s = ES.fmt.depth(deep ? -4 : d);
    if (s !== gs) { gs = s; gO.textContent = s; }
  }
  function gaugeLoop() {
    if (mDesk.matches && !ES.reduce) ES.tick.add(needle); else ES.tick.remove(needle);
    needle();
  }
  var sT = 0;
  on(window, 'scroll', function () {
    if (ES.reduce && !sT) sT = requestAnimationFrame(function () { sT = 0; needle(); });
  }, { passive: true });
  function measure() { gH = gauge.clientHeight; gy = -1; needle(); line(); }
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(measure);
    ro.observe(gauge);
    if (nav) ro.observe(nav);
  } else on(window, 'resize', measure);
  watch(mDesk, function () { if (mDesk.matches) close(); gaugeLoop(); measure(); });
  ES.on('prefs', gaugeLoop);
  gaugeLoop();

  /* ---------- bottom-right corner, toast ---------- */
  doc.body.insertAdjacentHTML('beforeend', '<nav class="corner-br" aria-label="social">' + ext(SC, 'SoundCloud ↗') +
    '<span aria-hidden="true"> · </span>' + ext(IG, 'Instagram ↗') + '</nav>');
  html.classList.add('has-chrome');   // gauge + corner exist: reserve the gauge's room, the corner takes the footer's socials
  var toastEl = doc.createElement('p'), toastT = 0;
  toastEl.className = 'toast';
  toastEl.setAttribute('role', 'status');
  doc.body.appendChild(toastEl);
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(function () {
      toastEl.classList.remove('on');
      toastT = setTimeout(function () { toastEl.textContent = ''; }, 400);
    }, 1800);
  }

  /* ---------- Baltimore clock, night, days-ago: one timer aligned to the minute ---------- */
  var clockF = null;
  try {
    clockF = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short' });
  } catch (e) {}
  function clock() {
    var t = {}, ok = false;
    try { clockF.formatToParts(new Date()).forEach(function (p) { t[p.type] = p.value; }); ok = !!t.hour; } catch (e) {}
    var hr = +t.hour % 24, night = ok && (hr >= 20 || hr < 6);
    var s = ok ? (pad(hr) + ':' + t.minute + ' ' + (t.timeZoneName || '')).trim() : '';
    $$('[data-clock]').forEach(function (c) { c.hidden = !ok; if (c.textContent !== s) c.textContent = s; });
    $$('[data-night]').forEach(function (n) { n.hidden = !night; });
    $$('[data-ago]').forEach(function (a) {
      var iso = a.getAttribute('data-ago');
      if (!isNaN(Date.parse(iso))) a.textContent = ES.fmt.ago(iso);
    });
  }
  (function minute() { clock(); setTimeout(minute, 60000 - Date.now() % 60000 + 30); })();
  on(doc, 'visibilitychange', function () { if (!doc.hidden) clock(); });


  /* ---------- share + timestamps ---------- */
  // '#t=72' '#t=1m12s' '#t=2m' -> ms, anything else -> null
  function parseT(h) {
    var m = /^#?t=(?:(\d+)m)?(?:(\d+)s?)?$/.exec(h || '');
    return m && (m[1] || m[2]) ? ((+m[1] || 0) * 60 + (+m[2] || 0)) * 1000 : null;
  }
  function stamp(ms) { var s = Math.floor(ms / 1000); return (s >= 60 ? Math.floor(s / 60) + 'm' : '') + s % 60 + 's'; }
  if (LOCAL) {
    [['#t=72', 72000], ['#t=1m12s', 72000], ['#t=2m', 120000], ['#t=garbage', null], ['#garbage', null], ['t=', null],
     ['#t=' + stamp(72999), 72000], ['#t=' + stamp(5000), 5000]].forEach(function (c) {
      console.assert(parseT(c[0]) === c[1], 'parseT(' + c[0] + ') = ' + parseT(c[0]) + ', want ' + c[1]);
    });
  }
  var canShare = !!navigator.share, canCopy = !!(navigator.clipboard && navigator.clipboard.writeText);
  function shareUrl(b) {
    var c = $('link[rel=canonical]'), m = $('#page');
    var u = b.getAttribute('data-share') || (c && c.href) || location.href.split('#')[0];
    var slug = m && m.getAttribute('data-page') === 'room' && m.getAttribute('data-slug');
    if (slug && ES.player.slug === slug && ES.player.pos() >= 1000) u = u.split('#')[0] + '#t=' + stamp(ES.player.pos());
    return u;
  }
  function copy(u) {
    if (canCopy) navigator.clipboard.writeText(u).then(function () { toast('copied'); }, function () { toast(u); });
    else toast(u);
  }
  on(doc, 'click', function (e) {
    var b = e.target.closest && e.target.closest('[data-share]');
    if (!b) return;
    e.preventDefault();
    var u = shareUrl(b);
    if (canShare) navigator.share({ title: doc.title, url: u }).then(null, function (err) { if (!err || err.name !== 'AbortError') copy(u); });
    else copy(u);
  });

  /* ---------- typed caption ---------- */
  function type(main) {
    var el = $('[data-type]', main), iv = 0, t0 = 0;
    if (!el) return function () {};
    var text = el.getAttribute('data-type') || el.textContent.trim(), i = ES.reduce ? text.length : 0;
    el.setAttribute('data-type', text);
    el.innerHTML = '<span class="sr-only"></span><span aria-hidden="true"><span class="typed"></span><span class="rest"></span></span>';
    el.firstChild.textContent = text;
    var typed = $('.typed', el), rest = $('.rest', el);
    function paint() { typed.textContent = text.slice(0, i); rest.textContent = text.slice(i); }
    paint();
    // 35ms a character, counted from the clock so a busy main thread never slows the pace
    if (i < text.length) t0 = setTimeout(function () {
      var start = performance.now();
      iv = setInterval(function () {
        i = Math.min(text.length, Math.floor((performance.now() - start) / 35) + 1);
        paint();
        if (i >= text.length) clearInterval(iv);
      }, 35);
    }, 400);
    return function () { clearTimeout(t0); clearInterval(iv); };
  }

  /* ---------- pages ---------- */
  var CYCLE = ['avatar'].concat(ES.tracks.map(function (t) { return t.slug; }));
  function playing() { var s = ES.player.state; return s === 'playing' || s === 'loading'; }

  ES.pages.home = { enter: function (main) {
    var rows = $$('.row[data-track]', main), list = rows.length ? rows[0].parentNode : null;
    var hov = false, foc = false, cen = null, lit = null, ci = 0, idleT = 0, leaveT = 0, io = null;
    function light(row) {
      if (lit === row) return;
      lit = row;
      rows.forEach(function (r) { r.classList.toggle('on', r === row); });
    }
    function arm() { clearTimeout(idleT); if (!ES.reduce) idleT = setTimeout(step, 7000); }
    function pick(row) {
      var k = row.getAttribute('data-track');
      clearTimeout(leaveT);
      light(row);
      ci = Math.max(0, CYCLE.indexOf(k));
      preview(k);
      arm();
    }
    // pointer, focus and centre have all left the rows: while music plays, hand the sky back to it
    function release() {
      if (hov || foc || cen) return;
      arm();
      if (!playing()) return;
      clearTimeout(leaveT);
      leaveT = setTimeout(function () { light(null); preview(null); }, 400);
    }
    function step() {
      var ae = doc.activeElement;
      if (hov || foc || cen || npv || playing() || doc.hidden || (ae && ae.closest && ae.closest('#dock'))) return arm();
      ci = (ci + 1) % CYCLE.length;
      light(null);
      preview(CYCLE[ci]);
      if (ci) arm();   // back on the page's own cover: rest (WCAG 2.2.2). the rows, music or prefs start another turn
    }
    if (list) {
      on(list, 'pointerover', function (e) {
        if (e.pointerType === 'touch') return;
        var r = e.target.closest('.row');
        if (r && (!hov || r !== lit)) { hov = true; pick(r); }
      });
      on(list, 'pointerleave', function (e) { if (e.pointerType !== 'touch') { hov = false; release(); } });
      on(list, 'focusin', function (e) { var r = e.target.closest('.row'); if (r && e.target.matches(':focus-visible')) { foc = true; pick(r); } });
      on(list, 'focusout', function (e) { if (!list.contains(e.relatedTarget)) { foc = false; release(); } });
    }
    if (ES.coarse && window.IntersectionObserver) {
      io = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) {
          if (en.isIntersecting) { cen = en.target; pick(en.target); } else if (en.target === cen) { cen = null; release(); }
        });
      }, { rootMargin: '-45% 0px -45% 0px' });
      rows.forEach(function (r) { io.observe(r); });
    }
    var offPlayer = ES.on('player', function (d) { if (d.state === 'playing') release(); });
    var offPrefs = ES.on('prefs', arm);
    if (window.Hero) Hero.init(main.querySelector('.hero'), { handoff: main.querySelector('[data-hero-handoff]') });
    arm();
    return function () {
      clearTimeout(idleT); clearTimeout(leaveT);
      if (io) io.disconnect();
      offPlayer(); offPrefs();
      if (window.Hero) Hero.destroy();
      preview(null);
    };
  } };


  ES.pages.room = { enter: function (main) {
    var slug = main.getAttribute('data-slug'), stop = type(main);
    // #t=2m24s cues this song there. never autoplays; the player seeks on the first PLAY
    function cue() {
      var at = parseT(location.hash), t = ES.track(slug), P = ES.player;
      if (at === null || !t || at >= t.ms || !P.cue || P.state === 'dead') return;
      var other = P.slug !== slug && /^(loading|playing|blocked)$/.test(P.state);
      P.cue(slug, at);   // seeks this song, parks the cue behind another live one, or loads it paused
      toast('cued · ' + ES.fmt.time(at) + (other ? ' · press play' : ''));
    }
    cue();
    on(window, 'hashchange', cue);
    return function () { stop(); removeEventListener('hashchange', cue); };
  } };

  /* ---------- es:page: aria-current everywhere, fillers ---------- */
  var booted = false;
  ES.on('page', function (d) {
    booted = true;
    var cur = d.page === 'room' ? d.slug : HERE[d.page] || null;
    navCur = nav ? mark($$('a', nav), cur) : null;
    line();
    if (menu) mark($$('a[data-k]', menu), cur);
    mark($$('a[data-k]', gauge), cur);
    clearTimeout(npT);
    if (npv) { npv = null; sky(); }
    clock();
    if (!canShare && !canCopy) $$('[data-share]').forEach(function (b) { (b.closest('li') || b).style.display = 'none'; });
    needle();
  });
  // if barb.js never booted the page (failed to load), boot it here so the chrome still works
  on(window, 'load', function () {
    var m = $('#page');
    if (booted || !m) return;
    var d = { page: m.getAttribute('data-page'), slug: m.getAttribute('data-slug'), depth: +m.getAttribute('data-depth'), main: m, boot: true };
    html.setAttribute('data-page', d.page);
    if (ES.pages[d.page]) ES.pages[d.page].enter(m);
    ES.emit('page', d);
  });

  /* ---------- P3-11: hovering a nav item or gauge tick previews where it leads ---------- */
  function navOver(e) {
    if (e.pointerType === 'touch') return;
    var a = e.target.closest && e.target.closest('a');
    if (!a) return;
    var k = place(a), key = ES.track(k) ? k : 'avatar';
    clearTimeout(npT);
    npT = setTimeout(function () { npv = key; sky(); }, 180);
  }
  function navOut(e) {
    if (e.relatedTarget && this.contains(e.relatedTarget)) return;
    clearTimeout(npT);
    if (npv) { npv = null; sky(); }
  }
  [nav, gauge].forEach(function (n) {
    if (!n) return;
    on(n, 'pointerover', navOver); on(n, 'pointerout', navOut);
    on(n, 'focusin', navOver); on(n, 'focusout', navOut);
  });

  /* ---------- keys (P3-2) and "empty" (P3-5) ---------- */
  var keysOff = !!ES.store.get('keys-off', false), keysDlg = null, foot = $('.foot');
  html.classList.toggle('keys-off', keysOff);
  if (foot) {   // the visible way in, and the only one once letter keys are off
    foot.insertAdjacentHTML('beforeend', '<button class="foot-keys" type="button" aria-haspopup="dialog"><span aria-hidden="true">? </span>keys</button>');
    on(foot.lastChild, 'click', help);
  }

  function help() {
    if (!keysDlg) {
      keysDlg = doc.createElement('dialog');
      keysDlg.id = 'keys';
      keysDlg.setAttribute('aria-labelledby', 'keys-h');
      keysDlg.innerHTML = '<h2 id="keys-h">keys</h2><dl class="k-list">' + [
        ['K', 'play / pause'], ['J</kbd> <kbd>L', '−10s / +10s'], ['N', 'next'], ['1</kbd>–<kbd>5', 'play 01 – 05'], ['M', 'mute'], ['?', 'keys']
      ].map(function (k) { return '<div><dt><kbd>' + k[0] + '</kbd></dt><dd>' + k[1] + '</dd></div>'; }).join('') +
        '</dl><button class="k-off" type="button" role="switch" aria-checked="false">letter keys off<i aria-hidden="true"></i></button>' +
        '<form method="dialog"><button class="k-close" autofocus>close</button></form>';
      doc.body.appendChild(keysDlg);
      var sw = $('.k-off', keysDlg);
      sw.setAttribute('aria-checked', String(keysOff));
      on(sw, 'click', function () {
        keysOff = !keysOff;
        sw.setAttribute('aria-checked', String(keysOff));
        html.classList.toggle('keys-off', keysOff);
        ES.store.set('keys-off', keysOff);
      });
    }
    if (keysDlg.open) keysDlg.close();
    else { close(); keysDlg.showModal(); }
  }

  var eggT = 0, buf = '', bufAt = 0, muteT = 0;
  function empty() {
    clearTimeout(eggT);
    if (!ES.reduce) html.classList.add('emptying');
    html.classList.add('emptied');
    ES.say('empty.');
    eggT = setTimeout(function () {
      html.classList.remove('emptied');
      eggT = setTimeout(function () { html.classList.remove('emptying'); }, 1200);
    }, 4500);
  }
  function mute() {
    muteT = 0;
    if (ES.player.mute) toast(ES.player.mute() ? 'muted' : 'sound on');
  }
  on(doc, 'keydown', function (e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.isComposing) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (keysOff || !e.key || e.key.length !== 1) return;   // '?' too (WCAG 2.1.4): the footer's keys button gets back in
    if (e.key === '?') { e.preventDefault(); help(); return; }
    if (e.shiftKey) return;
    var k = e.key.toLowerCase(), P = ES.player, now = Date.now(), prev = now - bufAt < 1500 ? buf : '';
    buf = (prev + k).slice(-5);
    bufAt = now;
    if (muteT && k === 'p') { clearTimeout(muteT); muteT = 0; }   // "em…" was the start of "empty", not mute
    if (buf === 'empty') { buf = ''; empty(); return; }
    if (k === 'k') { if (P.primary) P.primary(); else P.toggle(); }   // whatever the dock's ▶ would do
    else if (k === 'j' || k === 'l' || k === 'n') {
      if (!P.slug || !/^(loading|playing|paused|blocked)$/.test(P.state)) return;   // nothing loaded (idle, ended, dead)
      if (k === 'n') P.next();
      else {
        var dur = P.dur() || ES.track(P.slug).ms, to = Math.max(0, Math.min(dur - 500, P.pos() + (k === 'l' ? 1e4 : -1e4)));
        P.seek(to);
        toast((k === 'l' ? '+10s · ' : '−10s · ') + ES.fmt.time(to));
      }
    } else if (k === 'm') {
      clearTimeout(muteT);
      if (prev.slice(-1) === 'e') muteT = setTimeout(mute, 400); else mute();
    } else if (/[1-5]/.test(k)) P.play(ES.tracks.filter(function (x) { return +x.n === +k; })[0].slug);
    else return;
    e.preventDefault();
  });

  /* ---------- P3-4 ---------- */
  console.log('%c' + [
    '███████  ███████',
    '██       ██',
    '█████    ███████',
    '██            ██',
    '███████  ███████',
    '',
    'you looked underneath.',
    ''
  ].concat(ES.world.map(function (w) {
    return ('     ' + ES.fmt.depth(w.depth)).slice(-5) + '  ' + (w.label + '                    ').slice(0, 20) + '/' + w.path;
  })).join('\n'), 'font: 11px/1.4 monospace; color: #8b8c8f');
})();
