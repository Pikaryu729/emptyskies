/* EXHALE — the EmptySkies wordmark breathes out into ash as you scroll.
   window.Hero = { init(rootEl, opts), destroy() }. Vanilla, ES2017, no deps.

   The wordmark is rasterised once into a texture; a per-pixel "release time" map (edges first, then
   inward and downward, broken up by noise) drives both the dissolve of the solid letters and the
   departure of ~20k GL_POINTS sampled from the same pixels. Every particle's position is a pure
   function of (home, seed, eased progress, time): it walks a few steps along a curl-noise flow field,
   so scrolling back up draws the ash back along the same currents and the letters re-form exactly.
   Scroll → target progress → critically-damped spring → uniforms. One scrollY read per frame. */
(function () {
  'use strict';

  var BONE = [0.863, 0.863, 0.847];
  var SPAN = 0.42;       // progress over which the release front sweeps the letters
  var DRIFT = 0.5;       // progress each particle spends drifting after release
  var PAR = 0.55;        // the wordmark lags the page (parallax) so it dissolves mid-screen
  var OMEGA = 5.2;       // spring stiffness (rad/s): lower = heavier, slower to catch up

  var VS_TEXT = [
    'attribute vec2 aQ;',
    'uniform vec2 uO, uSize, uRes; uniform float uDpr, uLift;',
    'varying vec2 vUv;',
    'void main(){',
    '  vUv = aQ;',
    '  vec2 o = floor((uO + vec2(0., uLift))*uDpr + .5)/uDpr;',               // keep texels on the device-pixel grid
    '  vec2 p = (o + aQ*uSize) / uRes * 2. - 1.;',
    '  gl_Position = vec4(p.x, -p.y, 0., 1.);',
    '}'
  ].join('\n');

  var FS_TEXT = [
    'precision mediump float;',
    'uniform sampler2D uCov, uRel; uniform float uP, uBreath; uniform vec3 uCol;',
    'varying vec2 vUv;',
    'void main(){',
    '  float cov = texture2D(uCov, vUv).a;',
    '  float rs = .006 + texture2D(uRel, vUv).r * ' + SPAN.toFixed(3) + ';',
    '  float vis = 1. - smoothstep(rs - .006, rs, uP);',
    '  float glow = smoothstep(rs - .06, rs - .004, uP) * vis;',   // embers just ahead of the front
    '  float a = cov * vis * uBreath;',
    '  gl_FragColor = vec4(uCol * (1. + .45*glow), 1.) * a;',
    '}'
  ].join('\n');

  var VS_ASH = [
    'attribute vec4 aP;',   // home.xy (canvas px), release [0..1], kind (0 ash, 1 smoke)
    'attribute vec4 aR;',   // four uniform randoms
    'uniform vec2 uO, uRes; uniform vec3 uLine;',
    'uniform float uP, uV, uT, uF, uRise, uEnd, uDpr, uTexW, uSettle, uLift;',
    'varying float vA; varying float vK; varying float vL;',
    'float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'vec3 vn(vec2 p){',     // value noise + analytic gradient
    '  vec2 i = floor(p), f = fract(p);',
    '  vec2 u = f*f*(3.-2.*f), du = 6.*f*(1.-f);',
    '  float a = h(i), b = h(i+vec2(1.,0.)), c = h(i+vec2(0.,1.)), d = h(i+vec2(1.,1.));',
    '  float k = a - b - c + d;',
    '  return vec3(a + (b-a)*u.x + (c-a)*u.y + k*u.x*u.y, du * (vec2(b-a, c-a) + k*u.yx));',
    '}',
    'vec2 curl(vec2 p){',
    '  vec3 n1 = vn(p + vec2(0., uT*.07));',
    '  vec3 n2 = vn(p*2.3 + vec2(uT*.05, 3.1));',
    '  vec2 g = n1.yz + .45*2.3*n2.yz;',
    '  return vec2(g.y, -g.x);',
    '}',
    'void main(){',
    '  float rs = .006 + aP.z * ' + SPAN.toFixed(3) + ';',
    '  if (uP <= rs) { gl_Position = vec4(2., 2., 2., 1.); gl_PointSize = 0.; vA = 0.; return; }',
    '  float r = clamp((uP - rs) / ' + DRIFT.toFixed(3) + ', 0., 1.);',
    '  float er = r*r*(3.-2.*r);',
    '  float smoke = aP.w;',
    // walk the flow field: step length grows with release, so r = 0 is exactly home
    '  float L = uRise * er * mix(.6, 1.4, aR.x) * .2;',
    '  vec2 d = vec2(0.);',
    '  for (int i = 0; i < 5; i++) {',
    '    vec2 c = curl((aP.xy + d) / uF * .95);',
    '    d += (c * 1.6 + vec2(0., -1.)) * L;',
    '  }',
    '  d += (aR.yz - .5) * uF * .18 * er;',                        // diffusion: the plume widens
    '  d.y -= uV * uF * .5 * er * (1. - er);',                    // inertia: fast scroll whips the ash up
    '  vec2 pos = uO + aP.xy + d;',
    // released ash lets go of the page and hangs in the sky: it stops following the scroll
    '  float hang = 1. - (1.-r)*(1.-r)*(1.-r);',
    '  pos.y += uLift + ' + (1 - PAR).toFixed(3) + ' * (uP - rs) * uEnd * .94 * hang;',
    // settle a share of the ash onto the handoff hairline
    '  float isS = step(aR.w, uSettle) * (1. - smoke);',
    '  float t0 = .5 + .14*aR.y;',
    '  float g = smoothstep(t0, t0 + .32, uP) * isS;',
    '  g = g*g*(3.-2.*g);',
    '  vec2 tgt = vec2(mix(uLine.x, uLine.y, clamp((aP.x)/uTexW + (aR.z-.5)*.08, 0., 1.)), uLine.z + (aR.y-.5)*.9);',
    '  pos = mix(pos, tgt, g);',
    // alpha: flare at lift-off, thin to grain; settlers hold a faint glow until the DOM line takes over
    '  float aIn = smoothstep(0., .02, uP - rs);',
    '  float thin = 1. - smoothstep(.4, 1., r);',
    '  float flare = 1. + .8 * (1. - smoothstep(0., .12, r));',
    '  float settleA = (mix(.8, .5, g) + .45*g*(1.-g)) * (1. - smoothstep(.95, 1., uP));',
    '  float a = aIn * flare * mix(thin * mix(.5, 1., aR.z), settleA, isS);',
    '  float sz = mix(1.1, 2.4, aR.y) * mix(1., .6, er);',
    '  sz = mix(sz, 1.7, g*(1.-g)*2.) ;',
    '  sz = mix(sz, 1.3, g*g);',
    '  if (smoke > .5) { sz = mix(8., 48., er) * mix(.7, 1.3, aR.y); a = aIn * .09 * sin(3.1416 * r); }',
    '  vA = a; vK = smoke; vL = aR.z;',
    '  gl_PointSize = sz * uDpr;',
    '  vec2 p = pos / uRes * 2. - 1.;',
    '  gl_Position = vec4(p.x, -p.y, 0., 1.);',
    '}'
  ].join('\n');

  var FS_ASH = [
    'precision mediump float;',
    'uniform vec3 uCol;',
    'varying float vA; varying float vK; varying float vL;',
    'void main(){',
    '  vec2 c = gl_PointCoord - .5;',
    '  float d = dot(c, c) * 4.;',
    '  float m = vK > .5 ? exp(-d * 3.5) * (1. - d) : 1. - smoothstep(.3, 1., d);',
    '  m = max(m, 0.);',
    '  vec3 col = mix(uCol, vec3(.545, .549, .561), vL * .55);',   // bone → ash
    '  gl_FragColor = vec4(col, 1.) * (m * vA);',
    '}'
  ].join('\n');

  var S = null;

  function compile(gl, vs, fs) {
    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return { p: p, u: u };
  }

  function makeTex(gl) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  // deterministic PRNG so every rebuild (resize) scatters the ash identically
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function vnoise(x, y) {
    function hh(i, j) { var s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); }
    var i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var a = hh(i, j), b = hh(i + 1, j), c = hh(i, j + 1), d = hh(i + 1, j + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  /* Measure the h1 and the handoff line (layout reads happen here only: init + resize). */
  function measure() {
    var root = S.root, h1 = S.h1, sy = window.scrollY;
    var rr = root.getBoundingClientRect();
    var hr = h1.getBoundingClientRect();
    var cs = getComputedStyle(h1);
    var m = { sy: sy, rootTop: rr.top + sy, rootLeft: rr.left, rootH: rr.height, vw: document.documentElement.clientWidth,
      fs: parseFloat(cs.fontSize), lh: parseFloat(cs.lineHeight), ls: cs.letterSpacing,
      font: cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily,
      text: h1.textContent.trim(), cx: hr.left + hr.width / 2, top: hr.top + sy - (rr.top + sy) };
    if (isNaN(m.lh)) m.lh = m.fs * 0.9;
    if (S.hand) {
      var lr = S.hand.getBoundingClientRect();
      m.line = [lr.left, lr.right, lr.bottom - 0.5 + sy - m.rootTop];
    } else {
      m.line = [m.cx - m.fs * 2, m.cx + m.fs * 2, m.rootH * 1.15];
    }
    return m;
  }

  /* Rasterise the wordmark: a DPR coverage texture for the solid letters, and a 1x release map
     (distance-to-edge + height + noise) that both the dissolve and the particles read. */
  function build(m) {
    var gl = S.gl, dpr = S.dpr;
    var c2 = document.createElement('canvas').getContext('2d');
    c2.font = m.font;
    if ('letterSpacing' in c2) c2.letterSpacing = m.ls;
    var tm = c2.measureText(m.text);
    var asc = tm.fontBoundingBoxAscent, desc = tm.fontBoundingBoxDescent;
    if (!(asc > 0)) { asc = m.fs * 0.8; desc = m.fs * 0.2; }
    var baseline = m.top + (m.lh - (asc + desc)) / 2 + asc;          // CSS inline box model
    var x0 = m.cx - tm.width / 2;
    var pad = Math.ceil(m.fs * 0.06);
    var bl = Math.max(tm.actualBoundingBoxLeft || 0, 0), br = tm.actualBoundingBoxRight || tm.width;
    var ba = tm.actualBoundingBoxAscent || asc, bd = tm.actualBoundingBoxDescent || desc;
    var ox = Math.floor(x0 - bl - pad), oy = Math.floor(baseline - ba - pad);
    var W = Math.ceil(x0 + br + pad) - ox, H = Math.ceil(baseline + bd + pad) - oy;

    function draw(scale) {
      var cv = document.createElement('canvas');
      cv.width = Math.ceil(W * scale); cv.height = Math.ceil(H * scale);
      var c = cv.getContext('2d');
      c.scale(scale, scale);
      c.font = m.font;
      if ('letterSpacing' in c) c.letterSpacing = m.ls;
      c.fillStyle = '#fff'; c.textBaseline = 'alphabetic';
      c.fillText(m.text, x0 - ox, baseline - oy);
      return cv;
    }
    var hi = draw(dpr);
    var lo = draw(1).getContext('2d').getImageData(0, 0, W, H).data;

    // chamfer distance to the nearest empty pixel (two passes)
    var n = W * H, dist = new Float32Array(n), BIG = 1e6, x, y, i;
    for (i = 0; i < n; i++) dist[i] = lo[i * 4 + 3] > 127 ? BIG : 0;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      i = y * W + x; if (!dist[i]) continue;
      var v = dist[i];
      if (x > 0) v = Math.min(v, dist[i - 1] + 1);
      if (y > 0) { v = Math.min(v, dist[i - W] + 1); if (x > 0) v = Math.min(v, dist[i - W - 1] + 1.4142); if (x < W - 1) v = Math.min(v, dist[i - W + 1] + 1.4142); }
      dist[i] = v;
    }
    for (y = H - 1; y >= 0; y--) for (x = W - 1; x >= 0; x--) {
      i = y * W + x; if (!dist[i]) continue;
      var w = dist[i];
      if (x < W - 1) w = Math.min(w, dist[i + 1] + 1);
      if (y < H - 1) { w = Math.min(w, dist[i + W] + 1); if (x < W - 1) w = Math.min(w, dist[i + W + 1] + 1.4142); if (x > 0) w = Math.min(w, dist[i + W - 1] + 1.4142); }
      dist[i] = w;
    }

    // release time per pixel: edges first, top before bottom, broken into drifting patches by noise
    var rel = new Float32Array(n), inside = [], lo2 = 1, hi2 = 0, edge = m.fs * 0.075, nf = 3.2 / m.fs;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      i = y * W + x;
      if (!dist[i]) continue;
      var s = 0.5 * Math.min(1, dist[i] / edge) + 0.1 * (y / H) +
              0.4 * (vnoise(x * nf, y * nf) * 0.65 + vnoise(x * nf * 2.7 + 9, y * nf * 2.7) * 0.35);
      rel[i] = s; inside.push(i);
      if (s < lo2) lo2 = s; if (s > hi2) hi2 = s;
    }
    var span = Math.max(1e-3, hi2 - lo2), relB = new Uint8Array(n);
    for (i = 0; i < n; i++) relB[i] = dist[i] ? Math.round((rel[i] - lo2) / span * 255) : 0;

    // sample particles from the filled pixels
    var N = inside.length ? S.count : 0, P = new Float32Array(N * 4), R = new Float32Array(N * 4), rnd = rng(1337);
    for (var k = 0; k < N; k++) {
      var idx = inside[Math.floor(rnd() * inside.length)], px = idx % W, py = (idx - px) / W;
      P[k * 4] = px + rnd(); P[k * 4 + 1] = py + rnd();
      P[k * 4 + 2] = (rel[idx] - lo2) / span;
      P[k * 4 + 3] = rnd() < S.smokeShare ? 1 : 0;
      R[k * 4] = rnd(); R[k * 4 + 1] = rnd(); R[k * 4 + 2] = rnd(); R[k * 4 + 3] = rnd();
    }

    gl.bindTexture(gl.TEXTURE_2D, S.texCov);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, hi);
    gl.bindTexture(gl.TEXTURE_2D, S.texRel);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, W, H, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, relB);
    gl.bindBuffer(gl.ARRAY_BUFFER, S.bufP); gl.bufferData(gl.ARRAY_BUFFER, P, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, S.bufR); gl.bufferData(gl.ARRAY_BUFFER, R, gl.STATIC_DRAW);
    S.n = N; S.box = [ox, oy, W, H];
  }

  function layout() {
    var m = measure();
    var key = m.vw + '|' + m.fs + '|' + m.text + '|' + S.dpr;
    var cw = m.vw, ch = Math.ceil(m.line[2] + m.fs * 0.6);
    // write phase
    var cv = S.canvas;
    cv.style.left = -m.rootLeft + 'px';
    cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
    cv.width = Math.round(cw * S.dpr); cv.height = Math.round(ch * S.dpr);
    S.gl.viewport(0, 0, cv.width, cv.height);
    if (key !== S.key) { build(m); S.key = key; }
    S.m = m; S.cw = cw; S.ch = ch;
    // progress 1 = hairline sits ~40% down the hero's viewport (svh-based, so mobile URL-bar resizes don't shift it)
    S.end = Math.max(1, m.line[2] - m.rootH * 0.4);
    S.bottom = m.rootTop + ch;
  }

  function draw(now) {
    var gl = S.gl, m = S.m, t = S.text, a = S.ash, b = S.box;
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!S.n) return;
    var time = (now - S.t0) / 1000;

    gl.useProgram(t.p);
    gl.uniform2f(t.u.uO, b[0], b[1]);
    gl.uniform2f(t.u.uSize, b[2], b[3]);
    gl.uniform2f(t.u.uRes, S.cw, S.ch);
    gl.uniform1f(t.u.uDpr, S.dpr);
    gl.uniform1f(t.u.uP, S.p);
    gl.uniform1f(t.u.uLift, S.still ? 0 : S.p * S.end * PAR);
    gl.uniform1f(t.u.uBreath, S.still ? 1 : 0.955 + 0.045 * Math.cos(time * 0.7));
    gl.uniform3f(t.u.uCol, BONE[0], BONE[1], BONE[2]);
    gl.uniform1i(t.u.uCov, 0); gl.uniform1i(t.u.uRel, 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S.texCov);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, S.texRel);
    gl.bindBuffer(gl.ARRAY_BUFFER, S.bufQ);
    gl.enableVertexAttribArray(S.locQ);
    gl.vertexAttribPointer(S.locQ, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(S.locQ);

    if (S.p <= 0.0005) return;
    gl.useProgram(a.p);
    gl.uniform2f(a.u.uO, b[0], b[1]);
    gl.uniform2f(a.u.uRes, S.cw, S.ch);
    gl.uniform3f(a.u.uLine, m.line[0], m.line[1], m.line[2]);
    gl.uniform1f(a.u.uP, S.p);
    gl.uniform1f(a.u.uV, S.v);
    gl.uniform1f(a.u.uT, time);
    gl.uniform1f(a.u.uF, m.fs);
    gl.uniform1f(a.u.uRise, Math.max(m.fs * 0.45, m.rootH * 0.15));
    gl.uniform1f(a.u.uEnd, S.still ? 0 : S.end);
    gl.uniform1f(a.u.uLift, S.still ? 0 : S.p * S.end * PAR);
    gl.uniform1f(a.u.uDpr, S.dpr);
    gl.uniform1f(a.u.uTexW, b[2]);
    gl.uniform1f(a.u.uSettle, S.settle);
    gl.uniform3f(a.u.uCol, BONE[0], BONE[1], BONE[2]);
    gl.bindBuffer(gl.ARRAY_BUFFER, S.bufP);
    gl.enableVertexAttribArray(S.locP); gl.vertexAttribPointer(S.locP, 4, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, S.bufR);
    gl.enableVertexAttribArray(S.locR); gl.vertexAttribPointer(S.locR, 4, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.POINTS, 0, S.n);
    gl.disableVertexAttribArray(S.locP); gl.disableVertexAttribArray(S.locR);
  }

  function smooth01(a, b, x) { x = (x - a) / (b - a); x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); }

  /* DOM companions: only transform/opacity, only written when they change. */
  function syncDom() {
    var p = S.p;
    var hand = S.still ? 1 : smooth01(0.9, 1.0, p);
    if (S.hand && Math.abs(hand - S.lastHand) > 0.002) { S.hand.style.setProperty('--hero-hand', hand.toFixed(3)); S.lastHand = hand; }
    if (S.under && Math.abs(p - S.lastUnder) > 0.0005) {
      var u = smooth01(0.04, 0.34, p);
      S.under.style.opacity = (1 - u).toFixed(3);
      S.under.style.transform = 'translate3d(0,' + (-u * 18).toFixed(2) + 'px,0)';
      S.lastUnder = p;
    }
    if (S.cue && Math.abs(p - S.lastCue) > 0.0005) { S.cue.style.opacity = (1 - smooth01(0, 0.07, p)).toFixed(3); S.lastCue = p; }
  }

  function frame(now) {
    S.raf = 0;
    var dt = S.last ? Math.min((now - S.last) / 1000, 1 / 20) : 1 / 60;
    S.last = now;
    S.sy = window.scrollY;                                            // the one per-frame read
    var target = Math.min(1, Math.max(0, (S.sy - S.m.rootTop) / S.end));
    // critically damped spring toward the scroll target: weighted, never overshoots, never jumps
    var acc = OMEGA * OMEGA * (target - S.p) - 2 * OMEGA * S.v;
    S.v += acc * dt; S.p += S.v * dt;
    if (S.p < 0) { S.p = 0; if (S.v < 0) S.v = 0; }
    var resting = Math.abs(target - S.p) < 1e-4 && Math.abs(S.v) < 1e-4;
    if (resting) { S.p = target; S.v = 0; }
    draw(now);
    syncDom();
    // fully handed off and the hero is scrolled away: stop and drop the layer
    var done = resting && S.p >= 1;
    if (done !== S.off) { S.canvas.style.visibility = done ? 'hidden' : ''; S.off = done; }
    if (!done && !document.hidden) S.raf = requestAnimationFrame(frame);
  }

  function kick() { if (S && !S.raf && !S.still && !document.hidden) { S.last = 0; S.raf = requestAnimationFrame(frame); } }

  function onResize() {
    clearTimeout(S.rt);
    S.rt = setTimeout(function () {
      if (!S) return;
      var w = document.documentElement.clientWidth;
      if (w === S.m.vw && !S.still) return;       // height-only (mobile URL bar): nothing to rebuild
      layout();
      if (S.still) draw(S.t0 + 12000); else kick();
    }, 120);
  }

  function onVis() { if (document.hidden) { if (S.raf) cancelAnimationFrame(S.raf); S.raf = 0; } else kick(); }

  function fail(e) {
    if (!S) return;
    if (window.console) console.warn('[hero] falling back to the DOM wordmark:', (e && e.type) || e);
    var root = S.root;
    destroy();
    root.classList.remove('hero-gl');
  }

  function init(root, opts) {
    if (S) destroy();
    opts = opts || {};
    if (!root) return;
    var h1 = root.querySelector('h1');
    if (!h1) return;
    var mm = window.matchMedia;
    var coarse = mm && mm('(pointer: coarse)').matches;
    var still = mm && mm('(prefers-reduced-motion: reduce)').matches;

    var canvas = document.createElement('canvas');
    canvas.className = 'hero-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    var gl = null;
    try { gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' }); } catch (e) {}
    if (!gl) return;   // no WebGL: the DOM wordmark simply stays

    S = { root: root, h1: h1, canvas: canvas, gl: gl, still: still, raf: 0, last: 0, p: 0, v: 0, sy: 0,
      count: opts.count || (coarse ? 6500 : 20000), smokeShare: coarse ? 0.05 : 0.07, settle: coarse ? 0.42 : 0.36,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
      hand: opts.handoff || document.querySelector('[data-hero-handoff]'),
      under: root.querySelector('[data-hero-under]'), cue: root.querySelector('[data-hero-cue]'),
      lastHand: -1, off: false, lastUnder: -1, lastCue: -1, key: '', t0: performance.now() };

    try {
      S.text = compile(gl, VS_TEXT, FS_TEXT);
      S.ash = compile(gl, VS_ASH, FS_ASH);
    } catch (err) { if (window.console) console.warn('[hero] GL unavailable:', err.message); S = null; return; }
    S.locQ = gl.getAttribLocation(S.text.p, 'aQ');
    S.locP = gl.getAttribLocation(S.ash.p, 'aP');
    S.locR = gl.getAttribLocation(S.ash.p, 'aR');
    S.bufQ = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, S.bufQ);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    S.bufP = gl.createBuffer(); S.bufR = gl.createBuffer();
    S.texCov = makeTex(gl); S.texRel = makeTex(gl);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    var fam = getComputedStyle(h1).fontFamily;
    var ready = document.fonts && document.fonts.load ? document.fonts.load('400 100px ' + fam, h1.textContent) : Promise.resolve([1]);
    var mine = S;
    ready.then(function (faces) {
      if (S !== mine) return;
      if (faces && !faces.length) throw new Error('wordmark font not loaded');
      root.insertBefore(canvas, root.firstChild);
      layout();
      if (S.hand) S.hand.classList.add('hero-handoff');
      canvas.addEventListener('webglcontextlost', fail);
      window.addEventListener('resize', onResize);
      // swap only after the first GL frame is on screen: no flash, no double wordmark
      if (still) {
        S.p = 0.15; draw(S.t0 + 12000);
        root.classList.add('hero-gl');
        return;
      }
      window.addEventListener('scroll', kick, { passive: true });
      document.addEventListener('visibilitychange', onVis);
      S.sy = window.scrollY;
      S.p = Math.min(1, Math.max(0, (S.sy - S.m.rootTop) / S.end));   // arrive mid-page: start where the scroll is
      frame(performance.now());
      requestAnimationFrame(function () { if (S === mine) root.classList.add('hero-gl'); });
    }).catch(function (err) { if (window.console) console.warn('[hero]', err.message); if (S === mine) fail(); });
  }

  function destroy() {
    if (!S) return;
    var s = S; S = null;
    if (s.raf) cancelAnimationFrame(s.raf);
    clearTimeout(s.rt);
    window.removeEventListener('scroll', kick);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVis);
    s.root.classList.remove('hero-gl');
    if (s.hand) { s.hand.classList.remove('hero-handoff'); s.hand.style.removeProperty('--hero-hand'); }
    if (s.under) { s.under.style.opacity = ''; s.under.style.transform = ''; }
    if (s.cue) s.cue.style.opacity = '';
    s.canvas.removeEventListener('webglcontextlost', fail);   // before losing it, or the async event would tear down a re-init
    var lose = s.gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    if (s.canvas.parentNode) s.canvas.parentNode.removeChild(s.canvas);
  }

  window.Hero = { init: init, destroy: destroy };
})();
