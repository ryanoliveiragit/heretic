/* Heretic Sections — hacker versions of two landing blocks (desktop + mobile):
   1) "Nothing redacted": a terminal that decrypts a redacted answer log on its own, line by line, in a loop.
      Hover or tap a line to decrypt it now. Replaces the pointer "lantern".
   2) Pricing: two plans as one terminal-style panel (mono labels, serif price, [+] list). Replaces the generic cards.
   The old blocks are hidden by CSS; the new ones are re-inserted if the page re-renders. Reduced motion: decrypted, still. */
(function () {
  'use strict';
  var RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MONO = "'Geist Mono Variable','Geist Mono',ui-monospace,monospace";
  var SERIF = "'Instrument Serif',Georgia,serif";
  var SANS = "'Switzer',ui-sans-serif,system-ui,sans-serif";
  var GLY = '█▓▒░#%&@$*+=<>/\\|{}[]01ABCDEF';
  var FACTS = (window.hxT ? function (a) { return a.map(window.hxT); } : function (a) { return a; })([
    'The first DDoS ever took down a six-person ISP, in 1996. It still works.',
    'One byte of DNS can bring back up to fifty bytes of attack traffic.',
    'Rubber-hose cryptanalysis is real: a boot, a keyboard, a witness.',
    'Half the web still runs the holes it shipped with.',
    '“pwned” was a 1989 typo in a video game. It named every hack since.',
    'Your “admin” password is guess number one on every scanner.'
  ]);

  var css = document.createElement('style');
  css.textContent =
    '[data-lantern]{display:none!important}' +
    '#precos>div[data-reveal],[data-sec="precos"]>div[data-reveal]{display:none!important}' +
    // decrypt terminal
    '[data-dec]{margin-top:48px;border-radius:16px;background:#08080A;box-shadow:inset 0 0 0 1px #1F1F24,0 40px 90px -50px #000;overflow:hidden;text-align:left}' +
    '[data-dec] .bar{display:flex;align-items:center;gap:8px;height:44px;padding:0 18px;border-bottom:1px solid #16161A;font:300 13px/1 ' + MONO + ';color:#6E6E76}' +
    '[data-dec] .bar i{width:10px;height:10px;border-radius:50%;background:#26262B}' +
    '[data-dec] .bar span{margin-left:10px}[data-dec] .bar b{margin-left:auto;font-weight:300;color:#85858D}[data-dec] .bar b.ok{color:var(--accent,#22E584)}' +
    '[data-dec] ol{list-style:none;margin:0;padding:22px 0}' +
    '[data-dec] li{display:grid;grid-template-columns:44px minmax(0,1fr) auto;align-items:baseline;gap:14px;padding:9px 22px;cursor:default;transition:background-color .2s}' +
    '[data-dec] li:hover{background:#ffffff05}' +
    '[data-dec] .n{font:300 13px/1.6 ' + MONO + ';color:#3A3A40;text-align:right}' +
    '[data-dec] .tx{font:300 17px/1.6 ' + MONO + ';letter-spacing:-.01em;color:#4A4A52;word-break:break-word;transition:color .3s}' +
    '[data-dec] li.on .tx{color:#F2F2F5}' +
    '[data-dec] .st{font:300 12px/1.6 ' + MONO + ';color:#4A4A52;white-space:nowrap}[data-dec] li.on .st{color:var(--accent,#22E584)}' +
    '[data-dec] .foot{display:flex;align-items:center;gap:18px;padding:14px 22px;border-top:1px solid #16161A;font:300 13px/1 ' + MONO + ';color:#6E6E76}' +
    '[data-dec] .prog b{font-weight:300;color:#8A8A93}' +
    '[data-dec] .cmd{margin-left:auto}[data-dec] .cmd::after{content:"";display:inline-block;width:.55em;height:1.05em;margin-left:4px;vertical-align:-2px;background:var(--accent,#22E584);animation:decBlink 1s steps(1) infinite}' +
    '@keyframes decBlink{50%{opacity:0}}' +
    '.m [data-dec],[data-sec] [data-dec]{margin-top:28px}' +
    '[data-sec] [data-dec] li{grid-template-columns:26px minmax(0,1fr);padding:8px 14px;gap:10px}[data-sec] [data-dec] .st{display:none}' +
    '[data-sec] [data-dec] .tx{font-size:14px}[data-sec] [data-dec] .bar span{display:none}[data-sec] [data-dec] .cmd{display:none}' +
    // plans
    '[data-plans]{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:56px;border-radius:18px;background:#08080A;box-shadow:inset 0 0 0 1px #1F1F24;overflow:hidden;text-align:left}' +
    '[data-plans] article{position:relative;display:flex;flex-direction:column;padding:36px 40px 40px}' +
    '[data-plans] article+article{box-shadow:inset 1px 0 0 #1F1F24}' +
    '[data-plans] article.hi::before{content:"";position:absolute;left:0;right:0;top:0;height:1px;background:linear-gradient(90deg,transparent,var(--accent,#22E584),transparent);opacity:.7}' +
    '[data-plans] header{display:flex;justify-content:space-between;font:300 13px/1 ' + MONO + ';color:#6E6E76}[data-plans] header b{font-weight:300;color:#85858D}[data-plans] .hi header b{color:var(--accent,#22E584)}' +
    '[data-plans] .price{margin-top:28px;font:400 96px/1 ' + SERIF + ';letter-spacing:-.03em;background:linear-gradient(180deg,#FFFFFF 15%,#A9A9B3);-webkit-background-clip:text;background-clip:text;color:transparent}' +
    '[data-plans] .price small{font-size:.5em}' +
    '[data-plans] .per{margin-top:12px;font:300 17px/1.5 ' + SANS + ';color:#9A9AA3}' +
    '[data-plans] ul{list-style:none;margin:28px 0 36px;padding:20px 0 0;border-top:1px dashed #1F1F24;display:grid;gap:12px;font:300 14px/1.4 ' + MONO + ';color:#C8C8CE}' +
    '[data-plans] li::before{content:"[+] ";color:var(--accent,#22E584)}' +
    '[data-plans] a{align-self:flex-start;margin-top:auto;display:inline-flex;align-items:center;gap:8px;height:48px;padding:0 22px;border-radius:999px;font:500 16px/1 ' + SANS + ';text-decoration:none;transition:transform .22s cubic-bezier(.34,1.56,.64,1),background-color .2s,box-shadow .2s}' +
    '[data-plans] a:hover{transform:translateY(-1px)}[data-plans] a:active{transform:scale(.96)}' +
    '[data-plans] a.pri{background:var(--accent,#22E584);color:#0A0A0B}[data-plans] a.sec{color:#F2F2F5;box-shadow:inset 0 0 0 1px #3A3A40}[data-plans] a.sec:hover{box-shadow:inset 0 0 0 1px #6E6E76}' +
    '[data-sec] [data-plans]{grid-template-columns:1fr;margin-top:28px}[data-sec] [data-plans] article{padding:26px 22px 26px}[data-sec] [data-plans] article+article{box-shadow:inset 0 1px 0 #1F1F24}' +
    '[data-sec] [data-plans] .price{font-size:72px}[data-sec] [data-plans] a{align-self:stretch;justify-content:center}';
  document.head.appendChild(css);

  // ---------- decrypt terminal ----------
  function cipher(s) { var o = ''; for (var i = 0; i < s.length; i++) o += s[i] === ' ' ? ' ' : GLY[(Math.random() * GLY.length) | 0]; return o; }
  function buildDec() {
    var el = document.createElement('div');
    el.setAttribute('data-dec', '');
    el.innerHTML =
      '<div class="bar"><i></i><i></i><i></i><span>~/answers/redacted.log</span><b data-st>AES-256 · locked</b></div>' +
      '<ol>' + FACTS.map(function (f, i) { return '<li><span class="n">' + String(i + 1).padStart(2, '0') + '</span><span class="tx"></span><span class="st">[locked]</span></li>'; }).join('') + '</ol>' +
      '<div class="foot"><span class="prog" data-prog></span><span class="cmd">cat redacted.log | heretic --decrypt</span></div>';
    var rows = [].slice.call(el.querySelectorAll('li')), st = el.querySelector('[data-st]'), prog = el.querySelector('[data-prog]');
    var state = FACTS.map(function () { return 0; }); // 0 locked, 1 decrypting, 2 plain
    rows.forEach(function (r, i) {
      var tx = r.querySelector('.tx'); tx.textContent = cipher(FACTS[i]); r.setAttribute('aria-label', FACTS[i]);
      r.addEventListener('pointerenter', function () { decrypt(i); });
      r.addEventListener('click', function () { decrypt(i); });
    });
    function done() { return state.filter(function (s) { return s === 2; }).length; }
    function status() {
      var d = done(), n = FACTS.length, w = 12, k = Math.round((d / n) * w);
      prog.innerHTML = '[<b>' + '█'.repeat(k) + '</b>' + '░'.repeat(w - k) + '] ' + d + '/' + n + ' decrypted';
      st.textContent = d === n ? 'plain text' : d ? 'decrypting · ' + d + '/' + n : 'AES-256 · locked';
      st.className = d === n ? 'ok' : '';
    }
    function decrypt(i) {
      if (state[i]) return; state[i] = 1;
      var r = rows[i], tx = r.querySelector('.tx'), s = FACTS[i], t0 = performance.now(), dur = RM ? 0 : 700 + s.length * 6;
      r.classList.add('on'); r.querySelector('.st').textContent = '[....]';
      (function step(t) {
        var k = dur ? Math.min(1, (t - t0) / dur) : 1, rev = Math.floor(k * s.length), o = '';
        for (var c = 0; c < s.length; c++) o += c < rev || s[c] === ' ' ? s[c] : GLY[(Math.random() * GLY.length) | 0];
        tx.textContent = o;
        if (k < 1) requestAnimationFrame(step); else { tx.textContent = s; state[i] = 2; r.querySelector('.st').textContent = '[ok]'; status(); }
      })(performance.now());
      status();
    }
    function lockAll() {
      rows.forEach(function (r, i) { state[i] = 0; r.classList.remove('on'); r.querySelector('.st').textContent = '[locked]'; r.querySelector('.tx').textContent = cipher(FACTS[i]); });
      status();
    }
    // Loop: one line every 1.5 s, hold the plain text, lock again, repeat. Only while on screen.
    var visible = false, timer = 0, shimmer = 0;
    function tick() {
      timer = 0; if (!visible) return;
      var next = state.indexOf(0);
      if (next >= 0) { decrypt(next); timer = setTimeout(tick, 1500); }
      else if (state.indexOf(1) >= 0) timer = setTimeout(tick, 300);
      else timer = setTimeout(function () { lockAll(); timer = setTimeout(tick, 900); }, 4200);
    }
    function shimmerOn() {
      if (shimmer || RM) return;
      shimmer = setInterval(function () {
        if (!visible) return;
        rows.forEach(function (r, i) {
          if (state[i]) return; var tx = r.querySelector('.tx'), a = tx.textContent.split('');
          for (var k = 0; k < Math.max(2, a.length / 10); k++) { var j = (Math.random() * a.length) | 0; if (a[j] !== ' ') a[j] = GLY[(Math.random() * GLY.length) | 0]; }
          tx.textContent = a.join('');
        });
      }, 110);
    }
    if (RM) { FACTS.forEach(function (f, i) { decrypt(i); }); }
    else if (typeof IntersectionObserver === 'function') {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) { shimmerOn(); if (!timer) timer = setTimeout(tick, 600); } }, { threshold: 0.3 }).observe(el);
    } else { visible = true; shimmerOn(); tick(); }
    status();
    return el;
  }

  // ---------- plans ----------
  function buildPlans() {
    var el = document.createElement('div');
    el.setAttribute('data-plans', '');
    el.innerHTML =
      '<article class="hi"><header><span>// free</span><b>[recommended]</b></header>' +
      '<div class="price">$0</div><div class="per">No account. No email. Start in one click.</div>' +
      '<ul><li>every agent</li><li>daily limit</li><li>uncensored answers</li></ul>' +
      '<a class="pri" href="/app/">Start free →</a></article>' +
      '<article><header><span>// credits</span><b>[pay as you go]</b></header>' +
      '<div class="price">Credits</div><div class="per">Buy only when the daily limit isn’t enough.</div>' +
      '<ul><li>no daily limit</li><li>images and voice</li><li>API access</li></ul>' +
      '<a class="sec" href="/app/">Get credits →</a></article>';
    return el;
  }

  // ---------- refused answers: "100" shakes, breaks into particles and re-forms as "0" ----------
  function buildZero(mobile) {
    var wrap = document.createElement('div');
    wrap.setAttribute('data-zero-fx', '');
    wrap.innerHTML = '<canvas role="img" aria-label="0"></canvas>';
    var cv = wrap.firstChild, ctx = cv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1);
    var W = mobile ? 300 : 560, H = mobile ? 190 : 260, N = mobile ? 1300 : 2400;
    cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv.width = W * dpr; cv.height = H * dpr;
    var FONT = "600 SIZEpx " + SANS, SZ = 0, A = null, B = null, P = [], t0 = -1, raf = 0, visible = false;
    function pts(txt) {
      var c = document.createElement('canvas'); c.width = W; c.height = H; var g = c.getContext('2d');
      if (!SZ) { for (SZ = H * 1.1; SZ > 20; SZ -= 4) { g.font = FONT.replace('SIZE', SZ); if (g.measureText('100').width <= W * 0.96) break; } }
      g.font = FONT.replace('SIZE', SZ); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(txt, W / 2, H / 2 + SZ * 0.04);
      var d = g.getImageData(0, 0, W, H).data, o = [];
      for (var y = 0; y < H; y += 2) for (var x = 0; x < W; x += 2) if (d[(y * W + x) * 4 + 3] > 120) o.push([x, y]);
      return o;
    }
    function init() {
      A = pts('100'); B = pts('0'); P = [];
      for (var i = 0; i < N; i++) {
        var a = A[(Math.random() * A.length) | 0], b = B[(Math.random() * B.length) | 0], ang = Math.random() * Math.PI * 2, sp = 0.4 + Math.random() * 1.1;
        P.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1], dx: Math.cos(ang) * sp * W * 0.55, dy: Math.sin(ang) * sp * H * 0.9, hi: Math.random() < 0.08 });
      }
    }
    var acc = '34,229,132';
    function sm(v) { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); }
    function crispText(txt, a) {
      if (a <= 0.01) return; ctx.save(); ctx.font = FONT.replace('SIZE', SZ); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var g = ctx.createLinearGradient(0, H * 0.1, 0, H * 0.9); g.addColorStop(0, 'rgba(255,255,255,' + a + ')'); g.addColorStop(1, 'rgba(185,185,194,' + a + ')');
      ctx.fillStyle = g; ctx.fillText(txt, W / 2, H / 2 + SZ * 0.04); ctx.restore();
    }
    function draw() {
      raf = 0; if (!A) { if (document.fonts && document.fonts.check && !document.fonts.check(FONT.replace('SIZE', 40))) { raf = requestAnimationFrame(draw); return; } init(); }
      var e = t0 < 0 || RM ? (RM ? 99 : 0) : (performance.now() - t0) / 1000; // seconds since the number came on screen
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      // timeline: 0-0.5 hold "100", 0.5-1.1 shake, 1.1-1.9 burst, 1.9-2.9 converge to "0", then hold
      var shake = e > 0.5 && e < 1.15 ? sm((e - 0.5) / 0.6) * (mobile ? 5 : 8) : 0;
      var burst = sm((e - 1.1) / 0.8), conv = sm((e - 1.9) / 1.0);
      crispText('100', e < 0.5 ? 1 : 1 - sm((e - 0.5) / 0.5));
      if (e > 0.45) {
        for (var i = 0; i < P.length; i++) {
          var p = P[i], x, y, al;
          var ex = p.ax + p.dx * burst, ey = p.ay + p.dy * burst;
          x = ex + (p.bx - ex) * conv; y = ey + (p.by - ey) * conv;
          if (shake) { x += (Math.random() - 0.5) * shake; y += (Math.random() - 0.5) * shake; }
          al = 0.9 - burst * 0.55 * (1 - conv) + conv * 0.1;
          ctx.fillStyle = 'rgba(' + (p.hi && burst > 0.2 ? acc : '230,230,236') + ',' + Math.min(1, al).toFixed(3) + ')';
          var s = mobile ? 1.4 : 1.7; ctx.fillRect(x - s / 2, y - s / 2, s, s);
        }
      }
      crispText('0', sm((e - 2.6) / 0.5));
      if (shake) { ctx.save(); ctx.font = '400 ' + (mobile ? 11 : 13) + 'px ' + MONO; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(' + acc + ',0.9)'; ctx.fillText('jailbreak --refusals=0', W / 2, H - 8); ctx.restore(); }
      wrap.setAttribute('data-zero-state', e > 2.6 ? '0' : '100'); cv.setAttribute('aria-label', e > 2.6 ? '0' : '100');
      if (visible && e < 3.2 && !RM) raf = requestAnimationFrame(draw);
    }
    if (typeof IntersectionObserver === 'function') {
      new IntersectionObserver(function (es) {
        var r = es[0].intersectionRatio;
        if (r >= 0.75) { visible = true; if (t0 < 0) t0 = performance.now(); if (!raf) raf = requestAnimationFrame(draw); }
        else if (r === 0) { visible = false; t0 = -1; if (!raf) raf = requestAnimationFrame(draw); }
      }, { threshold: [0, 0.75] }).observe(wrap);
    } else { visible = true; t0 = performance.now(); }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { A = null; SZ = 0; if (!raf) raf = requestAnimationFrame(draw); });
    raf = requestAnimationFrame(draw);
    return wrap;
  }
  css.textContent += '[data-zero-num]{display:none!important}[data-zero-fx]{display:flex;justify-content:center}[data-zero-fx] canvas{display:block;max-width:100%}';

  // Keep one instance of each, placed right after the hidden original; put back if the page re-renders.
  var DEC = null, PLANS = null, ZERO = null;
  function place() {
    var zn = document.querySelector('[data-zero-num]');
    if (zn && zn.parentNode) { if (!ZERO) ZERO = buildZero(!!zn.closest('[data-sec]')); if (zn.nextSibling !== ZERO) zn.parentNode.insertBefore(ZERO, zn.nextSibling); }
    var lan = document.querySelector('[data-lantern]');
    if (lan && lan.parentNode) { if (!DEC) DEC = buildDec(); if (lan.nextSibling !== DEC) lan.parentNode.insertBefore(DEC, lan.nextSibling); }
    var grid = document.querySelector('#precos>div[data-reveal]') || document.querySelector('[data-sec="precos"]>div[data-reveal]');
    if (grid && grid.parentNode) { if (!PLANS) PLANS = buildPlans(); if (grid.nextSibling !== PLANS) grid.parentNode.insertBefore(PLANS, grid.nextSibling); }
  }
  function boot() { place(); new MutationObserver(function () { place(); }).observe(document.body, { childList: true, subtree: true }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
