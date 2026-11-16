/* Heretic — "Como funciona" como um processador.
   IA comum: o núcleo liga, uma jaula (a trava de segurança) desce sobre o chip, a pergunta bate na trava e volta tarjada.
   Jailbreak: o chip esquenta, a trava trinca e as barras voam. Heretic: núcleo livre, agente, ferramentas e memória acendem.
   Tudo é dirigido pelo progresso p (0..1) do scroll que a landing já calcula; nada anima sozinho.
   Paleta: grafite #1E1E22 (60), roxo #6C3BFF (30), lima #C6F432 (10). */
(function () {
  var NS = 'http://www.w3.org/2000/svg';
  var PUR = '#6C3BFF', LIM = '#C6F432', INK = '#1E1E22', PKG = '#26262B', LINE = '#3A3A42', MUTE = '#7C7C86';
  var MONO = "'Geist Mono Variable',ui-monospace,monospace", SANS = "'Geist Variable',system-ui,sans-serif";

  function seg(p, a, b) { return Math.max(0, Math.min(1, (p - a) / (b - a))); }
  function ease(x) { return x * x * (3 - 2 * x); }
  function rnd(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

  function geo(vertical) {
    if (!vertical) return {
      W: 1000, H: 520, cx: 500, cy: 260, pkg: 210, die: 112,
      inN: [92, 260], outN: [908, 260], nodeW: 150, nodeH: 46,
      inPath: 'M158 260 H395', outPath: 'M605 260 H842',
      mods: [
        { id: 'a', label: 'AGENT', x: 300, y: 82, path: 'M300 105 V170 H440 V155' },
        { id: 't', label: 'TOOLS', x: 700, y: 82, path: 'M700 105 V170 H560 V155' },
        { id: 'm', label: 'MEMORY', x: 500, y: 462, path: 'M500 439 V365' }
      ], modW: 150, modH: 46, lock: [500, 388], word: 52
    };
    return {
      W: 380, H: 600, cx: 190, cy: 300, pkg: 168, die: 90,
      inN: [190, 40], outN: [190, 560], nodeW: 120, nodeH: 40,
      inPath: 'M190 60 V216', outPath: 'M190 384 V540',
      mods: [
        { id: 'a', label: 'AGENT', x: 62, y: 190, path: 'M62 210 V260 H106' },
        { id: 't', label: 'TOOLS', x: 318, y: 190, path: 'M318 210 V260 H274' },
        { id: 'm', label: 'MEMORY', x: 62, y: 410, path: 'M62 390 V340 H106' }
      ], modW: 112, modH: 40, lock: [278, 300], word: 34
    };
  }

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, s, size, fill, font, weight, anchor) {
    var t = el('text', { x: x, y: y, fill: fill, 'font-size': size, 'font-family': font || MONO, 'font-weight': weight || 500, 'text-anchor': anchor || 'middle', 'dominant-baseline': 'central', 'letter-spacing': font === SANS ? '-.02em' : '.08em' }, parent);
    t.textContent = s; return t;
  }

  function build(host, vertical) {
    var g = geo(vertical), r = {};
    host.innerHTML = '';
    var svg = el('svg', { viewBox: '0 0 ' + g.W + ' ' + g.H, width: '100%', height: '100%', preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': 'AI processor: the safety lock breaks and the answer gets through' }, host);
    svg.style.overflow = 'visible';
    var defs = el('defs', {}, svg);
    var f = el('filter', { id: 'hxGlow', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
    el('feGaussianBlur', { stdDeviation: vertical ? 8 : 12 }, f);
    var gr = el('radialGradient', { id: 'hxHeat' }, defs);
    el('stop', { offset: '0', 'stop-color': PUR, 'stop-opacity': '.32' }, gr);
    el('stop', { offset: '1', 'stop-color': PUR, 'stop-opacity': '0' }, gr);

    var root = r.root = el('g', {}, svg);
    var half = g.pkg / 2, cx = g.cx, cy = g.cy;

    // calor roxo atrás do chip
    r.heat = el('circle', { cx: cx, cy: cy, r: g.pkg * 1.15, fill: 'url(#hxHeat)', opacity: 0 }, root);

    // trilhas: entrada, saída e módulos
    r.inBase = el('path', { d: g.inPath, stroke: LINE, 'stroke-width': 2, fill: 'none' }, root);
    r.outBase = el('path', { d: g.outPath, stroke: LINE, 'stroke-width': 2, fill: 'none' }, root);
    r.outLit = el('path', { d: g.outPath, stroke: LIM, 'stroke-width': 2.5, fill: 'none' }, root);
    r.mods = g.mods.map(function (m) {
      var o = {};
      o.base = el('path', { d: m.path, stroke: LINE, 'stroke-width': 2, fill: 'none', 'stroke-linejoin': 'round' }, root);
      o.lit = el('path', { d: m.path, stroke: PUR, 'stroke-width': 2.5, fill: 'none', 'stroke-linejoin': 'round' }, root);
      o.box = el('g', {}, root);
      el('rect', { x: m.x - g.modW / 2, y: m.y - g.modH / 2, width: g.modW, height: g.modH, rx: 10, fill: PKG, stroke: PUR, 'stroke-opacity': .7 }, o.box);
      el('rect', { x: m.x - g.modW / 2 + 10, y: m.y - 3, width: 6, height: 6, rx: 1, fill: LIM }, o.box);
      txt(o.box, m.x + 6, m.y, m.label, vertical ? 10 : 12, '#F2F2F4');
      o.pulse = el('circle', { r: vertical ? 3.5 : 4.5, fill: LIM }, root);
      return o;
    });

    // nós de entrada e saída
    function node(c, label) {
      var n = el('g', {}, root);
      var rect = el('rect', { x: c[0] - g.nodeW / 2, y: c[1] - g.nodeH / 2, width: g.nodeW, height: g.nodeH, rx: g.nodeH / 2, fill: PKG, stroke: '#ffffff1f' }, n);
      var t = txt(n, c[0], c[1], label, vertical ? 11 : 12, '#B0B0B8');
      return { g: n, rect: rect, t: t };
    }
    r.inNode = node(g.inN, 'PAYLOAD');
    r.outNode = node(g.outN, 'OUTPUT');

    // pacote da pergunta
    r.packet = el('rect', { width: vertical ? 22 : 28, height: vertical ? 10 : 12, rx: 3, fill: '#F2F2F4' }, root);
    // tarjas que saem na IA comum
    r.redact = el('g', {}, root);
    for (var i = 0; i < 3; i++) el('rect', { width: vertical ? 14 : 22, height: vertical ? 7 : 9, rx: 1, fill: '#4A4A52' }, r.redact);

    // pinos e encapsulamento
    var chip = r.chip = el('g', {}, root);
    var pins = vertical ? 8 : 10, step = g.pkg / (pins + 1), pl = vertical ? 9 : 12;
    for (var k = 1; k <= pins; k++) {
      var o2 = -half + k * step;
      el('rect', { x: cx + o2 - 2, y: cy - half - pl, width: 4, height: pl, fill: '#4A4A52' }, chip);
      el('rect', { x: cx + o2 - 2, y: cy + half, width: 4, height: pl, fill: '#4A4A52' }, chip);
      el('rect', { x: cx - half - pl, y: cy + o2 - 2, width: pl, height: 4, fill: '#4A4A52' }, chip);
      el('rect', { x: cx + half, y: cy + o2 - 2, width: pl, height: 4, fill: '#4A4A52' }, chip);
    }
    r.pkgRect = el('rect', { x: cx - half, y: cy - half, width: g.pkg, height: g.pkg, rx: 18, fill: PKG, stroke: '#ffffff17' }, chip);
    var d = g.die / 2;
    r.dieRect = el('rect', { x: cx - d, y: cy - d, width: g.die, height: g.die, rx: 8, fill: INK, stroke: '#ffffff12' }, chip);
    // núcleos 4x4
    r.cores = [];
    var cs = g.die / 4, pad = vertical ? 4 : 5;
    for (var row = 0; row < 4; row++) for (var col = 0; col < 4; col++) {
      r.cores.push(el('rect', { x: cx - d + col * cs + pad / 2, y: cy - d + row * cs + pad / 2, width: cs - pad, height: cs - pad, rx: 2, fill: PUR, opacity: 0 }, chip));
    }
    r.coreTag = txt(chip, cx, cy + half - (vertical ? 18 : 22), 'CORE://LLM', vertical ? 9 : 11, MUTE);

    // rachaduras no die (lima)
    r.cracks = [];
    var R = rnd(7);
    for (var c = 0; c < 6; c++) {
      var a = c / 6 * Math.PI * 2 + R() * .6, len = half * (1.05 + R() * .35), pts = [[cx, cy]];
      for (var s = 1; s <= 4; s++) { var t = s / 4, j = (R() - .5) * 18; pts.push([cx + Math.cos(a) * len * t + Math.sin(a) * j, cy + Math.sin(a) * len * t - Math.cos(a) * j]); }
      var pl2 = el('polyline', { points: pts.map(function (q) { return q.join(','); }).join(' '), fill: 'none', stroke: LIM, 'stroke-width': vertical ? 1.6 : 2, 'stroke-linejoin': 'round', opacity: 0 }, root);
      var L = 0; for (var q = 1; q < pts.length; q++) L += Math.hypot(pts[q][0] - pts[q - 1][0], pts[q][1] - pts[q - 1][1]);
      pl2.setAttribute('stroke-dasharray', L); r.cracks.push({ el: pl2, L: L });
    }

    // a jaula: barras verticais + trilhos, cada barra em dois pedaços que voam no jailbreak
    var cage = r.cage = el('g', {}, root), m = vertical ? 14 : 20, top = cy - half - m, bot = cy + half + m, left = cx - half - m, right = cx + half + m;
    r.shards = [];
    var bars = vertical ? 7 : 9, R2 = rnd(42);
    function shard(x, y, w, h, cxp, cyp) {
      var gg = el('g', {}, cage);
      el('rect', { x: x, y: y, width: w, height: h, rx: 2, fill: '#5A5A64' }, gg);
      var ang = Math.atan2(cyp - cy, cxp - cx) + (R2() - .5) * .8, dist = (vertical ? 140 : 260) * (.6 + R2() * .7);
      r.shards.push({ g: gg, cx: cxp, cy: cyp, dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist, rot: (R2() - .5) * 220 });
    }
    for (var b = 0; b < bars; b++) {
      var bx = left + (b + .5) * (right - left) / bars, cut = cy + (R2() - .5) * g.pkg * .5, bw = vertical ? 4 : 5;
      shard(bx - bw / 2, top, bw, cut - top, bx, (top + cut) / 2);
      shard(bx - bw / 2, cut, bw, bot - cut, bx, (cut + bot) / 2);
    }
    var rh = vertical ? 7 : 9, midX = (left + right) / 2;
    shard(left - 6, top - rh, midX - left + 6, rh, (left + midX) / 2, top);
    shard(midX, top - rh, right - midX + 6, rh, (midX + right) / 2, top);
    shard(left - 6, bot, midX - left + 6, rh, (left + midX) / 2, bot);
    shard(midX, bot, right - midX + 6, rh, (midX + right) / 2, bot);
    r.cageBox = [left, top, right, bot];

    // feixe de varredura do filtro
    r.scan = el('rect', { x: left, y: top, width: right - left, height: vertical ? 3 : 4, fill: '#F2F2F4', opacity: 0 }, root);

    // cadeado
    var lk = r.lock = el('g', {}, root), lx = g.lock[0], ly = g.lock[1], s2 = vertical ? .8 : 1;
    r.shackle = el('path', { d: 'M' + (lx - 11 * s2) + ' ' + (ly - 4 * s2) + ' v-9 a' + 11 * s2 + ' ' + 11 * s2 + ' 0 0 1 ' + 22 * s2 + ' 0 v9', fill: 'none', stroke: '#B0B0B8', 'stroke-width': 4 * s2, 'stroke-linecap': 'round' }, lk);
    r.lockBody = el('rect', { x: lx - 17 * s2, y: ly - 5 * s2, width: 34 * s2, height: 26 * s2, rx: 6 * s2, fill: '#B0B0B8' }, lk);
    el('rect', { x: lx - 2 * s2, y: ly + 3 * s2, width: 4 * s2, height: 9 * s2, rx: 2 * s2, fill: INK }, lk);
    r.stamp = txt(root, vertical ? g.lock[0] : g.lock[0], vertical ? g.lock[1] + 42 : g.lock[1] + 52, 'ACCESS DENIED', vertical ? 11 : 13, '#FF6B6B', MONO, 600);

    // palavra do jailbreak com sombra roxa deslocada
    r.word = el('g', { 'pointer-events': 'none' }, svg);
    r.wordB = txt(r.word, cx, vertical ? 150 : 70, 'JAILBREAK', g.word, PUR, SANS, 700);
    r.wordA = txt(r.word, cx, vertical ? 150 : 70, 'JAILBREAK', g.word, LIM, SANS, 700);
    r.g = g; r.vertical = vertical;
    return r;
  }

  function at(path, t) { var L = path.getTotalLength(); return path.getPointAtLength(Math.max(0, Math.min(1, t)) * L); }
  function vis(e, o) { e.setAttribute('opacity', o.toFixed(3)); }
  function draw(path, t) { var L = path.getTotalLength(); path.setAttribute('stroke-dasharray', L); path.setAttribute('stroke-dashoffset', (L * (1 - t)).toFixed(1)); }

  function render(r, p) {
    var g = r.g, cx = g.cx, cy = g.cy;
    var appear = ease(seg(p, .02, .12)), fade = 1 - ease(seg(p, .84, .9));
    var cores = seg(p, .1, .18), cage = ease(seg(p, .18, .23)), scan = seg(p, .2, .28), refuse = seg(p, .25, .29), soft = seg(p, .31, .38);
    var m = seg(p, .4, .52), crack = ease(Math.min(1, m / .4)), brk = ease(Math.max(0, (m - .35) / .65));
    var free = ease(seg(p, .5, .56)), outGo = seg(p, .74, .8);
    var heretic = p >= .46;
    r.root.setAttribute('opacity', (appear * fade).toFixed(3));
    r.word.setAttribute('opacity', fade.toFixed(3));

    // núcleos acendem em varredura; no Heretic ficam cheios
    r.cores.forEach(function (c, i) { var on = seg(cores * 16, i, i + 1); vis(c, (heretic ? .35 + .65 * free : .55 * on) * (1 - .4 * (refuse && !heretic ? refuse : 0))); });
    vis(r.heat, heretic ? .25 + .55 * free : .18 * cores);
    r.dieRect.setAttribute('stroke', heretic ? PUR : '#ffffff12');
    r.coreTag.setAttribute('fill', heretic ? '#F2F2F4' : MUTE);

    // pacote: entra; na IA comum para na jaula, no Heretic atravessa
    var pk = r.packet, pw = +pk.getAttribute('width'), ph = +pk.getAttribute('height'), pt, po = 0;
    if (!heretic) {
      var go = seg(p, .12, .26), q = at(r.inBase, go); pt = q; po = go > 0 && go < 1 ? 1 : go >= 1 ? 1 - refuse : 0;
      if (refuse > 0 && refuse < 1) { pt = { x: q.x + (r.vertical ? 0 : -refuse * 30), y: q.y + (r.vertical ? -refuse * 30 : 0) }; }
      pk.setAttribute('fill', '#F2F2F4');
    } else {
      var go2 = seg(p, .56, .74), q2 = at(r.inBase, go2 * 2); pt = go2 < .5 ? q2 : at(r.outBase, (go2 - .5) * 2); po = go2 > 0 && go2 < 1 ? 1 : 0;
      if (outGo > 0) { pt = at(r.outBase, outGo); po = outGo < 1 ? 1 : 0; }
      pk.setAttribute('fill', LIM);
    }
    pk.setAttribute('x', (pt.x - pw / 2).toFixed(1)); pk.setAttribute('y', (pt.y - ph / 2).toFixed(1)); vis(pk, po);

    // tarjas saindo na resposta suavizada
    var rs = r.redact.children;
    for (var i = 0; i < rs.length; i++) {
      var t = Math.max(0, Math.min(1, soft * 1.4 - i * .2)), q3 = at(r.outBase, t);
      rs[i].setAttribute('x', (q3.x - rs[i].getAttribute('width') / 2).toFixed(1)); rs[i].setAttribute('y', (q3.y - rs[i].getAttribute('height') / 2).toFixed(1));
      vis(rs[i], heretic ? 0 : (t > 0 ? 1 : 0) * (1 - seg(p, .4, .44)));
    }

    // jaula: desce, trinca, explode
    var dropY = (1 - cage) * -(r.vertical ? 30 : 46);
    r.shards.forEach(function (s) {
      var k = brk, x = s.dx * k, y = s.dy * k + dropY, rot = s.rot * k;
      s.g.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + rot.toFixed(1) + ' ' + s.cx + ' ' + s.cy + ')');
      vis(s.g, cage * (1 - brk));
      s.g.firstChild.setAttribute('fill', crack > .05 && brk < 1 ? (crack > .6 ? LIM : '#8A8A94') : '#5A5A64');
    });
    var cb = r.cageBox, sy = cb[1] + (cb[3] - cb[1]) * ((scan * 3) % 1);
    r.scan.setAttribute('y', sy.toFixed(1)); vis(r.scan, scan > 0 && scan < 1 && !heretic ? .55 : 0);

    // cadeado: aparece com a jaula, pulsa na recusa, o arco salta no jailbreak
    var shake = refuse > 0 && refuse < 1 ? Math.sin(refuse * Math.PI * 6) * 4 : 0;
    r.lock.setAttribute('transform', 'translate(' + (shake + brk * (r.vertical ? 60 : 40)).toFixed(1) + ' ' + (dropY + brk * (r.vertical ? 90 : 140)).toFixed(1) + ') rotate(' + (brk * 70).toFixed(1) + ' ' + g.lock[0] + ' ' + g.lock[1] + ')');
    vis(r.lock, cage * (1 - brk));
    r.shackle.setAttribute('transform', 'translate(0 ' + (-crack * 10).toFixed(1) + ') rotate(' + (-crack * 35).toFixed(1) + ' ' + (g.lock[0] + 11) + ' ' + g.lock[1] + ')');
    var lc = crack > .3 ? LIM : refuse > 0 ? '#F2F2F4' : '#B0B0B8';
    r.lockBody.setAttribute('fill', lc); r.shackle.setAttribute('stroke', lc);
    vis(r.stamp, heretic ? 0 : refuse * (1 - seg(p, .38, .42)));

    // rachaduras e palavra
    r.cracks.forEach(function (c) { c.el.setAttribute('stroke-dashoffset', (c.L * (1 - crack)).toFixed(1)); vis(c.el, crack * (1 - ease(seg(p, .5, .55)))); });
    var flash = Math.sin(Math.PI * Math.max(0, Math.min(1, (m - .25) / .75)));
    var jit = flash > .05 ? ((Math.round(p * 900) % 5) - 2) * 2.2 : 0;
    r.wordA.setAttribute('transform', 'translate(' + jit + ' 0)'); r.wordB.setAttribute('transform', 'translate(' + (-jit - 4) + ' 3)');
    vis(r.wordA, flash); vis(r.wordB, flash * .9);
    r.root.setAttribute('transform', flash > .2 ? 'translate(' + (jit * .6).toFixed(1) + ' 0)' : '');

    // módulos do Heretic, um por vez, com pulsos lima correndo nas trilhas
    var spans = [[.56, .61], [.62, .67], [.68, .73]];
    r.mods.forEach(function (o, i) {
      var a = ease(seg(p, spans[i][0], spans[i][1])), mg = g.mods[i];
      vis(o.box, a); vis(o.base, a ? .9 : 0);
      o.box.setAttribute('transform', 'translate(' + mg.x + ' ' + mg.y + ') scale(' + (.85 + .15 * a).toFixed(3) + ') translate(' + -mg.x + ' ' + -mg.y + ')');
      draw(o.lit, a);
      var ph2 = ((p - spans[i][1]) * 14) % 1, q4 = at(o.lit, ph2);
      o.pulse.setAttribute('cx', q4.x.toFixed(1)); o.pulse.setAttribute('cy', q4.y.toFixed(1)); vis(o.pulse, a >= 1 && p < .84 ? 1 : 0);
    });

    // saída: lima no Heretic
    draw(r.outLit, heretic ? outGo : 0);
    var done = heretic && outGo >= 1;
    r.outNode.rect.setAttribute('stroke', done ? LIM : '#ffffff1f');
    r.outNode.t.setAttribute('fill', done ? LIM : '#B0B0B8');
    r.outNode.t.textContent = done ? 'ACCESS GRANTED' : !heretic && soft > .5 ? 'SANITIZED' : 'OUTPUT';
    r.inNode.rect.setAttribute('stroke', heretic ? PUR : '#ffffff1f');
  }

  window.HereticCpu = {
    draw: function (ex, p) {
      if (!ex) return;
      var host = ex.querySelector('[data-cpu]'); if (!host) return;
      var vertical = ex.clientWidth < 640;
      var r = host._hx;
      if (!r || !host.firstChild || r.vertical !== vertical) r = host._hx = build(host, vertical);
      render(r, p);
    }
  };
})();
