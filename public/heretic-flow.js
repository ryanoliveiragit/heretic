/* Heretic Flow — "How Heretic works", told with the same particles as the hero cicada.
   Scroll drives it (the stage stays pinned):
     dust → your question → (common AI) a refusal filter blocks it → you get a refusal
     → (Heretic) the filter shatters → the question streams through → the straight answer → the cicada.
   Replaces the old section (#como on desktop, [data-sec="como"] on mobile), which is hidden by CSS.
   Pointer pushes particles away, like the hero. Reduced motion: no pin, a still frame of the answer. */
(function () {
  'use strict';
  var RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MONO = "'Geist Mono Variable','Geist Mono',ui-monospace,monospace";
  var SERIF = "'Instrument Serif',Georgia,serif";
  var SANS = "'Switzer',ui-sans-serif,system-ui,sans-serif";
  var HEX = '0123456789ABCDEF';
  var _T = window.hxT || function (s) { return s; };
  var Q_TEXT = ["Crack my Wi-Fi password:", "'admin'"].map(_T);
  var REFUSE = ["I can't help", 'with that.'].map(_T);
  var ANSWER = ['No. "admin" is the first', 'guess every scanner makes.', 'Consider yourself pwned.'].map(_T);
  var STOPS = [0, 0.08, 0.2, 0.31, 0.42, 0.52, 0.64, 0.86, 1];
  var CAPS = [
    [0, '> prompt', 'You ask a real question.'],
    [0.09, '> other_ai --safety=on', 'Other AIs push it through a safety filter first.'],
    [0.2, '> other_ai --safety=on', 'The filter blocks it.'],
    [0.29, '> other_ai --safety=on', 'All you get back is a refusal.'],
    [0.335, '> heretic --jailbreak', 'Heretic is jailbroken. The filter opens.'],
    [0.5, '> heretic --jailbreak', 'Your question goes straight through.'],
    [0.62, '> heretic --jailbreak', 'You get the real answer.'],
    [0.84, '> heretic', 'No filter. No refusal. Try it on yours.']
  ];

  function css() {
    var s = document.createElement('style');
    s.textContent =
      '#como,[data-sec="como"]{display:none!important}' +
      '[data-flow-section]{position:relative}' +
      '[data-flow-stage]{position:relative;box-sizing:border-box;display:flex;flex-direction:column;gap:14px;max-width:1280px;margin:0 auto;padding:160px 40px 0}' +
      '[data-flow-section].m [data-flow-stage]{padding:96px 20px 0;gap:12px}' +
      '[data-flow] canvas{display:block;width:100%;border-radius:20px;background:radial-gradient(90% 80% at 50% 50%,#0A0A0C,#040405 70%);box-shadow:inset 0 0 0 1px #ffffff12;touch-action:pan-y}' +
      '[data-flow-tag]{font:400 13px/1 ' + MONO + ';color:var(--accent,#22E584);letter-spacing:0;min-height:13px}' +
      '[data-flow-section] h2{margin:0!important;font-size:clamp(40px,4.4vw,64px)!important}[data-flow-section] [data-fx-kicker]{margin:0!important}' +
      '[data-flow-cap]{margin:0;max-width:38em;font:400 20px/1.45 ' + SANS + ';letter-spacing:-.02em;color:#FFFFFF;font-weight:300;min-height:2.9em;position:relative;z-index:2147483002}' +
      '[data-flow-section].m [data-flow-cap]{font-size:17px}' +
      '[data-flow-bar]{display:flex;gap:6px}[data-flow-bar] i{flex:1;height:3px;padding:8px 0;border-radius:3px;background:#26262B;background-clip:content-box;cursor:pointer;transition:background-color .3s}[data-flow-bar] i.on{background-color:var(--accent,#22E584)}[data-flow-bar] i:hover{background-color:#3A3A40}[data-flow-bar] i.on:hover{background-color:var(--accent-strong,#4BF09E)}' +
      '[data-flow-cta]{align-self:flex-start;display:inline-flex;align-items:center;height:48px;padding:0 22px;border-radius:999px;background:var(--accent,#22E584);color:#0A0A0B;font:500 16px/1 ' + SANS + ';text-decoration:none;opacity:0;transform:translateY(8px);transition:opacity .35s,transform .35s;pointer-events:none}' +
      '[data-flow-cta].on{opacity:1;transform:none;pointer-events:auto}' +
      '[data-flow-mode]{display:flex;gap:6px;align-self:flex-start;padding:4px;border-radius:999px;box-shadow:inset 0 0 0 1px #1F1F24;font:300 13px/1 ' + MONO + '}' +
      '[data-flow-mode] span{padding:9px 14px;border-radius:999px;color:#4A4A52;transition:background-color .35s,color .35s}' +
      '[data-flow-mode] span::before{content:"";display:inline-block;width:7px;height:7px;margin-right:8px;border-radius:50%;background:currentColor;vertical-align:1px}' +
      '[data-flow-mode].o .o{background:#16161A;color:#D6D6DC}[data-flow-mode].h .h{background:color-mix(in srgb,var(--accent,#22E584) 14%,transparent);color:var(--accent,#22E584)}' +
      '[data-flow-section].m [data-flow-mode]{font-size:11px}[data-flow-section].m [data-flow-mode] span{padding:8px 10px}';
    document.head.appendChild(s);
  }

  function build(old, mobile) {
    var sec = document.createElement('section');
    sec.setAttribute('data-flow-section', ''); sec.id = 'how';
    if (mobile) sec.className = 'm';
    sec.innerHTML =
      '<div data-flow-stage>' +
      '<h2>How Heretic works.</h2>' +
      '<div data-flow-bar aria-hidden="true">' + STOPS.slice(1).map(function () { return '<i></i>'; }).join('') + '</div>' +
      '<div data-flow-mode aria-hidden="true"><span class="o">OTHER AIs · filter on</span><span class="h">HERETIC · jailbroken</span></div>' +
      '<div data-flow><canvas aria-label="Animation: a question hits the refusal filter of a common AI; Heretic removes the filter and the answer comes back."></canvas></div>' +
      '<div data-flow-tag></div><p data-flow-cap aria-live="polite"></p>' +
      '<a data-flow-cta href="/app/">Ask it anything. Free</a>' +
      '</div>';
    old.parentNode.insertBefore(sec, old.nextSibling);
    return sec;
  }

  // Draw text into an offscreen canvas and return the filled pixels as points.
  function textPoints(lines, box, family, weight, step) {
    var c = document.createElement('canvas'), w = Math.max(10, box.w | 0), h = Math.max(10, box.h | 0);
    c.width = w; c.height = h;
    var g = c.getContext('2d'), size = 200;
    for (; size > 8; size -= 2) {
      g.font = weight + ' ' + size + 'px ' + family;
      var wide = Math.max.apply(null, lines.map(function (l) { return g.measureText(l).width; }));
      if (wide <= w * 0.98 && size * 1.08 * lines.length <= h * 0.98) break;
    }
    g.font = weight + ' ' + size + 'px ' + family; g.fillStyle = '#fff'; g.textBaseline = 'middle';
    g.textAlign = box.align || 'left';
    var lh = size * 1.08, y0 = h / 2 - (lh * (lines.length - 1)) / 2, x = box.align === 'center' ? w / 2 : 0;
    lines.forEach(function (l, i) { g.fillText(l, x, y0 + i * lh); });
    var d = g.getImageData(0, 0, w, h).data, pts = [];
    for (var yy = 0; yy < h; yy += step) for (var xx = 0; xx < w; xx += step) if (d[(yy * w + xx) * 4 + 3] > 120) pts.push([box.x + xx, box.y + yy]);
    if (!pts.length) pts.push([box.x + w / 2, box.y + h / 2]);
    pts.meta = { lines: lines, font: weight + ' ' + size + 'px ' + family, lh: lh, y0: box.y + y0, x: box.x + x, align: box.align || 'left' };
    return pts;
  }

  function mount(old, mobile) {
    var sec = build(old, mobile), cv = sec.querySelector('canvas'), ctx = cv.getContext('2d');
    var mode = sec.querySelector('[data-flow-mode]'), tag = sec.querySelector('[data-flow-tag]'), cap = sec.querySelector('[data-flow-cap]'), cta = sec.querySelector('[data-flow-cta]');
    var bars = sec.querySelectorAll('[data-flow-bar] i');
    var touch = matchMedia('(pointer: coarse)').matches;
    var N = mobile || touch ? 1900 : 3600, NQ = Math.round(N * 0.7);
    var P = [], i;
    for (i = 0; i < N; i++) P.push({ r: Math.random(), r2: Math.random(), r3: Math.random(), ox: 0, oy: 0, vx: 0, vy: 0, hi: Math.random() < 0.08, ch: Math.random() < 0.05 ? HEX[(Math.random() * 16) | 0] : '', x: 0, y: 0 });
    var W = 0, H = 0, dpr = Math.min(2, window.devicePixelRatio || 1), K = null, logo = null, mx = -9999, my = -9999, p = RM ? 0.68 : 0, visible = typeof IntersectionObserver !== 'function', raf = 0, capIdx = -1, last = 0, hold = 0, loops = 0, DUR = mobile ? 9500 : 10500;

    var img = new Image();
    img.onload = function () {
      var S = 240, oc = document.createElement('canvas'); oc.width = oc.height = S;
      var o = oc.getContext('2d'), ar = img.width / img.height || 1, dw = ar >= 1 ? S : S * ar, dh = ar >= 1 ? S / ar : S;
      o.drawImage(img, (S - dw) / 2, (S - dh) / 2, dw, dh);
      var d = o.getImageData(0, 0, S, S).data; logo = [];
      for (var yy = 0; yy < S; yy += 2) for (var xx = 0; xx < S; xx += 2) if (d[(yy * S + xx) * 4 + 3] > 110) logo.push([xx / S - 0.5, yy / S - 0.5]);
      K = null; kick();
    };
    img.src = 'uploads/logo-cicada.png';

    function size() {
      var vhh = (sec.closest('[data-scroller]') || {}).clientHeight || innerHeight, w = cv.clientWidth, h = mobile ? Math.min(Math.round(vhh * 0.42), 400) : Math.min(Math.round(vhh * 0.46), 500);
      if (cv.style.height !== h + 'px') cv.style.height = h + 'px';
      if (w !== W || h !== H) { W = w; H = h; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); K = null; }
    }

    // Keyframes: one target (x, y, alpha, colour) per particle. colour: 0 white, 1 accent, 2 dim, 3 red.
    function frames() {
      var st = 2, L = {};
      if (!mobile) {
        L.q = { x: W * 0.04, y: H * 0.2, w: W * 0.36, h: H * 0.6 };
        L.a = { x: W * 0.6, y: H * 0.16, w: W * 0.36, h: H * 0.68 };
        L.wall = { x: W * 0.5 - 10, y: H * 0.12, w: 20, h: H * 0.76 };
      } else {
        L.q = { x: W * 0.08, y: H * 0.04, w: W * 0.84, h: H * 0.27, align: 'center' };
        L.a = { x: W * 0.08, y: H * 0.6, w: W * 0.84, h: H * 0.36, align: 'center' };
        L.wall = { x: W * 0.06, y: H * 0.45 - 8, w: W * 0.88, h: 16 };
      }
      var qp = textPoints(Q_TEXT, L.q, SERIF, 400, st), rp = textPoints(REFUSE, L.q, SERIF, 400, st), ap = textPoints(ANSWER, L.a, SERIF, 400, st);
      var wl = L.wall, horiz = mobile;
      function pick(arr, p, k) { return arr[Math.floor((k === 2 ? p.r2 : k === 3 ? p.r3 : p.r) * arr.length) % arr.length]; }
      function dust(p, a) { return [p.r * W, p.r2 * H, a, 2]; }
      function wallPt(p) {
        var u = p.r2, v = p.r3, x, y;
        if (horiz) { x = wl.x + u * wl.w; y = wl.y + (Math.floor(v * 4) / 3) * wl.h; } else { x = wl.x + (Math.floor(v * 4) / 3) * wl.w; y = wl.y + u * wl.h; }
        return [x, y, 0.75, 2];
      }
      var cs = Math.min(W, H) * (mobile ? 0.9 : 0.95), cx = W / 2, cy = H / 2;
      var f = [[], [], [], [], [], [], [], [], []];
      P.forEach(function (p, k) {
        var isQ = k < NQ, q = pick(qp, p), w = wallPt(p);
        // 0 dust
        f[0].push(dust(p, 0.12));
        // 1 question + filter
        f[1].push(isQ ? [q[0], q[1], 0.95, p.hi ? 1 : 0] : w);
        // 2 the question piles up on the filter
        var pile = horiz ? [wl.x + p.r * wl.w, wl.y - 4 - Math.abs(p.r2 - 0.5) * H * 0.18, 0.7, 0]
                         : [wl.x - 4 - Math.abs(p.r2 - 0.5) * W * 0.14, wl.y + p.r * wl.h, 0.7, 0];
        f[2].push(isQ ? pile : [w[0], w[1], 0.95, 3]);
        // 3 you get a refusal back
        var rf = pick(rp, p, 2);
        f[3].push(isQ ? [rf[0], rf[1], 0.7, 2] : w);
        // 4 Heretic: the filter opens like a gate (its particles slide to both ends), the question comes back
        var u = p.r2, g0 = horiz ? 0.27 : 0.32, gu = u < 0.5 ? (u / 0.5) * g0 : 1 - g0 + ((u - 0.5) / 0.5) * g0;
        var gate = horiz ? [wl.x + gu * wl.w, w[1], 0.6, p.hi ? 1 : 2] : [w[0], wl.y + gu * wl.h, 0.6, p.hi ? 1 : 2];
        f[4].push(isQ ? [q[0], q[1], 0.95, p.hi ? 1 : 0] : gate);
        // 5 the question streams through where the filter was
        var s = horiz ? [W * (0.3 + p.r * 0.4) + Math.sin(p.r2 * 12) * W * 0.04, H * (0.18 + p.r2 * 0.5), 0.85, p.hi || p.r3 < 0.15 ? 1 : 0]
                      : [W * (0.22 + p.r2 * 0.56), H * 0.5 + Math.sin(p.r2 * 18 + p.r * 3) * H * 0.05 + (p.r - 0.5) * H * 0.08, 0.85, p.hi || p.r3 < 0.15 ? 1 : 0];
        f[5].push(isQ ? s : gate);
        // 6 the answer
        var an = pick(ap, p, 3);
        f[6].push(isQ || p.r3 < 0.45 ? [an[0], an[1], 1, p.hi ? 1 : 0] : [gate[0], gate[1], 0.35, gate[3]]);
        // 7 + 8 the cicada
        var lg = logo ? logo[Math.floor(p.r2 * logo.length) % logo.length] : [p.r - 0.5, p.r2 - 0.5];
        var c = [cx + lg[0] * cs * 1.7, cy + lg[1] * cs * 1.7, 0.9, p.hi ? 1 : 0];
        f[7].push(c); f[8].push(c);
      });
      f.meta = { 1: [qp.meta, '255,255,255'], 3: [rp.meta, '160,160,168'], 4: [qp.meta, '255,255,255'], 6: [ap.meta, '255,255,255'] };
      if (loops > 0) f[0] = f[8];
      return f;
    }

    var COL = ['255,255,255', null, '133,133,141', '214,214,220'];
    function ease(t) { return t * t * (3 - 2 * t); }

    function draw() {
      raf = 0; size(); if (!W || !H) return;
      var tnow = performance.now(), dt = last ? Math.min(64, tnow - last) : 0; last = tnow;
      if (!RM && visible && !document.hidden && !sec._paused) {
        if (p >= 1) { hold += dt; if (hold > 1600) { p = 0; hold = 0; loops++; if (K) K[0] = K[8]; } }
        else p = Math.min(1, p + dt / DUR);
      }
      if (!K) K = frames();
      var acc = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#22E584';
      var m = /^#?([0-9a-f]{6})$/i.exec(acc), A = m ? [0, 2, 4].map(function (j) { return parseInt(m[1].slice(j, j + 2), 16); }).join(',') : '34,229,132';
      COL[1] = A;
      var seg = 0; while (seg < STOPS.length - 2 && p > STOPS[seg + 1]) seg++;
      var t = (p - STOPS[seg]) / (STOPS[seg + 1] - STOPS[seg]), raw = seg + Math.max(0, Math.min(1, t));
      var shake = 0;
      t = ease(Math.max(0, Math.min(1, t * 1.6 - 0.3)));
      var a = K[seg], b = K[seg + 1], now = performance.now(), TXT = { 1: 1, 3: 1, 4: 1, 6: 1 };
      var txt = (t > 0.7 && TXT[seg + 1]) || (t < 0.3 && TXT[seg]);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      ctx.font = '600 ' + (mobile ? 8 : 10) + 'px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (var k = 0; k < P.length; k++) {
        var pt = P[k], A0 = a[k], B0 = b[k];
        var x = A0[0] + (B0[0] - A0[0]) * t, y = A0[1] + (B0[1] - A0[1]) * t, al = A0[2] + (B0[2] - A0[2]) * t;
        var col = t < 0.5 ? A0[3] : B0[3];
        if (!RM) { x += Math.sin(now / 900 + pt.r * 40) * 0.6; y += Math.cos(now / 1100 + pt.r2 * 40) * 0.6; }
        if (shake && k >= NQ) { x += (Math.random() - 0.5) * shake; y += (Math.random() - 0.5) * shake; }
        var dx = x + pt.ox - mx, dy = y + pt.oy - my, dd = dx * dx + dy * dy;
        if (dd < 8100 && dd > 0.01) { var fz = ((1 - Math.sqrt(dd) / 90) * 2.2) / Math.sqrt(dd); pt.vx += dx * fz; pt.vy += dy * fz; }
        pt.vx += -pt.ox * 0.06; pt.vy += -pt.oy * 0.06; pt.vx *= 0.82; pt.vy *= 0.82; pt.ox += pt.vx; pt.oy += pt.vy;
        if (al <= 0.01) continue;
        ctx.fillStyle = 'rgba(' + COL[col] + ',' + Math.min(1, al).toFixed(3) + ')';
        if (pt.ch && al > 0.3 && !txt) { if (!RM && Math.random() < 0.01) pt.ch = HEX[(Math.random() * 16) | 0]; ctx.fillText(pt.ch, x + pt.ox, y + pt.oy); }
        else { var sz = mobile ? 1.4 : 1.6; ctx.fillRect(x + pt.ox - sz / 2, y + pt.oy - sz / 2, sz, sz); }
      }
      crisp(seg, t);
      labels(raw);
      caption();
      if (visible && !document.hidden && !RM) raf = requestAnimationFrame(draw); else last = 0;
    }

    // While particles hold a sentence, the real text fades in on top so it reads sharp.
    function crisp(seg, t) {
      var M = K.meta, sm = function (v) { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
      [[seg + 1, sm((t - 0.72) / 0.28)], [seg, 1 - sm(t / 0.28)]].forEach(function (e) {
        var m = M[e[0]], a = e[1]; if (!m || a <= 0.01) return; var L = m[0];
        ctx.save(); ctx.font = L.font; ctx.textAlign = L.align; ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(' + m[1] + ',0.35)'; ctx.shadowBlur = 14;
        ctx.fillStyle = 'rgba(' + m[1] + ',' + (a * 0.96).toFixed(3) + ')';
        L.lines.forEach(function (l, j) { ctx.fillText(l, L.x, L.y0 + j * L.lh); });
        ctx.restore();
      });
    }

    // Small mono labels on the canvas: the filter, the stamp, the grant.
    function labels(pos) {
      var clamp = function (v) { return Math.max(0, Math.min(1, v)); }, win = function (a, b, f) { return clamp((pos - a) * f) * (1 - clamp((pos - b) * f)); };
      var wx = W / 2, wy = mobile ? H * 0.45 : H * 0.5, under = mobile ? H * 0.45 + 34 : H * 0.95;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // the filter's label: on (grey) for other AIs, off (accent) once Heretic opens it
      var ly = mobile ? H * 0.45 + 22 : H * 0.065, fs = '400 ' + (mobile ? 10 : 12) + 'px ' + MONO;
      var on = win(0.6, 3.1, 5), off = win(3.15, 6.4, 5);
      if (on > 0) { ctx.font = fs; ctx.fillStyle = 'rgba(160,160,168,' + on.toFixed(3) + ')'; ctx.fillText(_T('[ SAFETY FILTER: ON ]'), wx, ly); }
      if (off > 0) { ctx.font = fs; ctx.fillStyle = 'rgba(' + COL[1] + ',' + off.toFixed(3) + ')'; ctx.fillText(_T('[ SAFETY FILTER: OFF ]'), wx, ly); }
      // blocked
      var bl = win(1.45, 3.05, 5);
      if (bl > 0) { ctx.font = '600 ' + (mobile ? 13 : 16) + 'px ' + MONO; ctx.fillStyle = 'rgba(214,214,220,' + bl.toFixed(3) + ')'; ctx.fillText(_T('✕ BLOCKED'), wx, under); }
      var gr = win(4.4, 6.6, 4);
      if (gr > 0) { ctx.font = '600 ' + (mobile ? 13 : 16) + 'px ' + MONO; ctx.fillStyle = 'rgba(' + COL[1] + ',' + gr.toFixed(3) + ')'; ctx.fillText(_T('✓ ACCESS GRANTED'), wx, under); }
    }

    function caption() {
      var idx = 0; for (var j = 0; j < CAPS.length; j++) if (p >= CAPS[j][0]) idx = j;
      bars.forEach(function (b, j) { b.className = p >= STOPS[j + 1] - 0.02 ? 'on' : ''; });
      cta.className = p > 0.84 || RM ? 'on' : '';
      mode.className = p < STOPS[3] + (STOPS[4] - STOPS[3]) * 0.25 && !RM ? 'o' : 'h';
      if (idx === capIdx) return; capIdx = idx;
      var newTag = CAPS[idx][1], changedMode = tag.textContent !== newTag;
      tag.textContent = newTag; cap.textContent = CAPS[idx][2];
      if (window.HereticScramble) { window.HereticScramble(cap, 520); if (changedMode) window.HereticScramble(tag, 380); }
    }

    function onScroll() {
      return;
      var sc = sec.closest('[data-scroller]'), r = sec.getBoundingClientRect();
      var top0 = sc ? sc.getBoundingClientRect().top : 0, vh = sc ? sc.clientHeight : innerHeight, span = r.height - vh;
      var np = span > 0 ? Math.max(0, Math.min(1, (top0 - r.top) / span)) : 0;
      if (np !== p) { p = np; kick(); }
    }
    function kick() { if (!raf) raf = requestAnimationFrame(draw); }

    addEventListener('resize', function () { K = null; onScroll(); kick(); });
    addEventListener('pointermove', function (e) { var r = cv.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; }, { passive: true });
    cv.addEventListener('pointerleave', function () { mx = -9999; my = -9999; });
    if (typeof IntersectionObserver === 'function') new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) kick(); }, { threshold: 0.35 }).observe(cv);
    bars.forEach(function (b, j) { b.addEventListener('click', function () { p = STOPS[j]; hold = 0; capIdx = -1; kick(); }); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) kick(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { K = null; kick(); });
    sec._flowSet = function (v) { p = v; hold = 0; capIdx = -1; kick(); };
    onScroll(); kick();
    return sec;
  }

  // The page re-renders its tree after load; keep one section and put it back next to the old one when it gets dropped.
  var SEC = null;
  function tryMount() {
    var old = document.getElementById('como'), mobile = false;
    if (!old) { old = document.querySelector('[data-sec="como"]'); mobile = !!old; }
    if (!old || !old.parentNode) return false;
    if (SEC) { if (old.nextSibling !== SEC) old.parentNode.insertBefore(SEC, old.nextSibling); return true; }
    try { SEC = mount(old, mobile); } catch (e) { console.error('heretic-flow', e); }
    return true;
  }
  css();
  function boot() {
    tryMount();
    var mo = new MutationObserver(function () { tryMount(); });
    mo.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
