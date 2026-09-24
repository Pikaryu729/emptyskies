(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canvas = document.getElementById('bg');
  var nowEl = document.getElementById('now');
  var NAMES = ['avatar', 'nohand2hold', 'deathalliwant', 'mylittlesoldier', 'bubbles'];
  var LABEL = { avatar: 'profile', nohand2hold: 'NoHand2Hold', deathalliwant: 'DeathAlliWant', mylittlesoldier: 'MyLittleSoldier', bubbles: 'Bubbles' };

  function setNow(key, label) {
    nowEl.style.opacity = 0;
    setTimeout(function () { nowEl.textContent = 'now showing / ' + (label || LABEL[key]); nowEl.style.opacity = 1; }, 250);
  }
  function cssShow(key, label) { canvas.style.backgroundImage = 'url(assets/img/' + key + '.jpg)'; setNow(key, label); }

  var gl = null, prog = null, show = cssShow;
  try { gl = canvas.getContext('webgl', { antialias: false }); } catch (e) {}

  if (gl) {
    var vs = 'attribute vec2 p; varying vec2 v; void main(){ v = p*.5+.5; v.y = 1.-v.y; gl_Position = vec4(p,0.,1.); }';
    var fs = [
      'precision highp float;',
      'uniform sampler2D uA; uniform sampler2D uB; uniform float uP; uniform float uT; uniform vec2 uR;',
      'varying vec2 v;',
      'float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }',
      'float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);',
      '  return mix(mix(h(i),h(i+vec2(1.,0.)),f.x), mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x), f.y); }',
      'float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.03; a*=.5; } return s; }',
      'vec3 tx(sampler2D t, vec2 uv, vec2 d){ return vec3(texture2D(t, uv+d).r, texture2D(t, uv).g, texture2D(t, uv-d).b); }',
      'void main(){',
      '  float ar = uR.x/uR.y;',
      '  vec2 uv = v - .5;',
      '  if (ar > 1.) uv.y /= ar; else uv.x *= ar;',
      '  float z = 1.14 + .035*sin(uT*.12);',
      '  uv = uv/z + .5 + vec2(sin(uT*.05), cos(uT*.037))*.015;',
      '  vec2 w = vec2(fbm(uv*2.6 + uT*.035), fbm(uv*2.6 + vec2(4.7,1.9) - uT*.03)) - .5;',
      '  uv += w*.05;',
      '  uv = clamp(uv, .001, .999);',
      '  vec2 d = (uv-.5)*.012 + w*.004;',
      '  vec3 a = tx(uA, uv, d);',
      '  vec3 b = tx(uB, uv, d);',
      '  float th = fbm(v*3.5 + uT*.08);',
      '  float m = smoothstep(th-.08, th+.08, uP*1.25-.12);',
      '  vec3 c = mix(a, b, m);',
      '  float edge = 1. - abs(m*2.-1.);',
      '  float l = dot(c, vec3(.299,.587,.114));',
      '  vec3 duo = mix(vec3(.015,.016,.024), vec3(.80,.81,.83), smoothstep(.04,.95,l));',
      '  c = mix(duo, c, .32);',
      '  c = pow(c, vec3(1.15)) * .6;',
      '  c += edge*edge*vec3(.55,.08,.09)*.55;',
      '  float vg = smoothstep(1.05, .2, length(v-.5)*1.35);',
      '  c *= mix(.25, 1., vg);',
      '  c *= .95 + .05*sin(v.y*uR.y*1.3 + uT*2.);',
      '  c += (h(v*uR + fract(uT*7.)*91.) - .5) * .09;',
      '  gl_FragColor = vec4(c, 1.);',
      '}'
    ].join('\n');
    var sh = function (type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) gl = null;
  }

  if (gl) {
    canvas.classList.add('gl');
    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var U = {};
    ['uA','uB','uP','uT','uR'].forEach(function (k) { U[k] = gl.getUniformLocation(prog, k); });
    gl.uniform1i(U.uA, 0); gl.uniform1i(U.uB, 1);

    var tex = {}, dead = false;
    NAMES.forEach(function (k) {
      var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([6,6,8,255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      tex[k] = t;
      var img = new Image();
      img.onload = function () {
        if (dead) return;
        try {
          gl.bindTexture(gl.TEXTURE_2D, t);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        } catch (err) {
          // opened straight from disk (file://): browsers block images in WebGL, so fall back to plain CSS
          dead = true;
          var still = document.createElement('div');
          still.id = 'bg'; still.setAttribute('aria-hidden', 'true');
          canvas.parentNode.replaceChild(still, canvas);
          canvas = still;
          show = cssShow;
          cssShow(next);
        }
      };
      img.src = 'assets/img/' + k + '.jpg';
    });

    var cur = 'avatar', next = 'avatar', p = 1, pStart = 0, DUR = reduce ? 1 : 1700;
    show = function (key, label) {
      setNow(key, label);
      if (key === next) return;
      if (p < 1) cur = next;
      next = key; pStart = performance.now(); p = 0;
    };

    var size = function () {
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5) * 0.8;
      var w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(U.uR, w, h);
    };
    var t0 = performance.now();
    var frame = function (now) {
      if (dead) return;
      size();
      if (p < 1) { p = Math.min(1, (now - pStart) / DUR); if (p >= 1) cur = next; }
      var e = p < .5 ? 2*p*p : 1 - Math.pow(-2*p + 2, 2) / 2;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex[p >= 1 ? next : cur]);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex[next]);
      gl.uniform1f(U.uP, p >= 1 ? 0 : e);
      gl.uniform1f(U.uT, reduce ? 12 : (now - t0) / 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /* hovered / centred track drives the background */
  var rows = Array.prototype.slice.call(document.querySelectorAll('.row'));
  var hovering = false, active = null;
  function activate(row) {
    if (active === row) return;
    rows.forEach(function (r) { r.classList.toggle('on', r === row); });
    active = row;
    if (row) show(row.getAttribute('data-img'), row.getAttribute('data-name'));
  }
  rows.forEach(function (r) {
    r.addEventListener('mouseenter', function () { hovering = true; activate(r); });
    r.addEventListener('focus', function () { activate(r); });
    r.addEventListener('mouseleave', function () { hovering = false; });
  });

  var coarse = window.matchMedia && window.matchMedia('(hover: none)').matches;
  if (coarse && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) { if (en.isIntersecting) activate(en.target); });
    }, { rootMargin: '-45% 0px -45% 0px' });
    rows.forEach(function (r) { io.observe(r); });
  }

  /* idle drift through the covers */
  var cycle = ['avatar', 'nohand2hold', 'deathalliwant', 'mylittlesoldier', 'bubbles'], ci = 0;
  if (!reduce) {
    setInterval(function () {
      if (hovering || document.hidden) return;
      if (active && coarse) return;
      ci = (ci + 1) % cycle.length;
      rows.forEach(function (r) { r.classList.remove('on'); });
      active = null;
      show(cycle[ci]);
    }, 7000);
  }
})();
