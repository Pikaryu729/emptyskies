/* EmptySkies — barb. The router: only #page swaps; the sky, the chrome and the music never reload.
   Loaded last; boots the first page. */
(function () {
  'use strict';
  var html = document.documentElement;
  var noop = function () {};
  var on = !ES.FILE && !!window.fetch && !!window.DOMParser && 'pushState' in history;
  var cache = new Map();          // key -> Promise<{url, doc}>
  var token = 0, busy = 0, cleanup = null;
  var HEAD = [['meta[name=description]', 'content'], ['meta[name=theme-color]', 'content'], ['link[rel=canonical]', 'href']];

  function tryc(f) { try { return f(); } catch (e) { if (window.console) console.error(e); } }
  function key(u) { return u.origin + u.pathname.replace(/index\.html$/, ''); }
  function here() { return key(location); }
  function instant(y) { scrollTo({ top: y, behavior: 'instant' }); }
  function saveY(f) {                             // f: the link we leave by, for focus on the way back
    if (busy) return;
    var s = Object.assign({}, history.state, { y: scrollY });
    if (f !== undefined) s.f = f;
    try { history.replaceState(s, ''); } catch (e) {}
  }
  // a link as [href, nth among links with that href]: survives the swap, unlike the node
  function same(s) { return document.querySelectorAll('a[href="' + CSS.escape(s) + '"]'); }
  function mark(a) { var s = a.getAttribute('href'); return [s, [].indexOf.call(same(s), a)]; }
  function find(f) { return f && same(f[0])[f[1]]; }
  function seen(el) {
    var r = el && el.getBoundingClientRect();
    return !!r && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
  }
  function offsetY(el) {                          // layout position, blind to the enter animation's translate
    for (var y = 0; el; el = el.offsetParent) y += el.offsetTop;
    return y;
  }
  function byHash(hash) {
    if (!hash) return null;
    try { hash = decodeURIComponent(hash.slice(1)); } catch (e) { hash = hash.slice(1); }
    return document.getElementById(hash);
  }

  // a same-site page url, normalised so GitHub Pages never 301s ('links' -> 'links/'), or null
  function route(href) {
    var u = new URL(href, location.href);
    if (u.origin !== location.origin || !/^https?:$/.test(u.protocol) || ES.rel(u.href) === null) return null;
    if (!/\/$|\.[^/]*$/.test(u.pathname)) u.pathname += '/';
    return /(\/|\.html)$/.test(u.pathname) ? u : null;
  }
  function link(el) {
    var a = el && el.closest && el.closest('a[href]');
    if (!a || typeof a.href !== 'string' || a.target || a.hasAttribute('download') || a.hasAttribute('data-hard')) return null;
    return route(a.href) && a;
  }

  // fetch + parse once per page. a dead link gets the no-signal page (GitHub Pages sends it as the 404 body;
  // other servers send their own, so fall back to fetching 404.html)
  function get(href) {
    return fetch(href).then(function (r) {
      if (!r.ok && r.status !== 404) throw Error('http ' + r.status);
      return r.text().then(function (s) {
        var doc = new DOMParser().parseFromString(s, 'text/html');
        if (doc.getElementById('page')) return { url: r.url || href, doc: doc };
        var nf = ES.url('404.html');
        if (r.status !== 404 || href === nf) throw Error('no #page');
        return load(new URL(nf)).then(function (x) { return { url: r.url || href, doc: x.doc }; });
      });
    });
  }
  function load(u) {
    var k = key(u), p = cache.get(k);
    if (!p) {
      p = get(k);
      cache.set(k, p);
      p.catch(function () { if (cache.get(k) === p) cache.delete(k); });
    }
    return p;
  }
  function prefetch(el) {
    var a = link(el), u = a && route(a.href);
    if (u && key(u) !== here()) load(u);
  }

  function syncHead(doc) {
    document.title = doc.title;
    HEAD.forEach(function (s) {
      var a = doc.head.querySelector(s[0]), b = document.head.querySelector(s[0]);
      if (a && b) b.setAttribute(s[1], a.getAttribute(s[1]));
      else if (a) document.head.appendChild(document.importNode(a, false));
      else if (b) b.remove();
    });
  }

  function enter(main, zone, boot) {
    var d = main.dataset, pg = ES.pages[d.page];
    html.setAttribute('data-page', d.page || '');
    if (zone) html.setAttribute('data-zone', zone); else html.removeAttribute('data-zone');
    tryc(function () {
      ES.sky.page({ cover: d.cover, mood: d.mood, depth: +d.depth, span: +d.span, room: d.page === 'room', slug: d.slug || null });
    });
    cleanup = pg ? tryc(function () { return pg.enter(main); }) : null;
    ES.router.current = ES.rel(location.href);
    ES.emit('page', { page: d.page, slug: d.slug || null, depth: +d.depth, main: main, boot: !!boot });
  }

  // P2-4: fade every sibling from the title up to #page, so only the title stays lit
  function isolate(el) {
    var page = document.getElementById('page');
    for (; el && el !== page && el.parentElement; el = el.parentElement)
      for (var s = el.parentElement.firstElementChild; s; s = s.nextElementSibling) if (s !== el) s.classList.add('fade-out');
  }
  function unfade() {
    Array.prototype.forEach.call(document.querySelectorAll('.fade-out'), function (el) { el.classList.remove('fade-out'); });
  }

  function hard(u) {
    if (u.href.split('#')[0] === location.href.split('#')[0]) location.reload(); else location.href = u.href;
  }

  // while a travel is in flight every link goes through here, even one back to this page: the latest click wins
  async function go(u, o) {                       // o: {push, x, y, from, morph, restoreY}
    if (o.push && !busy && key(u) === here()) {   // this page: a hash jumps natively, a bare link goes to the top
      if (u.hash) location.hash = u.hash; else instant(0);
      return;
    }
    if (o.push) saveY(o.from ? mark(o.from) : null);
    var t = busy = ++token;
    try {
      var dir = ES.depthOf(u.href) < ES.sky.d ? 'down' : 'up';
      var morph = o.morph && !ES.reduce && document.startViewTransition ? o.morph : null;
      tryc(function () { ES.menu.close(); });
      html.dataset.travel = dir;
      html.classList.remove('is-entering', 'is-morph', 'is-receiving');
      html.classList.add('is-leaving');
      unfade();
      if (morph) { html.classList.add('is-morph'); isolate(morph); }

      var ld = load(u), got = false;
      ld.then(function () { got = true; }, function () { got = true; });
      var shade = ES.reduce ? ES.sleep(150)
        : Promise.race([Promise.resolve(ES.sky.ink(o.x / innerWidth, o.y / innerHeight)), ES.sleep(700)]);
      shade.then(function () { return ES.sleep(250); }).then(function () {  // P2-11: still waiting after the ink peaked
        if (t === token && !got) html.classList.add('is-receiving');
      });
      var res = (await Promise.all([ld, shade]))[0];
      if (t !== token) return;                                                // a newer go() owns the screen

      var commit = function () {
        // pushState BEFORE importing: relative src/href in the new main resolve against the document URL.
        var nu = res.url.split('#')[0] + u.hash;
        if (o.push) history[nu === location.href ? 'replaceState' : 'pushState']({ y: 0 }, '', nu);
        var next = document.importNode(res.doc.getElementById('page'), true);   // import, not adopt: the cached doc stays whole
        if (cleanup) tryc(cleanup);
        cleanup = null;
        document.getElementById('page').replaceWith(next);
        syncHead(res.doc);
        void next.offsetWidth;                     // style it hidden first, so reduced motion fades it in
        html.classList.remove('is-leaving', 'is-receiving');
        html.classList.add('is-entering');
        // scroll before enter(): the sky and every es:page listener read the new page's scrollY
        var h = byHash(u.hash), y = o.restoreY != null ? o.restoreY : 0;
        if (o.restoreY == null && h) y = offsetY(h) - (parseFloat(getComputedStyle(h).scrollMarginTop) || 0);
        instant(y);
        requestAnimationFrame(function () { if (t === token) instant(y); });
        enter(next, res.doc.documentElement.getAttribute('data-zone'), false);
        // focus without scrolling or a ring. push: the #target (as a native jump would) or the h1.
        // back/forward: the first on screen of the link we left by, the #target, the h1, any control; so Tab carries on here
        var top = next.querySelector('h1');
        var f = (o.push ? h || top : [find(history.state && history.state.f), h, top]
          .concat([].slice.call(next.querySelectorAll('a[href], button'))).find(seen)) || next;
        if (f.tabIndex < 0 && !f.hasAttribute('tabindex')) f.setAttribute('tabindex', '-1');
        f.focus({ preventScroll: true });
        if (document.activeElement !== f) next.focus({ preventScroll: true });   // hidden or inert: never leave focus on body
        ES.say(document.title);
      };

      if (morph && morph.isConnected) {
        var h1 = null, done = function () {
          morph.style.viewTransitionName = '';
          if (h1) h1.style.viewTransitionName = '';
          if (t === token) html.classList.remove('is-morph');
        };
        morph.style.viewTransitionName = 'ttl';
        var vt = document.startViewTransition(function () {
          if (t !== token) return;
          commit();
          h1 = document.querySelector('#page h1');
          if (h1) h1.style.viewTransitionName = 'ttl';
        });
        vt.ready.catch(noop);
        vt.finished.then(done, done);
        await vt.updateCallbackDone;
        if (t !== token) return;
      } else {
        html.classList.remove('is-morph');
        commit();
      }
      busy = 0;
      setTimeout(function () { if (t === token) html.classList.remove('is-entering'); }, 1100);
      if (!ES.reduce) tryc(function () { ES.sky.drain(dir); });
    } catch (e) {
      if (t === token) hard(u);                    // hard navigation is always the fallback
    }
  }

  ES.router.go = function (href) {
    var u = on && route(href);
    if (u) go(u, { push: true, x: innerWidth / 2, y: innerHeight / 2 }); else location.href = href;
  };

  // boot
  var page = document.getElementById('page');
  // pin site links to absolute urls: shell links (and the favicon) must survive pushState;
  // on file: every link, so folders gain index.html
  Array.prototype.forEach.call(document.querySelectorAll('a[href], link[rel~=icon]'), function (a) {
    var raw = a.getAttribute('href');
    if (raw.charAt(0) === '#' || typeof a.href !== 'string' || ES.rel(a.href) === null) return;
    if (ES.FILE || !page || !page.contains(a)) a.href = ES.url(a.href);
  });

  if (on) {
    history.scrollRestoration = 'manual';
    var y0 = history.state && history.state.y;   // reload / non-bfcache return: put the reader back
    if (y0) { instant(y0); requestAnimationFrame(function () { instant(y0); }); }

    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = link(e.target), u = a && route(a.href);
      if (!u) return;
      if (u.hash && !busy && key(u) === here()) {                            // same-page anchor: jumps natively
        saveY();
        if (u.search !== location.search) { e.preventDefault(); location.hash = u.hash; }   // keep ?fbclid etc: no reload
        return;
      }
      e.preventDefault();
      var x = e.clientX, y = e.clientY;
      if (!x && !y) { var r = a.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }  // keyboard
      go(u, { push: true, x: x, y: y, from: a, morph: a.matches('.row .ttl') ? a : null });
    });

    addEventListener('popstate', function (e) {
      var y = e.state && e.state.y;
      if (!busy && ES.rel(location.href) === ES.router.current) {           // hash-only change
        if (y != null) instant(y);
        return;
      }
      go(new URL(location.href), { push: false, restoreY: y, x: innerWidth / 2, y: innerHeight / 2 });
    });

    var sy = 0;
    addEventListener('scroll', function () { clearTimeout(sy); sy = setTimeout(saveY, 150); }, { passive: true });

    // bfcache return from a hard fallback: lift the ink we left behind
    addEventListener('pageshow', function (e) {
      if (!e.persisted || !html.classList.contains('is-leaving')) return;
      token++; busy = 0;
      html.classList.remove('is-leaving', 'is-morph', 'is-receiving');
      unfade();
      tryc(function () { ES.sky.drain('up'); });
    });

    var pt = 0;
    document.addEventListener('pointerover', function (e) {
      clearTimeout(pt);
      if (link(e.target)) pt = setTimeout(function () { prefetch(e.target); }, 65);
    });
    document.addEventListener('focusin', function (e) { prefetch(e.target); });
    document.addEventListener('touchstart', function (e) { prefetch(e.target); }, { passive: true });

    // P2-11: once the first page has settled, fetch the rest of the world while idle
    addEventListener('load', function () {
      var c = navigator.connection;
      if (c && c.saveData) return;
      var idle = window.requestIdleCallback || function (f) { return setTimeout(f, 300); };
      var q = ES.world.map(function (w) { return route(ES.url(w.path)); });
      setTimeout(function step() {
        var u = q.shift();
        if (u && key(u) !== here()) load(u);
        if (q.length) idle(step);
      }, 2000);
    });
  }

  if (!document.querySelector('.recv')) {
    var recv = document.createElement('p');
    recv.className = 'recv'; recv.setAttribute('aria-hidden', 'true');
    recv.innerHTML = '<i></i>receiving…';
    document.body.appendChild(recv);
  }

  if (page) enter(page, html.getAttribute('data-zone'), true);
})();
