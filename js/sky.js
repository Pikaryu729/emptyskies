/* EmptySkies — sky. One WebGL quad behind everything: covers, moods, depth, weather, ink.
   A CSS still takes over without WebGL, on file:// (tainted textures), after context loss, or with ?nogl. */
(function () {
  'use strict';
  var html = document.documentElement, sky = ES.sky, Q = location.search;
  var FORCE = +((/[?&]tier=([12])/.exec(Q) || [])[1] || 0);   // QA: fixed tier, no governor
  var KEYS = ['avatar'].concat(ES.tracks.map(function (t) { return t.slug; }));

  // spec 5.4: warp keep blood grain | ash fall liquid bubble | ember vignette exposure static | lens
  var MOODS = {
    surface:         [.05, .32, .55, .09,  .30, 1, 0, 0,        0, 0, 1, 0,     1],
    above:           [.03, .25, .35, .07,  .25, .35, 0, 0,      0, 0, 1, 0,     0],
    floor:           [.04, .28, .45, .10,  .12, .40, 0, 0,      0, .3, .9, 0,   1],
    nosignal:        [.06, .20, .50, .12,  0, 0, 0, 0,          0, 0, 1, .85,   0],
    nohand2hold:     [.05, .30, .55, .11,  .25, .80, 0, 0,      0, 0, 1, 0,    -1],
    deathalliwant:   [.05, .30, .80, .09,  .50, 1.6, 0, 0,      1, 0, 1, 0,     1],
    mylittlesoldier: [.04, .34, .50, .08,  .18, .50, 0, 0,      0, 1, 1, 0,   1.6],
    miracleoflife:   [.02, .40, .50, .08,  .20, -.30, 1, .6,    0, .3, 1, 0,    1],
    bubbles:         [.04, .35, .40, .08,  .50, -.70, 0, 1,     0, 0, .85, 0,   1]
  };

  var VS = 'attribute vec2 p; varying vec2 v; void main(){ v = p*.5+.5; v.y = 1.-v.y; gl_Position = vec4(p,0.,1.); }';
  // validated in spec/sky.frag (GLSL ES 1.00, both tiers). tier defines are prepended.
  var FS = `precision highp float;
#ifndef OCT
#define OCT 5
#endif
#ifndef ASH_L
#define ASH_L 3
#endif
uniform sampler2D uA; uniform sampler2D uB;
uniform float uT, uP, uDepth;
uniform vec2  uR;
uniform vec2  uM; uniform float uMv, uLens;
uniform vec4  uRp[4];
uniform float uV, uS;
uniform float uInk; uniform vec2 uIO;
uniform float uLvl, uKick;
uniform vec4  uMoodA;
uniform vec4  uMoodB;
uniform vec4  uMoodC;
varying vec2 v;

float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1.,0.)),f.x), mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x), f.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<OCT;i++){ s+=a*n(p); p*=2.03; a*=.5; } return s; }
vec3 tx(sampler2D t, vec2 uv, vec2 d){ return vec3(texture2D(t, uv+d).r, texture2D(t, uv).g, texture2D(t, uv-d).b); }
vec2 fit(vec2 q){ float r=uR.x/uR.y; q-=.5; if(r>1.) q.y/=r; else q.x*=r; return q; }

vec3 ash(vec2 p, float av){
  vec3 acc = vec3(0.);
  for (int L=0; L<ASH_L; L++){
    float fl = float(L), sc = 22. - fl*7.;
    vec2 s = (p + vec2((uM.x-.5)*.03*(fl+1.), uS*(.12+fl*.18))) * sc;
    s.y -= uT*(.02+fl*.03)*uMoodB.y*sc;
    s.x += sin(s.y*.45 + fl*7.)*.35;
    vec2 id = floor(s), f = fract(s)-.5;
    float live = step(h(id + fl*17.), uMoodB.x*(.35 + uLvl*.25));
    vec2 d = f - (vec2(h(id+3.1), h(id+7.7))-.5)*.6; d.y /= 1. + av*4.;
    float rad = .07, dist = length(d);
    float disc = 1. - smoothstep(rad*(.15+fl*.3), rad, dist);
    float ring = 1. - smoothstep(0., .012, abs(dist - rad*1.6));
    vec3 col = mix(vec3(.72,.72,.70), vec3(.75,.08,.06), step(h(id+11.), .18*uMoodC.x));
    acc += col * mix(disc, ring*.8, uMoodB.w) * live * (.25 + fl*.35);
  }
  return acc;
}

void main(){
  float ar = uR.x/uR.y, av = abs(uV);
  vec2 q = v, A = vec2(ar, 1.);
  float up = clamp(uDepth, 0., 1.), dn = clamp(-uDepth/3., 0., 1.);

  float sl = floor(q.y*42.);
  q.x += (h(vec2(sl,7.))-.5) * .16 * step(.55, h(vec2(sl, floor(uT*16.)))) * av*av;
  q.x += (h(vec2(floor(q.y*18.), floor(uT*24.)))-.5) * .07 * uInk*(1.-uInk)*4.;
  q.x += (h(vec2(floor(q.y*40.), floor(uT*30.)))-.5) * .02 * uKick;

  vec2 pd = (q-uM)*A;
  q -= pd/A * exp(-dot(pd,pd)*14.) * (.03 + .07*uMv) * uLens;

  vec2 rp = vec2(0.); float ring = 0.;
  for (int i=0;i<4;i++){
    vec4 R = uRp[i]; float age = uT - R.z;
    vec2 d = (q-R.xy)*A; float r = length(d);
    float b = exp(-pow((r - age*.55)*22., 2.)) * exp(-age*1.6) * R.w * step(0., age);
    rp += d/(r+1e-4)*b; ring += b;
  }
  q += rp*.025/A;

  q += (vec2(n(q*5.+uT*.35), n(q*5.-uT*.3))-.5) * .035 * uMoodB.z;

  float z = 1.14 + .035*sin(uT*.12) + uLvl*.04 + uKick*.02;
  vec2 drift = vec2(sin(uT*.05), cos(uT*.037))*.015;
  vec2 w = vec2(fbm(q*2.6 + uT*.035), fbm(q*2.6 + vec2(4.7,1.9) - uT*.03)) - .5;
  vec2 ua = clamp(fit(q)/z + .5 + drift + w*uMoodA.x, .001, .999);
  vec2 dd = (ua-.5)*(.012 + uKick*.02 + av*.02) + w*.004;
  vec3 c = tx(uA, ua, dd);
  float edge = 0.;
  if (uP > 0.) {
    vec2 ub = clamp(fit(q)/z + .5 + drift + w*uMoodA.x, .001, .999);
    float th = fbm(v*3.5 + uT*.08);
    float m = smoothstep(th-.08, th+.08, uP*1.25-.12);
    c = mix(c, tx(uB, ub, dd), m);
    edge = 1. - abs(m*2.-1.);
  }

  float l = dot(c, vec3(.299,.587,.114));
  vec3 duo = mix(vec3(.015,.016,.024), vec3(.80,.81,.83), smoothstep(.04,.95,l));
  c = mix(duo, c, uMoodA.y);
  c = pow(c, vec3(1.15)) * .6 * uMoodC.z * (1. + uLvl*.2);
  c += edge*edge*vec3(.55,.08,.09)*uMoodA.z;
  c += ring*.12;

  c *= 1. - dn*.35;
  c.r += dn*.03*(1.-l);

  float vg = 1. - smoothstep(.2 - uMoodC.y*.1, 1.05 - uMoodC.y*.35, length(v-.5)*1.35);
  c *= mix(.25, 1., vg);

  if (uDepth > 0.) {
    float cl = fbm(v*vec2(1.3,2.6) + vec2(uT*.015, 0.));
    c = mix(c, mix(vec3(.76), vec3(.93,.93,.91), cl), up*.94);
  }

  vec2 pa = vec2(v.x*ar, v.y);
  c += ash(pa, av) * uMoodB.x * (1. - up*2.4);
  c *= .95 + .05*sin(v.y*uR.y*1.3 + uT*2.);
  c += (h(v*uR + fract(uT*7.)*91.) - .5) * (uMoodA.w*(1. + dn*.5) + uLvl*.04);

  if (uMoodC.w > 0.) {
    float st = h(floor(v*uR*.5) + fract(uT*13.)*97.);
    float band = 1. - smoothstep(0., .05, abs(fract(v.y*.7 - uT*.18) - .5));
    c = mix(c, vec3(st)*(.45 + band*.35), uMoodC.w*(.72 + band*.2));
  }
  if (uInk > 0.) {
    float bd = length((v-uIO)*A) + (fbm(v*4. + uT*.2)-.5)*.4;
    float br = uInk*(length(A) + .45);
    float ink = 1. - smoothstep(br-.12, br, bd);
    float fr = exp(-pow((bd-br+.05)*26., 2.));
    c = mix(c, vec3(.023,.023,.031), ink);
    c += fr*vec3(.62,.05,.07)*(1.-ink*.7);
  }
  gl_FragColor = vec4(c, 1.);
}`;
  var UNI = ['uA', 'uB', 'uT', 'uP', 'uDepth', 'uR', 'uM', 'uMv', 'uLens', 'uRp', 'uV', 'uS', 'uInk', 'uIO', 'uLvl', 'uKick', 'uMoodA', 'uMoodB', 'uMoodC'];

  function key(k) { return k == null ? null : KEYS.indexOf(k) < 0 ? 'avatar' : k; }
  function norm(o) {
    return { cover: key(o.cover) || 'avatar', mood: MOODS.hasOwnProperty(o.mood) ? o.mood : 'surface',
      depth: +o.depth || 0, span: +o.span || 0, room: !!o.room, slug: o.slug || null };
  }

  var reduce = ES.reduce, main = document.getElementById('page'), ds = (main && main.dataset) || {};
  var pg = norm({ cover: ds.cover, mood: ds.mood, depth: ds.depth, span: ds.span, room: ds.page === 'room' });
  var seen = false, preview = null, base = null, cur = pg.cover, next = cur, shown = null, p = 1;
  var mood = new Float32Array(13), tgt = new Float32Array(13);
  var mA = mood.subarray(0, 4), mB = mood.subarray(4, 8), mC = mood.subarray(8, 12);
  tgt.set(MOODS[pg.mood]); mood.set(tgt);
  var d = pg.depth, fast = 0, anc = [];
  var T = 0, inkV = reduce ? 0 : 1, io = new Float32Array([.5, .5]), tw = null, booting = !reduce, cssTok = 0;
  var sy = scrollY, smax = 1, vh = innerHeight, ly = sy, lt = 0, vt = 0, vel = 0, quiet = 0;
  var mx = .5, my = .5, pt = 0, M = new Float32Array([.5, .5]), mv = 0, pres = 0, presE = 0;
  var rip = new Float32Array(16), ri = 0, ZERO = new Float32Array(16);
  var lvl = 0, kick = 0, heard = 0, queued = 0;
  var canvas = document.getElementById('bg'), gl = null, prog = null, U = {}, tex = {}, imgs = {}, ready = {};
  var tier = 0, gov = 1, highp = true, cw = 0, ch = 0, drawn = 0, skip = 30, avg = 0, slow = 0, probe = 0, pSum = 0;

  var inkEl = document.createElement('div');
  inkEl.className = 'ink'; inkEl.setAttribute('aria-hidden', 'true');
  (document.querySelector('.veil') || canvas).insertAdjacentElement('afterend', inkEl);

  // ---- GL ----
  function shader(pr, type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); gl.attachShader(pr, s); }
  function build() {
    var pr = gl.createProgram();
    shader(pr, gl.VERTEX_SHADER, VS);
    shader(pr, gl.FRAGMENT_SHADER, (tier === 1 ? '#define OCT 3\n#define ASH_L 2\n' : '') + (highp ? FS : FS.replace('highp', 'mediump')));
    gl.bindAttribLocation(pr, 0, 'p');
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { console.warn('sky:', gl.getProgramInfoLog(pr)); return false; }
    if (prog) gl.deleteProgram(prog);
    gl.useProgram(prog = pr);
    UNI.forEach(function (n) { U[n] = gl.getUniformLocation(pr, n === 'uRp' ? 'uRp[0]' : n); });
    gl.uniform1i(U.uA, 0); gl.uniform1i(U.uB, 1);
    sky.tier = tier;
    return true;
  }
  function baseScale() {
    return tier === 1 ? .75 : Math.min(Math.min(window.devicePixelRatio || 1, 1.5) * .8, Math.sqrt(2.1e6 / Math.max(1, cw * ch)));
  }
  function size() {
    vh = innerHeight;
    smax = Math.max(1, html.scrollHeight - vh);
    anchors();
    cw = canvas.clientWidth; ch = canvas.clientHeight;
    if (!gl) return;
    var b = baseScale(), s = Math.max(Math.min(b, .45), b * gov);
    var w = Math.max(1, Math.round(cw * s)), h = Math.max(1, Math.round(ch * s));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(U.uR, w, h);
    need();
  }

  // depth: data-depth + data-span * progress, or piecewise-linear through #page [data-depth-at] anchors,
  // each reached when its top meets the viewport top. offsets are cached by size(), never read per frame.
  function anchors() {
    var m = document.getElementById('page');
    anc = [].map.call(m ? m.querySelectorAll('[data-depth-at]') : [], function (el) {
      for (var y = -(parseFloat(getComputedStyle(el).scrollMarginTop) || 0), e = el; e; e = e.offsetParent) y += e.offsetTop;
      return [Math.min(smax, Math.max(0, y)), +el.getAttribute('data-depth-at') || 0];
    }).sort(function (a, b) { return a[0] - b[0]; });
  }
  function depth() {
    var y = Math.min(smax, Math.max(0, sy)), y0 = 0, v0 = pg.depth, i;
    if (!anc.length) return pg.depth + pg.span * y / smax;
    for (i = 0; i < anc.length; i++) {
      if (y < anc[i][0]) return v0 + (anc[i][1] - v0) * (y - y0) / (anc[i][0] - y0);
      y0 = anc[i][0]; v0 = anc[i][1];
    }
    return v0;
  }

  // P2-9: past the first 30 frames, 2s of >24ms frames steps the scale down by .75 to .45, then to tier 1. never back up.
  // slow frames are only blamed on the sky if they speed up while it stops drawing for a few frames (a 30Hz cap,
  // Low Power Mode or a busy main thread stay just as slow). returns true while that probe holds the last frame.
  function govern(dt) {
    if (skip > 0) { skip--; return false; }
    if (!probe) {
      avg = avg ? avg + (dt * 1000 - avg) * .05 : dt * 1000;
      if (avg <= 24) { slow = 0; return false; }
      if ((slow += dt) < 2 || tw || p < 1) return false;
      probe = 1; pSum = 0;
      return true;
    }
    if (tw || p < 1) { probe = 0; return false; }   // ink and dissolves must draw: probe again after
    if (++probe > 4) pSum += dt;                   // frames 2-4 let the GPU drain its backlog
    if (probe < 12) return true;
    probe = 0; slow = 0; skip = 30;
    if (pSum / 8 * 1000 > avg * .8) { avg = 0; skip = 1800; return false; }   // not the sky's fault
    avg = 0;
    var b = baseScale();
    if (b * gov > .451) gov = Math.max(.45 / b, gov * .75);
    else if (tier === 2) { tier = 1; if (!build()) { fallback(); return true; } }   // no gl left to draw with
    else { skip = Infinity; return false; }
    ES.store.sset('sky', { t: tier, g: gov });
    size();
    return false;
  }

  function frame(dt, now) {
    var still = reduce, i, k;
    var dT = depth();
    if (still || Math.abs(dT - d) < 1e-3) d = dT;
    else d += (dT - d) * (1 - Math.exp(-dt * (fast > 0 ? 4 : 2.5)));
    fast -= dt;
    sky.d = d;
    if (!gl) return;

    k = still ? 1 : 1 - Math.exp(-dt * 2.5);
    for (i = 0; i < 13; i++) mood[i] += (tgt[i] - mood[i]) * k;
    if (still) { p = 1; cur = next; }
    else {
      T += dt;
      if (p < 1 && (p += dt / 1.7) >= 1) { p = 1; cur = next; }
      k = 1 - Math.exp(-dt * 10);
      M[0] += (mx - M[0]) * k; M[1] += (my - M[1]) * k;
      mv *= Math.exp(-dt * 3);
      presE += (pres - presE) * (1 - Math.exp(-dt * 6));
      vt *= Math.exp(-dt * 8); vel += (vt - vel) * (1 - Math.exp(-dt * 12));
      if (now - heard > 250) { k = Math.exp(-dt * 6); lvl *= k; kick *= k; }   // the player went quiet
      if (tw) {
        k = Math.min(1, Math.max(0, (now - tw.at) / tw.dur));
        inkV = tw.to ? tw.from + (1 - tw.from) * k * k * k : tw.from * (1 - k) * (1 - k) * (1 - k);
        if (k >= 1) end(tw);
      }
      if (!FORCE && govern(dt)) return;
      if (tier === 1 && now - drawn < 30) return;   // tier 1: 30fps
    }
    drawn = now;
    if (!cw) return;
    var e = p < .5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex[p < 1 ? cur : next]);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex[next]);
    gl.uniform1f(U.uT, still ? 12 : T);
    gl.uniform1f(U.uP, p < 1 ? e : 0);
    gl.uniform1f(U.uDepth, d);
    gl.uniform2f(U.uM, still ? .5 : M[0], still ? .5 : M[1]);
    gl.uniform1f(U.uMv, still ? 0 : mv);
    gl.uniform1f(U.uLens, still ? 0 : presE * mood[12]);
    gl.uniform4fv(U.uRp, still ? ZERO : rip);
    gl.uniform1f(U.uV, still ? 0 : vel);
    gl.uniform1f(U.uS, still ? 0 : sy / vh);
    gl.uniform1f(U.uInk, inkV);
    gl.uniform2fv(U.uIO, io);
    gl.uniform1f(U.uLvl, still ? 0 : lvl);
    gl.uniform1f(U.uKick, still ? 0 : kick);
    gl.uniform4fv(U.uMoodA, mA); gl.uniform4fv(U.uMoodB, mB); gl.uniform4fv(U.uMoodC, mC);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  // reduced motion: no loop, one static frame whenever something changes
  function need() {
    if (reduce && !queued) queued = requestAnimationFrame(function (now) { queued = 0; frame(0, now); });
  }

  // ---- covers: preview ?? (!room ? base : null) ?? page cover ----
  function load(k) {
    if (imgs[k]) return;
    var im = imgs[k] = new Image();
    im.onload = function () {
      if (gl) try {
        gl.bindTexture(gl.TEXTURE_2D, tex[k]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
      } catch (e) { fallback(); }            // file:// taints images for WebGL
      ready[k] = true;
      update();
      if (booting && seen && k === pg.cover) bootDrain();
    };
    im.src = ES.url('assets/img/' + k + '.jpg');
  }
  function update() {
    var k = preview || (!pg.room && base) || pg.cover;
    if (k !== next) {
      if (!ready[k]) load(k);
      else if (reduce || inkV > .99 || !gl) { cur = next = k; p = 1; }   // hidden by ink, or nothing to dissolve
      else { if (p >= .5) cur = next; next = k; p = cur === k ? 1 : 0; }
    }
    if (!gl) canvas.style.setProperty('--cover', 'url("' + ES.url('assets/img/' + next + '.jpg') + '")');
    if (seen && next !== shown) { sky.key = shown = next; ES.emit('cover', { key: next }); }
    need();
  }

  // ---- ink: GL tween, or the CSS .ink ----
  function end(t) { if (tw === t) { tw = null; inkV = t.to; need(); } clearTimeout(t.guard); t.res(); }
  function stop() { var t = tw; if (t) { tw = null; clearTimeout(t.guard); t.res(); } }
  function tween(to, dur) {
    stop();
    var t = tw = { from: inkV, to: to, at: performance.now(), dur: dur };
    t.p = new Promise(function (res) { t.res = res; });
    t.guard = setTimeout(function () { end(t); }, dur + 150);   // hidden tab: no frames, still resolve
    return t.p;
  }
  function reach(x, y) {   // px radius that covers the viewport from (x, y)
    var w = Math.max(x, 1 - x) * innerWidth, h = Math.max(y, 1 - y) * innerHeight;
    return Math.ceil(Math.sqrt(w * w + h * h)) + 8;
  }
  function inkCss(x, y, r, cls) {
    var s = inkEl.style;
    inkEl.className = 'ink on' + (cls ? ' ' + cls : '');
    s.setProperty('--x', x * 100 + '%'); s.setProperty('--y', y * 100 + '%'); s.setProperty('--r', r + 'px');
  }
  function settle(ms) {
    var tok = ++cssTok;
    return new Promise(function (res) {
      var t = setTimeout(fin, ms);
      function fin(e) {
        if (e && e.target !== inkEl) return;
        clearTimeout(t); inkEl.removeEventListener('transitionend', fin); res(tok === cssTok);
      }
      inkEl.addEventListener('transitionend', fin);
    });
  }
  function ink(x, y) {
    booting = false;
    if (reduce) return Promise.resolve();
    x = isFinite(x) ? +x : .5; y = isFinite(y) ? +y : .5;
    if (!gl) {
      if (inkV >= .99) return Promise.resolve();
      inkCss(x, y, reach(x, y));
      return settle(360).then(function (mine) { if (mine) inkV = 1; });
    }
    if (tw && tw.to) return tw.p;
    io[0] = x * innerWidth / (cw || innerWidth); io[1] = y * innerHeight / (ch || innerHeight);
    if (inkV >= .99) { stop(); inkV = 1; return Promise.resolve(); }
    return tween(1, 320);
  }
  function drain(dir) {
    booting = false;
    var y = dir === 'up' ? -.15 : 1.15;
    if (reduce) { stop(); inkV = 0; inkEl.className = 'ink'; need(); return Promise.resolve(); }
    if (!gl) {
      if (!inkEl.classList.contains('on')) return Promise.resolve();
      inkV = 0;
      inkCss(.5, y, reach(.5, y), 'snap');   // move the origin at full cover: invisible
      void inkEl.offsetWidth;
      inkCss(.5, y, 0, 'out');
      return settle(700).then(function (mine) { if (mine) inkEl.className = 'ink'; });
    }
    io[0] = .5; io[1] = y;
    return tween(0, 650);
  }
  function bootDrain() { if (booting) drain('down'); }

  function fallback() {
    if (canvas.tagName !== 'CANVAS') return;
    var to = tw ? tw.to : inkV > .5 ? 1 : 0;
    stop();
    gl = null; sky.gl = false; sky.tier = 0;
    var el = document.createElement('div');
    el.id = 'bg'; el.setAttribute('aria-hidden', 'true');
    canvas.parentNode.replaceChild(el, canvas); canvas = el;
    inkV = reduce ? 0 : to;
    if (inkV) inkCss(.5, .5, reach(.5, .5), 'snap');
    size(); update();
  }

  // ---- boot ----
  // software WebGL (SwiftShader, llvmpipe) runs this shader at a few fps: the CSS still is better
  if (!/[?&]nogl(?:[=&]|$)/.test(Q)) try {
    gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, failIfMajorPerformanceCaveat: true });
    var dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
    if (gl && !FORCE && /swiftshader|llvmpipe|softpipe|software|basic render/i.test(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER))) gl = null;
  } catch (e) { gl = null; }
  if (gl) {
    var hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT), st = ES.store.sget('sky', null) || {};
    var net = navigator.connection || {};
    highp = !!(hp && hp.precision);
    tier = FORCE || (st.t === 1 || !highp || net.saveData || (matchMedia('(pointer: coarse)').matches &&
      ((navigator.hardwareConcurrency || 8) <= 6 || (navigator.deviceMemory || 8) <= 4)) ? 1 : 2);
    gov = FORCE ? 1 : Math.min(1, +st.g || 1);
    if (!build() && (tier === 1 || (tier = 1, !build()))) gl = null;
  }
  if (gl) {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    KEYS.forEach(function (k) {
      gl.bindTexture(gl.TEXTURE_2D, tex[k] = gl.createTexture());
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([6, 6, 8, 255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    });
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); fallback(); });
    canvas.classList.add('gl');
    sky.gl = true;
    size();
  } else fallback();

  load(pg.cover); load('avatar');
  (window.requestIdleCallback || function (f) { return setTimeout(f, 1500); })(function () { KEYS.forEach(load); }, { timeout: 3000 });

  if (window.ResizeObserver) { var ro = new ResizeObserver(function () { size(); }); ro.observe(canvas); ro.observe(document.body); }
  addEventListener('resize', size);

  addEventListener('scroll', function () {
    var y = scrollY, t = performance.now();
    if (!reduce && t > quiet) vt = Math.max(-1, Math.min(1, (y - ly) / Math.max(8, t - lt) / 3));   // P3-1 flick
    ly = sy = y; lt = t;
    need();
  }, { passive: true });

  // P2-3: the pointer lives in the sky
  addEventListener('pointermove', function (e) {
    if (reduce) return;
    var x = e.clientX / (cw || innerWidth), y = e.clientY / (ch || innerHeight);
    var dx = (x - mx) * (cw || 1) / (ch || 1), dy = y - my;
    mv = Math.min(1, Math.max(mv, Math.sqrt(dx * dx + dy * dy) / Math.max(8, e.timeStamp - pt) * 500));
    mx = x; my = y; pt = e.timeStamp;
    if (e.pointerType !== 'touch') pres = 1;
  }, { passive: true });
  addEventListener('pointerdown', function (e) {
    if (reduce) return;
    if (e.pointerType === 'touch') { pres = 1; mx = e.clientX / (cw || innerWidth); my = e.clientY / (ch || innerHeight); }
    ripple(e.clientX / innerWidth, e.clientY / innerHeight);
  }, { passive: true });
  function lift(e) { if (e.pointerType === 'touch') pres = 0; }
  addEventListener('pointerup', lift, { passive: true });
  addEventListener('pointercancel', lift, { passive: true });
  document.addEventListener('mouseout', function (e) { if (!e.relatedTarget) pres = 0; });

  function ripple(x, y) {
    if (reduce || !gl) return;
    var o = ri * 4;
    rip[o] = x * innerWidth / (cw || innerWidth); rip[o + 1] = y * innerHeight / (ch || innerHeight); rip[o + 2] = T; rip[o + 3] = 1;
    ri = (ri + 1) & 3;
  }

  ES.on('prefs', function () {
    if (reduce === ES.reduce) return;
    reduce = ES.reduce;
    if (reduce) {
      ES.tick.remove(frame);
      stop(); inkV = 0; booting = false; inkEl.className = 'ink';
      lvl = kick = pres = presE = mv = vt = vel = 0;
      need();
    } else ES.tick.add(frame);
  });

  if (reduce) need(); else ES.tick.add(frame);
  setTimeout(bootDrain, 1200);

  Object.assign(sky, {
    d: d, key: null,
    page: function (o) {
      pg = norm(o || {});
      tgt.set(MOODS[pg.mood]);
      fast = 1; quiet = performance.now() + 120;   // the router's scrollTo is not a flick
      sy = ly = scrollY;
      size();
      if (!seen || reduce) sky.d = d = depth();   // reduced motion: current before es:page, not a frame later
      if (!seen) { seen = true; mood.set(tgt); }
      update();
      if (booting && ready[pg.cover]) bootDrain();
    },
    preview: function (k) { preview = key(k); update(); },
    base: function (k) { base = key(k); update(); },
    ink: ink,
    drain: drain,
    ripple: ripple,
    audio: function (l, k) { if (!reduce) { lvl = +l || 0; kick = +k || 0; heard = performance.now(); } }
  });
})();
