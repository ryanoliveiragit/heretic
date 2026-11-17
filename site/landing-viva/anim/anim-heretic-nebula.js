/* Cópia para a "Heretic - Landing Viva". Mudança em relação ao original em uploads/: trava para não rodar duas vezes; caminho do logo (/icons/cicada.png -> uploads/logo-cicada.png). */
/* Heretic — hero do tema hacker: a cigarra do logo feita de partículas (algumas viram caracteres hex),
   com poeira em volta. Começa como globo e se rearranja na cigarra quando o logo carrega.
   Balança sozinha; arrastar gira (com inércia); o ponteiro afasta as partículas, que voltam por mola;
   digitar na caixa de pergunta faz a cigarra pulsar. Branco, com ~7% em vermelho claro.
   Pausa fora da tela; prefers-reduced-motion desenha um quadro parado.
   Uso: <canvas data-nebula> dentro de um contêiner posicionado; o script acha sozinho. */
(function () {
  if (window.__hxNebula) return; window.__hxNebula = 1; // roda uma vez só por página
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function start(cv) {
    if (cv._hx) return; cv._hx = true;
    var ctx = cv.getContext('2d'), host = cv.parentElement;
    var touch = matchMedia('(pointer: coarse)').matches;
    var N = touch ? 1300 : 2600, DUST = touch ? 300 : 560;
    var pts = [], i;
    // globo: espiral de Fibonacci
    var ga = Math.PI * (3 - Math.sqrt(5));
    for (i = 0; i < N; i++) {
      var y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = ga * i;
      pts.push({ x: Math.cos(th) * r, y: y, z: Math.sin(th) * r, s: 1, ox: 0, oy: 0, vx: 0, vy: 0, b: .55 + Math.random() * .45, red: Math.random() < .07 });
    }
    // poeira: disco achatado e inclinado em volta do globo
    for (i = 0; i < DUST; i++) {
      var a = Math.random() * Math.PI * 2, d = 1.25 + Math.pow(Math.random(), .7) * .9, h = (Math.random() - .5) * .12;
      pts.push({ x: Math.cos(a) * d, y: h, z: Math.sin(a) * d, s: .7, ox: 0, oy: 0, vx: 0, vy: 0, b: .25 + Math.random() * .5, dust: 1 });
    }

    // alvo de cada ponto do globo: a cigarra, amostrada do próprio logo
    var HEX = '0123456789ABCDEF';
    pts.forEach(function (p, k) { if (!p.dust && Math.random() < .06) p.ch = HEX[(Math.random() * 16) | 0]; });
    var img = new Image();
    img.onload = function () {
      var S = 220, oc = document.createElement('canvas'); oc.width = oc.height = S;
      var octx = oc.getContext('2d'), ar = img.width / img.height || 1, dw = ar >= 1 ? S : S * ar, dh = ar >= 1 ? S / ar : S; octx.drawImage(img, (S - dw) / 2, (S - dh) / 2, dw, dh);
      var d = octx.getImageData(0, 0, S, S).data, cand = [];
      for (var yy = 0; yy < S; yy += 2) for (var xx = 0; xx < S; xx += 2) if (d[(yy * S + xx) * 4 + 3] > 120) cand.push([xx, yy, d[(yy * S + xx) * 4] > 200 && d[(yy * S + xx) * 4 + 1] < 170]);
      if (!cand.length) return;
      var globe = pts.filter(function (p) { return !p.dust; });
      globe.forEach(function (p, k) {
        var c = cand[(Math.random() * cand.length) | 0];
        p.tx = (c[0] / S - .5) * 2.6; p.ty = (c[1] / S - .5) * 2.6; p.tz = (Math.random() - .5) * .16;
        p.red = c[2] || Math.random() < .03; // olhos vermelhos do logo e poucos pontos soltos
      });
      morphT = 0; kick();
    };
    img.src = 'uploads/logo-cicada.png';
    var morphT = -1;

    var W = 0, H = 0, dpr = Math.min(2, window.devicePixelRatio || 1);
    function size() { var r = host.getBoundingClientRect(); W = Math.round(r.width); H = Math.round(r.height); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
    size(); addEventListener('resize', size);
    if ('ResizeObserver' in window) new ResizeObserver(function () { size(); kick(); }).observe(host);

    var yaw = 0, pitch = .08, vyaw = 0, t0 = performance.now(), vpitch = 0, drag = null, mx = -9999, my = -9999, pulse = 0, visible = true, raf = 0;

    function center() {
      // computador: à direita do título, como assinatura (estilo Linear); celular: atrás do título, discreta
      if (W >= 900) return { cx: Math.min(W * .76, W / 2 + 470), cy: 330, R: Math.min(W * .21, 310) };
      return { cx: W / 2, cy: 330, R: Math.min(W * .5, 210) };
    }

    // textos marcados com [data-nebula-text] ("linhas" = só as linhas de texto): ali as partículas ficam mais apagadas
    var tr = null, fc = 0;
    // pontos de destaque na cor principal da página (--accent), relida de tempos em tempos
    var acc = '255,255,255', ac2 = null;
    function readAccent() {
      var v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(); if (!v) return;
      ac2 = ac2 || document.createElement('canvas').getContext('2d');
      ac2.fillStyle = '#ffffff'; ac2.fillStyle = v;
      var m = /^#([0-9a-f]{6})$/i.exec(ac2.fillStyle);
      if (m) acc = [0, 2, 4].map(function (j) { return parseInt(m[1].slice(j, j + 2), 16); }).join(',');
    }
    function textRects() {
      var cr = cv.getBoundingClientRect(), out = [], rg = document.createRange();
      function add(r) { if (r.width > 0 && r.height > 0) out.push([r.left - cr.left, r.top - cr.top, r.right - cr.left, r.bottom - cr.top]); }
      host.querySelectorAll('[data-nebula-text]').forEach(function (el) {
        if (el.getAttribute('data-nebula-text') !== 'linhas') { add(el.getBoundingClientRect()); return; }
        var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), n;
        while ((n = w.nextNode())) { if (!n.nodeValue.trim()) continue; rg.selectNodeContents(n); var l = rg.getClientRects(); for (var q = 0; q < l.length; q++) add(l[q]); }
      });
      return out;
    }

    function frame() {
      raf = 0;
      // o renderizador da página às vezes zera os atributos do canvas: confere a cada quadro
      if (cv.width !== Math.round(W * dpr) || !W || cv.style.width !== W + 'px') size();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      ctx.font = '600 ' + (touch ? 8 : 10) + "px 'Geist Mono Variable',ui-monospace,monospace"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (!drag) {
        var sway = reduced ? 0 : Math.sin((performance.now() - t0) / 2600) * .55;
        yaw += vyaw; vyaw *= .95; yaw += (sway - yaw) * .015;
        pitch += vpitch; vpitch *= .94; pitch += (.08 - pitch) * .02;
      }
      // globo → cigarra (1,6 s) quando o logo termina de carregar
      if (morphT >= 0 && morphT < 1) { morphT = Math.min(1, morphT + (reduced ? 1 : .012)); var e = morphT * morphT * (3 - 2 * morphT);
        pts.forEach(function (p) { if (p.tx === undefined) return; if (p.gx === undefined) { p.gx = p.x; p.gy = p.y; p.gz = p.z; } p.x = p.gx + (p.tx - p.gx) * e; p.y = p.gy + (p.ty - p.gy) * e; p.z = p.gz + (p.tz - p.gz) * e; }); }
      pulse *= .93;
      var c = center(), R = c.R * (1 + pulse * .07), cy_ = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      if (!tr || !(fc++ % 8)) tr = textRects();
      if (fc % 30 === 1) readAccent();
      for (var k = 0; k < pts.length; k++) {
        var p = pts[k];
        var x1 = p.x * cy_ + p.z * sy, z1 = -p.x * sy + p.z * cy_;
        var y1 = p.y * cp - z1 * sp, z2 = p.y * sp + z1 * cp;
        var persp = 2.6 / (2.6 + z2), sx = c.cx + x1 * R * persp, syy = c.cy + y1 * R * persp;
        // ponteiro afasta, mola traz de volta
        var dx = sx + p.ox - mx, dy = syy + p.oy - my, dd = dx * dx + dy * dy, rad = 110;
        if (dd < rad * rad && dd > .01) { var f = (1 - Math.sqrt(dd) / rad) * 2.4 / Math.sqrt(dd); p.vx += dx * f; p.vy += dy * f; }
        p.vx += -p.ox * .06; p.vy += -p.oy * .06; p.vx *= .82; p.vy *= .82; p.ox += p.vx; p.oy += p.vy;
        var depth = (1 - z2) / 2; // 0 atrás, 1 na frente
        var al = (p.dust ? .2 : .3) + depth * (p.dust ? .4 : .7);
        al *= p.b * (1 + pulse * .8) * (W < 900 ? .55 : 1); // no celular fica atrás do texto: mais apagada
        if (tr.length) {
          var px = sx + p.ox, py = syy + p.oy, dm = 1e9;
          for (var q = 0; q < tr.length; q++) { var T = tr[q], ex = Math.max(T[0] - px, 0, px - T[2]), ey = Math.max(T[1] - py, 0, py - T[3]), e2 = ex * ex + ey * ey; if (e2 < dm) dm = e2; }
          if (dm < 2304) { var u = Math.sqrt(dm) / 48; al *= .16 + .84 * u * u * (3 - 2 * u); } // perto/atrás do texto: até 84% mais apagada
        }
        var sz = (p.dust ? .7 : 1.5) * (.6 + depth * 1.1) * (touch ? 1.1 : 1);
        // branco; ~7% dos pontos do globo na cor principal
        ctx.fillStyle = (p.red ? 'rgba(' + acc + ',' : 'rgba(255,255,255,') + Math.min(1, p.red ? al * 1.3 : al).toFixed(3) + ')';
        if (p.ch) { if (Math.random() < .01) p.ch = HEX[(Math.random() * 16) | 0]; ctx.fillText(p.ch, sx + p.ox, syy + p.oy); }
        else ctx.fillRect(sx + p.ox - sz / 2, syy + p.oy - sz / 2, sz, sz);
      }
      // brilho central suave
      var gr = ctx.createRadialGradient(c.cx, c.cy, 0, c.cx, c.cy, R * 1.3);
      gr.addColorStop(0, 'rgba(255,255,255,' + (.05 + pulse * .08).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      if (!reduced && visible) raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf) raf = requestAnimationFrame(frame); }

    function interactive(t) { return t && t.closest && t.closest('input,textarea,button,a,select,[role="button"],[contenteditable="true"],[role="radio"],[role="tab"]'); }
    host.addEventListener('pointerdown', function (e) {
      if (interactive(e.target)) return;
      drag = { x: e.clientX, y: e.clientY, t: performance.now() }; host.style.cursor = 'grabbing';
    });
    addEventListener('pointermove', function (e) {
      var r = cv.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top;
      if (drag) {
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        yaw += dx * .006; pitch = Math.max(-1.2, Math.min(1.2, pitch + dy * .004));
        vyaw = dx * .006; vpitch = dy * .004; drag.x = e.clientX; drag.y = e.clientY;
      }
      if (reduced) kick();
    }, { passive: true });
    function up() { if (drag) { drag = null; host.style.cursor = ''; } }
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
    host.addEventListener('pointerleave', function () { mx = my = -9999; });
    // digitar na caixa de pergunta pulsa o globo
    document.addEventListener('input', function (e) { var t = e.target; if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') && host.contains(t)) { pulse = Math.min(1, pulse + .45); if (!reduced) vyaw += .004; kick(); } }, true);

    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) kick(); }).observe(host);
    kick();
  }

  function scan() { document.querySelectorAll('canvas[data-nebula]').forEach(start); }
  // a página monta depois; procura até achar e então para de observar
  // a página do Claude Design remonta elementos; observa sempre, no máximo uma busca por quadro
  var pend = 0;
  new MutationObserver(function () { if (!pend) pend = requestAnimationFrame(function () { pend = 0; scan(); }); }).observe(document.documentElement, { childList: true, subtree: true });
  scan();
})();
