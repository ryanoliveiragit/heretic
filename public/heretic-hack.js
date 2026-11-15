/* Heretic — tema hacker: sequência de boot digitada acima do título e a resposta da prévia do app se descriptografando.
   prefers-reduced-motion mostra o texto pronto. A página remonta elementos; observa e reinicia. */
(function () {
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var LINES = [
    '<b>root@heretic</b>:~$ ./jailbreak  [<b>ok</b>]'
  ];
  function plain(h) { return h.replace(/<[^>]+>/g, ''); }
  function partial(h, n) { // primeiros n caracteres visíveis, mantendo as tags
    var out = '', seen = 0, i = 0;
    while (i < h.length && seen < n) {
      if (h[i] === '<') { var j = h.indexOf('>', i); out += h.slice(i, j + 1); i = j + 1; continue; }
      out += h[i++]; seen++;
    }
    var open = (out.match(/<(b|i)>/g) || []).length - (out.match(/<\/(b|i)>/g) || []).length;
    if (open > 0) out += out.lastIndexOf('<b>') > out.lastIndexOf('<i>') ? '</b>' : '</i>';
    return out;
  }
  function run(el) {
    if (el._hx) return; el._hx = true;
    if (reduced) { el.innerHTML = LINES.join('\n'); return; }
    var li = 0, n = 0;
    (function tick() {
      if (!el.isConnected) return;
      var done = LINES.slice(0, li).join('\n'), cur = LINES[li];
      if (!cur) { el.innerHTML = done; return; }
      n += 1;
      el.innerHTML = (done ? done + '\n' : '') + partial(cur, n) + '<b>▌</b>';
      if (n >= plain(cur).length) { li++; n = 0; setTimeout(tick, 260); } else setTimeout(tick, li === 0 ? 34 : 14);
    })();
  }
  // prévia do app: a resposta se "descriptografa" da esquerda para a direita quando entra na tela
  var GL = '█▓▒░#%&@$*+=?/<>01';
  function decrypt(el) {
    if (el._hx) return; el._hx = true;
    var full = el.textContent;
    if (reduced || !('IntersectionObserver' in window)) return;
    var busy = false;
    function play() {
      if (busy) return; busy = true;
      var t0 = performance.now(), dur = 1800;
      (function step(now) {
        var q = Math.min(1, (now - t0) / dur), done = Math.floor(full.length * q), out = full.slice(0, done);
        for (var i = done; i < full.length; i++) out += full[i] === ' ' ? ' ' : GL[(Math.random() * GL.length) | 0];
        el.textContent = q >= 1 ? full : out;
        if (q < 1 && el.isConnected) requestAnimationFrame(step); else busy = false;
      })(t0);
    }
    new IntersectionObserver(function (es) { if (es[0].isIntersecting) play(); }, { threshold: .6 }).observe(el);
  }
  function scan() { document.querySelectorAll('[data-boot]').forEach(run); document.querySelectorAll('[data-preview-answer]').forEach(decrypt); }
  var pend = 0;
  new MutationObserver(function () { if (!pend) pend = requestAnimationFrame(function () { pend = 0; scan(); }); }).observe(document.documentElement, { childList: true, subtree: true });
  scan();
})();
