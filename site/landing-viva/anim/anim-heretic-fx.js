/* Cópia para a "Heretic - Landing Viva". Mudança em relação ao original em uploads/: trava para não rodar duas vezes; só o efeito de descriptografar, nos h2 e em [data-fx-decrypt]. Ficaram de fora os rótulos de terminal, o cursor piscando depois dos títulos, o embaralhar dos botões no hover e a marca d'água. */
/* Heretic FX — terminal feel for the landing pages (desktop + mobile).
   1) Decrypt: section titles, captions and marked text scramble into place when they enter the screen;
      nav links and buttons re-scramble briefly on hover.
   2) Terminal kickers: a small animated command line above each section title
      (braille spinner → [ok]), plus a blinking block cursor after titles.
   Respects prefers-reduced-motion. No dependencies. */
(function () {
  if (window.__hxFx) return; window.__hxFx = 1; // roda uma vez só por página
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
    root.querySelectorAll('h2, [data-fx-decrypt]').forEach(function (el) {
      if (el._fxSeen || el.closest('[data-flow]') || el.closest('h1')) return;
      el._fxSeen = true; if (io) io.observe(el);
    });
  }

    function run() { try { wireDecrypt(document.body); } catch (e) { console.error('heretic-fx', e); } }
  var mo = new MutationObserver(function () { clearTimeout(mo._t); mo._t = setTimeout(run, 120); });
  function boot() { run(); mo.observe(document.body, { childList: true, subtree: true }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
