/* 451.sh — "451 queimando" no topo da landing (mesmo efeito do início do app: ryan-ui/heretic/src/burning-451.ts,
   portado para JS puro; única mudança: parâmetro alpha para a intensidade). Liga em [data-burn451].
   Digitar na caixa do topo aviva as brasas. prefers-reduced-motion: um quadro parado. */
(function () {
  if (window.__hx451Burn) return; window.__hx451Burn = 1;
// "451 queimando" — o 451 gigante em Instrument Serif com textura de papel, que queima em buracos a partir das bordas,
// com brasa, cinza e faíscas, num ciclo de ~50 s (44 queimando, 3 parado, 3 voltando). Portado sem mudança de
// comportamento do desenho aprovado pelo dono no Claude Design ("451 - App", início "C · 451 queimando", 18/11).
// self.holoEnergy (0–1) aviva as brasas quando a pessoa digita. prefers-reduced-motion: um quadro parado.
function startEmber(host, size, self, anim, alpha) {
    if (anim === undefined) anim = true;
    const cv = document.createElement("canvas"), ctx = cv.getContext("2d");
    cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none";
    host.appendChild(cv);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches || !anim;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const font = "400 " + size + "px \"Instrument Serif\", serif", ls = (-0.03 * size) + "px";
    const tex = new Image(); tex.decoding = "async";
    const texReady = new Promise(res => { tex.onload = () => res(true); tex.onerror = () => res(false); });
    tex.src = "/icons/textura-papel.png";
    const MUL = alpha || .08, BURN = 44, HOLD = 3, REST = 3, CYC = BURN + HOLD + REST, S = size > 500 ? 3 : 2;
    let W = 1, H = 1, G = null, wk = null, wc = null, mask = null, pts = [], holes = [], parts = [];
    let bx = 0, by = 0, bw = 1, bh = 1, LM = null, LN = null, cutC, cutX, cutD, chC, chX, chD, emC, emX, emD, emberCells = [];
    let raf = 0, dead = false, ready = false, lastCyc = -1;
    const t0 = performance.now() - (reduced ? 0 : 6000);
    const mk = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };
    const has = (x, y) => { x = x | 0; y = y | 0; return x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] === 1; };
    const vnoise = (w, h, cell) => {
      const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2, g = new Float32Array(gw * gh).map(() => Math.random()), out = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const fx = x / cell, fy = y / cell, ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
        out[y * w + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
      }
      return out;
    };
    const seed = () => {
      holes = [];
      const n = size > 500 ? 9 : 6, minD = size * .16;
      for (let tries = 0; holes.length < n && tries < 500; tries++) {
        const p = pts[(Math.random() * pts.length) | 0]; if (!p) break;
        if (holes.some(h => Math.hypot(h.x - p[0], h.y - p[1]) < minD)) continue;
        const i = holes.length;
        holes.push({ x: p[0], y: p[1], st: i * 3.6 + Math.random() * 3, sp: size * (.0045 + Math.random() * .0035), max: size * (.2 + Math.random() * .16), r: 0 });
      }
    };
    const crumple = (g, tx, ty, tw, th) => {
      const sc = 2, w = Math.ceil(tw / sc), h = Math.ceil(th / sc), K = 22, L = Math.max(14, size / (sc * 9));
      const C = Array.from({ length: K }, () => { const a = Math.random() * Math.PI; return { nx: Math.cos(a), ny: Math.sin(a), px: Math.random() * w, py: Math.random() * h, s: (Math.random() < .5 ? -1 : 1) * (.5 + Math.random() * .8) }; });
      const lx = -.6, ly = -.8;
      const c = mk(w, h), x2 = c.getContext("2d"), id = x2.createImageData(w, h), D = id.data;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let gx = 0, gy = 0, line = 0;
        for (let i = 0; i < K; i++) {
          const q = C[i], d = (x - q.px) * q.nx + (y - q.py) * q.ny, ad = Math.abs(d), k = q.s * Math.sign(d) * Math.exp(-ad / L);
          gx += k * q.nx; gy += k * q.ny;
          if (ad < 1.1) line += q.s * (1.1 - ad);
        }
        const sh = (gx * lx + gy * ly) * .9 + line * .35, j = (y * w + x) * 4;
        if (sh > 0) { D[j] = 255; D[j + 1] = 252; D[j + 2] = 244; D[j + 3] = Math.min(210, sh * 170); }
        else { D[j] = 96; D[j + 1] = 88; D[j + 2] = 72; D[j + 3] = Math.min(220, -sh * 165); }
      }
      x2.putImageData(id, 0, 0);
      g.imageSmoothingEnabled = true; g.drawImage(c, tx, ty, tw, th);
    };
    const setup = () => {
      W = Math.max(1, host.offsetWidth); H = Math.max(1, host.offsetHeight);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      const m0 = mk(1, 1).getContext("2d"); m0.font = font; if ("letterSpacing" in m0) m0.letterSpacing = ls;
      const m = m0.measureText("451"), asc = m.actualBoundingBoxAscent || size * .7;
      const tw = m.width, tx = (W - tw) / 2, base = H * .5 + asc * .5;
      bx = Math.max(0, Math.floor(tx - size * .05)); by = Math.max(0, Math.floor(base - asc - size * .05));
      bw = Math.min(W, Math.ceil(tx + tw + size * .05)) - bx; bh = Math.min(H, Math.ceil(base + size * .05)) - by;
      G = mk(cv.width, cv.height); const g = G.getContext("2d"); g.scale(dpr, dpr);
      g.font = font; if ("letterSpacing" in g) g.letterSpacing = ls;
      if (tex.complete && tex.naturalWidth) {
        const iw = tex.naturalWidth, ih = tex.naturalHeight, sc = Math.max(bw / ih, bh / iw);
        g.save(); g.translate(bx + bw / 2, by + bh / 2); g.rotate(Math.PI / 2);
        g.filter = "grayscale(1) contrast(1.3)"; g.drawImage(tex, -iw * sc / 2, -ih * sc / 2, iw * sc, ih * sc); g.filter = "none"; g.restore();
        g.globalCompositeOperation = "multiply"; g.fillStyle = "#E4E4E4"; g.fillRect(bx, by, bw, bh);
        g.globalCompositeOperation = "destination-in"; g.fillStyle = "#fff"; g.fillText("451", tx, base);
        g.globalCompositeOperation = "source-over";
      } else {
        g.fillStyle = "#E4E4E4"; g.fillText("451", tx, base);
        g.globalCompositeOperation = "source-atop"; crumple(g, bx, by, bw, bh); g.globalCompositeOperation = "source-over";
      }
      const mc = mk(W, H), mx = mc.getContext("2d", { willReadFrequently: true });
      mx.font = font; if ("letterSpacing" in mx) mx.letterSpacing = ls; mx.fillStyle = "#fff"; mx.fillText("451", tx, base);
      const d = mx.getImageData(0, 0, W, H).data; mask = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) mask[i] = d[i * 4 + 3] > 100 ? 1 : 0;
      const corners = [], edgesP = [], rr = Math.max(4, Math.round(size / 90));
      for (let y = rr; y < H - rr; y += 3) for (let x = rr; x < W - rr; x += 3) {
        if (!mask[y * W + x]) continue;
        if (mask[(y - 3) * W + x] && mask[(y + 3) * W + x] && mask[y * W + x - 3] && mask[y * W + x + 3]) continue;
        let on = 0, tot = 0;
        for (let yy = -rr; yy <= rr; yy += 2) for (let xx = -rr; xx <= rr; xx += 2) { tot++; on += mask[(y + yy) * W + x + xx]; }
        (on / tot < .36 ? corners : edgesP).push([x, y]);
      }
      pts = corners.length > 20 ? corners : edgesP;
      const lw = Math.ceil(bw / S), lh = Math.ceil(bh / S);
      LM = new Uint8Array(lw * lh);
      for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) LM[y * lw + x] = has(bx + x * S + S / 2, by + y * S + S / 2) ? 1 : 0;
      const n1 = vnoise(lw, lh, size / (S * 9)), n2 = vnoise(lw, lh, size / (S * 26)), n3 = vnoise(lw, lh, size / (S * 70));
      LN = new Float32Array(lw * lh); for (let i = 0; i < lw * lh; i++) LN[i] = n1[i] * .55 + n2[i] * .3 + n3[i] * .15;
      cutC = mk(lw, lh); cutX = cutC.getContext("2d"); cutD = cutX.createImageData(lw, lh);
      chC = mk(lw, lh); chX = chC.getContext("2d"); chD = chX.createImageData(lw, lh);
      emC = mk(lw, lh); emX = emC.getContext("2d"); emD = emX.createImageData(lw, lh);
      wk = mk(cv.width, cv.height); wc = wk.getContext("2d");
      seed(); ready = true;
    };
    const frame = now => {
      if (!ready) return;
      const t = (now - t0) / 1000, e = self.holoEnergy || 0;
      const cyc = reduced ? 26 : t % CYC, ci = reduced ? 0 : Math.floor(t / CYC);
      if (ci !== lastCyc) { if (lastCyc !== -1) seed(); lastCyc = ci; }
      const rest = cyc > BURN + HOLD ? (cyc - BURN - HOLD) / REST : 0, bt = Math.min(cyc, BURN);
      for (const h of holes) h.r = Math.min(h.max, Math.max(0, (bt - h.st) * h.sp));
      const act = holes.filter(h => h.r > 0), live = (1 - rest) * (cyc < BURN ? 1 : .45);
      const lw = cutC.width, lh = cutC.height, cd = cutD.data, hd = chD.data, ed = emD.data;
      cd.fill(0); hd.fill(0); ed.fill(0); emberCells.length = 0;
      if (act.length) for (let y = 0; y < lh; y++) {
        const py = by + y * S + S / 2;
        for (let x = 0; x < lw; x++) {
          const i = y * lw + x, px = bx + x * S + S / 2;
          let v = 9;
          for (const h of act) { const dx = px - h.x, dy = py - h.y, q = Math.sqrt(dx * dx + dy * dy) / h.r; if (q < v) v = q; }
          if (v > 2.2) continue;
          v += (LN[i] - .5) * .9;
          const j = i * 4;
          if (v < 1) { cd[j + 3] = 255; continue; }
          if (!LM[i]) continue;
          if (v < 1.1) { hd[j] = 8; hd[j + 1] = 8; hd[j + 2] = 8; hd[j + 3] = 255; }
          else if (v < 1.45) { const k = (v - 1.1) / .35; hd[j] = 10 + k * 56; hd[j + 1] = 10 + k * 56; hd[j + 2] = 10 + k * 56; hd[j + 3] = 255 - k * 60; }
          else if (v < 1.9) { const k = (v - 1.45) / .45; hd[j] = 72; hd[j + 1] = 72; hd[j + 2] = 72; hd[j + 3] = (1 - k) * 170; }
          if (v < 1.07) {
            const fl = .5 + .5 * Math.sin(t * 3.1 + LN[i] * 40 + x * .07) * Math.sin(t * 1.7 + y * .09 + LN[i] * 17);
            const k = (1 - (v - 1) / .07) * (.35 + .65 * fl) * (live + e * .3);
            ed[j] = 255; ed[j + 1] = 120 + 110 * fl; ed[j + 2] = 40 + 90 * fl * fl; ed[j + 3] = Math.min(255, k * 255);
            if (k > .45 && (x + y) % 3 === 0) emberCells.push(px, py);
          }
        }
      }
      cutX.putImageData(cutD, 0, 0); chX.putImageData(chD, 0, 0); emX.putImageData(emD, 0, 0);
      wc.setTransform(dpr, 0, 0, dpr, 0, 0); wc.imageSmoothingEnabled = true; wc.globalAlpha = 1;
      wc.globalCompositeOperation = "source-over"; wc.clearRect(0, 0, W, H); wc.drawImage(G, 0, 0, W, H);
      wc.globalCompositeOperation = "source-atop"; wc.drawImage(chC, bx, by, lw * S, lh * S);
      wc.globalCompositeOperation = "destination-out"; wc.drawImage(cutC, bx, by, lw * S, lh * S);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = MUL * (1 - rest); ctx.drawImage(wk, 0, 0);
      if (rest > 0) { ctx.globalAlpha = MUL * rest; ctx.drawImage(G, 0, 0); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = true;
      ctx.globalCompositeOperation = "lighter";
      if ("filter" in ctx) {
        ctx.filter = "blur(" + Math.round(size / 45) + "px)"; ctx.globalAlpha = .16; ctx.drawImage(emC, bx, by, lw * S, lh * S);
        ctx.filter = "blur(" + Math.max(2, Math.round(size / 220)) + "px)"; ctx.globalAlpha = .3; ctx.drawImage(emC, bx, by, lw * S, lh * S);
        ctx.filter = "none";
      }
      ctx.globalAlpha = .26; ctx.drawImage(emC, bx, by, lw * S, lh * S);
      ctx.globalCompositeOperation = "source-over";
      if (!reduced && live > .05 && emberCells.length) {
        const n = Math.floor((1.6 + e * 8) * live + Math.random());
        for (let j = 0; j < n; j++) {
          const k = ((Math.random() * emberCells.length / 2) | 0) * 2, x = emberCells[k], y = emberCells[k + 1], spark = Math.random() < .3;
          parts.push({ x: x + (Math.random() - .5) * S, y, vx: (Math.random() - .5) * (spark ? .8 : .35), vy: -(spark ? .7 + Math.random() : .25 + Math.random() * .5), life: 1,
            dec: spark ? .014 + Math.random() * .016 : .004 + Math.random() * .006, s: spark ? 1 + Math.random() * 1.2 : 1.4 + Math.random() * 2.6, spark });
        }
      }
      for (const p of parts) {
        if (!reduced) { p.vx += Math.sin(p.y * .03 + p.x * .01 + t) * .016; p.vy -= p.spark ? .002 : .003; p.x += p.vx; p.y += p.vy; p.life -= p.dec; }
        const a = Math.max(0, p.life);
        if (p.spark) { ctx.fillStyle = "rgb(240,186,120)"; ctx.globalAlpha = a * .35; } else { ctx.fillStyle = "rgb(150,148,150)"; ctx.globalAlpha = a * .16; }
        const z = p.s * (.4 + .6 * a); ctx.fillRect(p.x, p.y, z, z);
      }
      parts = parts.filter(p => p.life > 0 && p.y > -6).slice(-800);
      ctx.globalAlpha = 1;
      if (!reduced) self.holoEnergy = e * .95;
    };
    const loop = now => { if (dead) return; frame(now); if (!document.hidden) raf = requestAnimationFrame(loop); };
    const onVis = () => { if (!document.hidden && !dead && !reduced) { cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); } };
    document.addEventListener("visibilitychange", onVis);
    const ro = new ResizeObserver(() => { if (ready) { setup(); if (reduced) frame(performance.now()); } });
    ro.observe(host);
    Promise.all([document.fonts.load(font), texReady]).then(() => {
      if (dead) return;
      setup();
      if (reduced) frame(performance.now()); else raf = requestAnimationFrame(loop);
    });
    return () => { dead = true; cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener("visibilitychange", onVis); cv.remove(); };
}

  function fit(host) {
    var W = host.offsetWidth, H = host.offsetHeight;
    var c = document.createElement("canvas").getContext("2d");
    c.font = '400 100px "Instrument Serif", serif';
    var w = c.measureText("451").width * 0.97 || 140;
    return Math.max(160, Math.min(Math.floor(W * 0.9 / w * 100), Math.floor(H * 0.95)));
  }
  function start(host) {
    if (host.__burn) return; host.__burn = 1;
    var energy = { holoEnergy: 0 }, stop = null, lastSize = 0;
    var alpha = parseFloat(host.getAttribute("data-burn-alpha")) || .2;
    function run() {
      var s = fit(host); if (!host.offsetWidth || Math.abs(s - lastSize) < 24) return;
      lastSize = s; if (stop) stop(); stop = startEmber(host, s, energy, true, alpha);
    }
    document.fonts.load('400 100px "Instrument Serif"').then(run, run);
    var t = 0; new ResizeObserver(function () { clearTimeout(t); t = setTimeout(run, 180); }).observe(host);
    var scope = host.parentElement || document;
    scope.addEventListener("input", function () { energy.holoEnergy = 1; }, true);
  }
  function scan() { document.querySelectorAll("[data-burn451]").forEach(start); }
  scan();
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
})();
