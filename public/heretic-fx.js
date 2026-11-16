/* Heretic FX — terminal feel for the landing pages (desktop + mobile).
   1) Decrypt: section titles, captions and marked text scramble into place when they enter the screen;
      nav links and buttons re-scramble briefly on hover.
   2) Terminal kickers: a small animated command line above each section title
      (braille spinner → [ok]), plus a blinking block cursor after titles.
   Respects prefers-reduced-motion. No dependencies. */
(function () {
  'use strict';
  var RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var GLYPHS = '!<>-_\\/[]{}=+*^?#01ABCDEF$%&';
  var SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';

  // ---------- decrypt ----------
  function textNodes(el) {
    var out = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), n;
    while ((n = w.nextNode())) if (n.nodeValue && n.nodeValue.trim()) out.push(n);
    return out;
  }
  function scramble(el, dur) {
    if (RM || el._fxBusy) return;
    var nodes = textNodes(el); if (!nodes.length) return;
    el._fxBusy = true;
    var orig = nodes.map(function (n) { return n.nodeValue; });
    var total = orig.reduce(function (a, s) { return a + s.length; }, 0);
    var t0 = performance.now();
    function frame(t) {
      var k = Math.min(1, (t - t0) / dur), reveal = Math.floor(k * total), idx = 0;
      nodes.forEach(function (n, i) {
        var s = orig[i], o = '';
        for (var c = 0; c < s.length; c++, idx++) {
          var ch = s[c];
          o += (idx < reveal || ch === ' ' || ch === '\n') ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
        if (n.nodeValue !== o) n.nodeValue = o;
      });
      if (k < 1) requestAnimationFrame(frame);
      else { nodes.forEach(function (n, i) { n.nodeValue = orig[i]; }); el._fxBusy = false; }
    }
    requestAnimationFrame(frame);
  }
  window.HereticScramble = scramble;

  var io = typeof IntersectionObserver === 'function' ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      var len = (e.target.textContent || '').length;
      scramble(e.target, Math.min(1400, 380 + len * 22));
    });
  }, { threshold: 0.35 }) : null;

  function wireDecrypt(root) {
    root.querySelectorAll('h2, h3, [data-fx-decrypt], [data-cap] p, footer p').forEach(function (el) {
      if (el._fxSeen || el.closest('[data-flow]') || el.closest('h1')) return;
      el._fxSeen = true; if (io) io.observe(el);
    });
    root.querySelectorAll('nav a, header a, button, [data-orbit-use]').forEach(function (el) {
      if (el._fxHover) return; el._fxHover = true;
      el.addEventListener('pointerenter', function () {
        var len = (el.textContent || '').trim().length; if (len && len < 40) scramble(el, 260 + len * 12);
      });
    });
  }

  // ---------- terminal kickers ----------
  var CMD = {
    como: '$ heretic --explain', lanterna: '$ cat ./redacted.txt', especialistas: '$ ls ./agents',
    agentes: '$ ls ./agents', precos: '$ heretic --pricing', faq: '$ man heretic'
  };
  function kicker(sec, key) {
    var h = sec.querySelector('h2'); if (!h || sec.querySelector('[data-fx-kicker]')) return;
    var k = document.createElement('div');
    k.setAttribute('data-fx-kicker', ''); k.setAttribute('aria-hidden', 'true');
    k.innerHTML = '<span data-fx-spin>' + SPIN[0] + '</span> <span data-fx-cmd></span>';
    h.parentNode.insertBefore(k, h);
    var spin = k.querySelector('[data-fx-spin]'), cmd = k.querySelector('[data-fx-cmd]'), text = CMD[key] || '$ run';
    if (RM) { spin.textContent = '[ok]'; spin.className = 'ok'; cmd.textContent = text; return; }
    var started = false;
    var o = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting || started) return; started = true; o.disconnect();
      var i = 0, typed = 0, s = setInterval(function () {
        i++; spin.textContent = SPIN[i % SPIN.length];
        if (typed < text.length) { typed++; cmd.textContent = text.slice(0, typed); }
        else if (i > text.length + 10) { clearInterval(s); spin.textContent = '[ok]'; spin.className = 'ok'; }
      }, 55);
    }, { threshold: 0.5 });
    o.observe(k);
  }
  function wireKickers() {
    Object.keys(CMD).forEach(function (key) {
      var sec = document.getElementById(key) || document.querySelector('[data-sec="' + key + '"]');
      if (sec && getComputedStyle(sec).display !== 'none') kicker(sec, key);
    });
    var fl = document.querySelector('[data-flow-section]'); if (fl) kicker(fl, 'como');
  }

  var css = document.createElement('style');
  css.textContent =
    '[data-fx-kicker]{display:flex;align-items:center;gap:8px;margin:0 0 14px;font:400 13px/1 "Geist Mono Variable","Geist Mono",ui-monospace,monospace;color:#6E6E76;letter-spacing:0}' +
    '[data-fx-kicker] [data-fx-spin]{color:var(--accent,#F0335A);min-width:1.2em}' +
    '[data-fx-kicker] .ok{color:var(--accent,#F0335A)}' +
    '[data-fx-cmd]::after{content:"";display:inline-block;width:.55em;height:1.05em;margin-left:3px;vertical-align:-2px;background:var(--accent,#F0335A);animation:fxBlink 1s steps(1) infinite}' +
    'h2::after{content:"";display:inline-block;width:.08em;height:.78em;margin-left:.12em;vertical-align:-.04em;background:var(--accent,#F0335A);opacity:.85;animation:fxBlink 1.1s steps(1) infinite}' +
    '@keyframes fxBlink{50%{opacity:0}}' +
    '@media (prefers-reduced-motion: reduce){[data-fx-cmd]::after,h2::after{animation:none}}';
  document.head.appendChild(css);

  // Watermark: the cicada, very faint, fixed behind the whole page.
  function watermark() {
    if (document.querySelector('[data-watermark]')) return;
    var w = document.createElement('div'); w.setAttribute('data-watermark', ''); w.setAttribute('aria-hidden', 'true');
    document.body.appendChild(w);
  }
  css.textContent += '[data-watermark]{position:fixed;inset:0;z-index:2147482990;pointer-events:none;background:url(/icons/cicada.png) 50% 50%/min(105vw,1500px) auto no-repeat;opacity:.018;filter:grayscale(1) brightness(1.6)}' +
    '@media (max-width:820px){[data-watermark]{background-size:190vw auto;background-position:50% 55%;opacity:.022}}';
  function run() { try { watermark(); wireDecrypt(document.body); wireKickers(); } catch (e) { console.error('heretic-fx', e); } }
  var mo = new MutationObserver(function () { clearTimeout(mo._t); mo._t = setTimeout(run, 120); });
  function boot() { run(); mo.observe(document.body, { childList: true, subtree: true }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
