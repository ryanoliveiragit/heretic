// Heretic landing sculptures: three small canvas pieces (disc, mesh, dots) drawn as particles and lines.
// Each one tilts in 3D, reacts to the pointer, rotates on drag, takes its glow from the page's --accent,
// and only the most visible one animates. Reduced motion gets a still frame that still answers to drag.
(function () {
  if (window.HxSculpture) return;
  var RM = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var live = [], px1 = null, hold = false, TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function parse(str, fb) {
    if (!str) return fb;
    if (!px1) { var c = document.createElement('canvas'); c.width = c.height = 1; px1 = c.getContext('2d', { willReadFrequently: true }); }
    if (!px1) return fb;
    px1.clearRect(0, 0, 1, 1); px1.fillStyle = '#000'; px1.fillStyle = str; px1.fillRect(0, 0, 1, 1);
    var d = px1.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]];
  }
  function pick() {
    var best = null, i;
    if (!hold) for (i = 0; i < live.length; i++) if (live[i].ratio > 0.04 && (!best || live[i].ratio > best.ratio)) best = live[i];
    for (i = 0; i < live.length; i++) live[i].setActive(live[i] === best);
  }

  function S(el, kind) {
    var self = this, c = this.canvas = document.createElement('canvas');
    this.el = el; this.kind = kind === 'mesh' || kind === 'dots' ? kind : 'disc';
    this.ratio = 0; this.active = false; this.raf = 0; this.last = 0; this.dt = 0.016;
    this.t = 5; this.spin = 5; this.yaw = 0; this.pitch = 0; this.vy = 0; this.vp = 0;
    this.drag = null; this.ptr = null; this.hover = 0; this.tx = 0; this.ty = 0;
    this.wx = 0; this.wz = 0; this.first = true; this.o = [0, 0, 0];
    this.acc = [155, 17, 30]; this.accT = -1e9; this.w = 0; this.h = 0; this.dpr = 1;
    c.setAttribute('aria-hidden', 'true');
    c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent';
    el.appendChild(c); this.ctx = c.getContext('2d');
    this.build();
    function local(e) { var r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    this.onDown = function (e) {
      if (e.button) return;
      self.drag = { x: e.clientX, y: e.clientY }; self.vy = self.vp = 0; self.ptr = local(e);
      try { c.setPointerCapture(e.pointerId); } catch (err) {}
      c.style.cursor = 'grabbing';
    };
    this.onMove = function (e) {
      self.ptr = local(e);
      if (self.drag) {
        var dx = e.clientX - self.drag.x, dy = e.clientY - self.drag.y;
        self.drag.x = e.clientX; self.drag.y = e.clientY;
        self.vy = dx * 0.008; self.vp = dy * 0.006; self.yaw += self.vy; self.pitch = clamp(self.pitch + self.vp, -0.75, 0.6);
      }
      if (!self.raf) self.draw();
    };
    this.onUp = function (e) { self.drag = null; c.style.cursor = 'grab'; if (e.pointerType !== 'mouse') self.ptr = null; if (!self.raf) self.draw(); };
    this.onLeave = function () { if (!self.drag) self.ptr = null; if (!self.raf) self.draw(); };
    c.addEventListener('pointerdown', this.onDown); c.addEventListener('pointermove', this.onMove);
    c.addEventListener('pointerup', this.onUp); c.addEventListener('pointercancel', this.onUp); c.addEventListener('pointerleave', this.onLeave);
    if (typeof ResizeObserver === 'function') { this.ro = new ResizeObserver(function () { self.resize(); self.draw(); }); this.ro.observe(el); }
    if (typeof IntersectionObserver === 'function') {
      this.io = new IntersectionObserver(function (es) { self.ratio = es[es.length - 1].intersectionRatio; pick(); }, { threshold: [0, 0.04, 0.25, 0.5, 0.75, 1] });
      this.io.observe(el);
    } else this.ratio = 1;
    live.push(this); this.resize(); this.draw(); pick();
  }

  S.prototype.destroy = function () {
    var c = this.canvas, i = live.indexOf(this);
    if (i >= 0) live.splice(i, 1);
    if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; this.active = false;
    if (this.ro) this.ro.disconnect(); if (this.io) this.io.disconnect();
    c.removeEventListener('pointerdown', this.onDown); c.removeEventListener('pointermove', this.onMove);
    c.removeEventListener('pointerup', this.onUp); c.removeEventListener('pointercancel', this.onUp); c.removeEventListener('pointerleave', this.onLeave);
    if (c.parentNode) c.parentNode.removeChild(c);
  };
  S.prototype.resize = function () {
    var r = this.el.getBoundingClientRect();
    this.w = r.width; this.h = r.height; this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(this.w * this.dpr)); this.canvas.height = Math.max(1, Math.round(this.h * this.dpr));
  };
  S.prototype.setActive = function (on) { if (on === this.active) return; this.active = on; if (on && !RM) this.loop(); };
  S.prototype.loop = function () {
    var self = this; if (this.raf) return; this.last = 0;
    function step(now) {
      self.raf = 0;
      if (!self.active || !self.canvas.isConnected) return;
      if (!document.hidden) { self.dt = self.last ? Math.min(0.05, (now - self.last) / 1000) : 0.016; self.last = now; self.update(self.dt); self.draw(); } else self.last = 0;
      self.raf = requestAnimationFrame(step);
    }
    this.raf = requestAnimationFrame(step);
  };
  S.prototype.update = function (dt) {
    this.t += dt;
    if (!this.drag) {
      this.yaw += this.vy; this.pitch = clamp(this.pitch + this.vp, -0.75, 0.6); this.vy *= 0.93; this.vp *= 0.88;
      if (this.kind !== 'disc') this.yaw += dt * 0.035;
    }
    this.hover += ((this.ptr && !this.drag ? 1 : 0) - this.hover) * Math.min(1, dt * 5);
    var nx = this.ptr ? this.ptr.x / this.w - 0.5 : 0, ny = this.ptr ? this.ptr.y / this.h - 0.5 : 0, e = Math.min(1, dt * 3);
    this.tx += (nx - this.tx) * e; this.ty += (ny - this.ty) * e;
    this.spin += dt * (1 + this.hover * 0.9);
  };

  // Camera: yaw about Y, then pitch about X (far edge rises), optional roll about Z, then perspective.
  S.prototype.cam = function (yaw, pitch, scale, cy) {
    this.ca = Math.cos(yaw); this.sa = Math.sin(yaw); this.cp = Math.cos(pitch); this.sp = Math.sin(pitch);
    this.K = scale; this.cx = this.w / 2; this.cy = this.h * cy; this.D = 3.4; this.roll = false;
  };
  S.prototype.pt = function (x, y, z, o) {
    var x1 = x * this.ca + z * this.sa, z1 = -x * this.sa + z * this.ca;
    var y2 = y * this.cp + z1 * this.sp, z2 = -y * this.sp + z1 * this.cp;
    if (this.roll) { var x3 = x1 * this.cr - y2 * this.sr; y2 = x1 * this.sr + y2 * this.cr; x1 = x3; }
    var k = this.K * this.D / (this.D + z2);
    o[0] = this.cx + x1 * k; o[1] = this.cy - y2 * k; o[2] = z2;
  };
  // Pointer position on the model's ground plane (y = 0), for the pieces without roll.
  S.prototype.hit = function (px, py) {
    var f = this.K * this.D, a = (px - this.cx) / f, b = -(py - this.cy) / f;
    var oy1 = this.D * this.sp, oz1 = -this.D * this.cp, dy1 = b * this.cp - this.sp, dz1 = b * this.sp + this.cp;
    if (Math.abs(dy1) < 1e-4) return null;
    var t = -oy1 / dy1; if (t <= 0) return null;
    var x1 = a * t, z1 = oz1 + dz1 * t;
    return [x1 * this.ca - z1 * this.sa, x1 * this.sa + z1 * this.ca];
  };

  S.prototype.build = function () {
    var seed = 11, i;
    function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    if (this.kind === 'disc') {
      var n = this.n = 2600, P = this.P = new Float32Array(n * 5);
      for (i = 0; i < n; i++) {
        var rad = 0.24 + 0.76 * Math.pow(rnd(), 1.25);
        P[i * 5] = rad; P[i * 5 + 1] = rnd() * TAU; P[i * 5 + 2] = 0.2 / Math.pow(rad, 1.5);
        P[i * 5 + 3] = (rnd() - 0.5) * 0.045 * (0.3 + rad); P[i * 5 + 4] = rnd();
      }
      this.B = new Float32Array(n * 5);
    } else if (this.kind === 'dots') {
      this.nx = 46; this.nz = 30; this.Q = new Float32Array(this.nx * this.nz * 3);
    }
  };

  S.prototype.draw = function () {
    var ctx = this.ctx, now = performance.now();
    if (!ctx || this.w < 2 || this.h < 2) return;
    if (now - this.accT > 500) { this.accT = now; this.acc = parse(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), this.acc); }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, this.w, this.h);
    ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'round';
    this[this.kind]();
    this.first = false;
  };

  // Particle disc around a dark core. Drag changes its tilt; the pointer leans it and speeds the orbit.
  S.prototype.disc = function () {
    var w = this.w, h = this.h, ctx = this.ctx, n = this.n, P = this.P, B = this.B, o = this.o, acc = this.acc, i, b;
    var pitch = clamp(0.5 + this.pitch + this.ty * 0.28, 0.1, 1.45), roll = 0.36 + this.yaw * 0.6 + this.tx * 0.22;
    this.cam(0, pitch, 0.46 * Math.min(w, h * 1.5), 0.5); this.roll = true; this.cr = Math.cos(roll); this.sr = Math.sin(roll);
    var t = this.spin, count = Math.round(n * clamp(w * h / 260000, 0.45, 1)), K = this.K;
    for (i = 0; i < count; i++) {
      var rad = P[i * 5], th = P[i * 5 + 1] + t * P[i * 5 + 2], y = P[i * 5 + 3], d = Math.min(0.5, 0.05 + P[i * 5 + 2] * 0.11);
      this.pt(rad * Math.cos(th), y, rad * Math.sin(th), o); B[i * 5] = o[0]; B[i * 5 + 1] = o[1]; B[i * 5 + 4] = o[2];
      this.pt(rad * Math.cos(th - d), y, rad * Math.sin(th - d), o); B[i * 5 + 2] = o[0]; B[i * 5 + 3] = o[1];
    }
    function pass(front) {
      for (b = 0; b < 3; b++) {
        ctx.beginPath();
        for (i = 0; i < count; i++) {
          var k = P[i * 5 + 4], bk = k < 0.5 ? 0 : k < 0.86 ? 1 : 2;
          if (bk !== b || (B[i * 5 + 4] <= 0) !== front) continue;
          ctx.moveTo(B[i * 5], B[i * 5 + 1]); ctx.lineTo(B[i * 5 + 2], B[i * 5 + 3]);
        }
        if (b === 2) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = rgba(acc, 0.3); ctx.lineWidth = 3.2; ctx.stroke();
          ctx.strokeStyle = rgba(acc, 1); ctx.lineWidth = 1.4; ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
        } else { ctx.strokeStyle = b === 0 ? 'rgba(200,200,206,.3)' : 'rgba(242,242,242,.62)'; ctx.lineWidth = 1; ctx.stroke(); }
      }
    }
    pass(false);
    ctx.save(); ctx.translate(this.cx, this.cy); ctx.rotate(-roll); ctx.scale(1, Math.max(0.08, Math.sin(pitch)));
    var R = K * 0.82, g = ctx.createRadialGradient(0, 0, K * 0.1, 0, 0, R);
    g.addColorStop(0, rgba(acc, 0.42)); g.addColorStop(0.45, rgba(acc, 0.12)); g.addColorStop(1, rgba(acc, 0));
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill(); ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#050506'; ctx.beginPath(); ctx.arc(this.cx, this.cy, K * 0.185, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(acc, 0.55); ctx.lineWidth = 1; ctx.stroke();
    pass(true);
  };

  // Line mesh that sinks under the pointer; on its own the well drifts slowly.
  S.prototype.mesh = function () {
    var w = this.w, h = this.h, ctx = this.ctx, o = this.o, acc = this.acc, n = 25, seg = 40, pass, i, j, u, v, x, z;
    this.cam(0.62 + this.yaw, clamp(0.92 + this.pitch, 0.35, 1.35), 0.4 * Math.min(w, h * 1.7), 0.47);
    var hp = this.ptr && !this.drag ? this.hit(this.ptr.x, this.ptr.y) : null, gx, gz;
    if (hp) { gx = clamp(hp[0], -0.9, 0.9); gz = clamp(hp[1], -0.9, 0.9); } else { gx = 0.42 * Math.cos(this.t * 0.33); gz = 0.36 * Math.sin(this.t * 0.47); }
    var e = this.first ? 1 : Math.min(1, this.dt * 4.5); this.wx += (gx - this.wx) * e; this.wz += (gz - this.wz) * e;
    var wx = this.wx, wz = this.wz, depth = 0.5 + 0.14 * this.hover, s2 = 0.18, K = this.K;
    function hgt(px, pz) { var dx = px - wx, dz = pz - wz; return -depth * Math.exp(-(dx * dx + dz * dz) / s2); }
    this.pt(wx, -depth, wz, o);
    var g = ctx.createRadialGradient(o[0], o[1], 0, o[0], o[1], K * 0.46);
    g.addColorStop(0, rgba(acc, 0.34)); g.addColorStop(1, rgba(acc, 0));
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o[0], o[1], K * 0.46, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over'; ctx.lineWidth = 1;
    for (pass = 0; pass < 2; pass++) for (i = 0; i < n; i++) {
      v = -1 + 2 * i / (n - 1); ctx.beginPath();
      for (j = 0; j <= seg; j++) { u = -1 + 2 * j / seg; x = pass ? v : u; z = pass ? u : v; this.pt(x, hgt(x, z), z, o); if (j) ctx.lineTo(o[0], o[1]); else ctx.moveTo(o[0], o[1]); }
      ctx.strokeStyle = 'rgba(214,214,220,' + (0.13 + 0.3 * (1 - Math.abs(v))).toFixed(3) + ')'; ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 1.3;
    for (pass = 0; pass < 2; pass++) for (i = 0; i < n; i++) {
      v = -1 + 2 * i / (n - 1);
      var near = Math.abs(v - (pass ? wx : wz)); if (near > 0.26) continue;
      var cu = pass ? wz : wx; ctx.beginPath();
      for (j = 0; j <= 20; j++) { u = clamp(cu - 0.46 + 0.92 * j / 20, -1, 1); x = pass ? v : u; z = pass ? u : v; this.pt(x, hgt(x, z), z, o); if (j) ctx.lineTo(o[0], o[1]); else ctx.moveTo(o[0], o[1]); }
      ctx.strokeStyle = rgba(acc, (0.25 + 0.75 * (1 - near / 0.26)).toFixed(3)); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  // Dot field with a standing ripple from the centre; the pointer adds a second source.
  S.prototype.dots = function () {
    var w = this.w, h = this.h, ctx = this.ctx, o = this.o, acc = this.acc, nx = this.nx, nz = this.nz, Q = this.Q, i, j, m = 0, pass;
    this.cam(-0.38 + this.yaw, clamp(0.98 + this.pitch, 0.35, 1.4), 0.34 * Math.min(w, h * 2), 0.5);
    var hp = this.ptr && !this.drag ? this.hit(this.ptr.x, this.ptr.y) : null;
    if (hp) { var e = this.first ? 1 : Math.min(1, this.dt * 6); this.wx += (clamp(hp[0], -1.3, 1.3) - this.wx) * e; this.wz += (clamp(hp[1], -0.85, 0.85) - this.wz) * e; }
    var t = this.t, hv = this.hover, sx = this.wx, sz = this.wz, D = this.D;
    for (j = 0; j < nz; j++) for (i = 0; i < nx; i++) {
      var x = -1.3 + 2.6 * i / (nx - 1), z = -0.85 + 1.7 * j / (nz - 1), d1 = Math.sqrt(x * x + z * z);
      var y = 0.085 * Math.sin(9 * d1 - 2.1 * t) * Math.exp(-d1 * 0.8);
      if (hv > 0.01) { var d2 = Math.sqrt((x - sx) * (x - sx) + (z - sz) * (z - sz)); y += hv * 0.075 * Math.sin(11 * d2 - 3 * t) * Math.exp(-d2 * 1.6); }
      this.pt(x, y, z, o);
      Q[m] = o[0]; Q[m + 1] = o[1]; Q[m + 2] = (y > 0.03 ? 2 : d1 > 1.15 ? 0 : 1) + clamp(0.5 * D / (D + o[2]), 0.2, 0.95); m += 3;
    }
    for (pass = 0; pass < 3; pass++) {
      ctx.beginPath();
      for (i = 0; i < m; i += 3) {
        var q = Q[i + 2], b = q | 0; if (b !== pass) continue;
        var s = (q - b) * (pass === 2 ? 3.6 : 2.7);
        ctx.rect(Q[i] - s / 2, Q[i + 1] - s / 2, s, s);
      }
      if (pass === 2) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(acc, 1); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
      else { ctx.fillStyle = pass ? 'rgba(220,220,226,.6)' : 'rgba(200,200,206,.24)'; ctx.fill(); }
    }
  };

  // One still frame as a JPEG data URL, used as the placeholder picture in the image section.
  function still(kind, size) {
    var s = Object.create(S.prototype), c = document.createElement('canvas'), ctx = c.getContext('2d');
    if (!ctx) return '';
    c.width = c.height = size;
    s.canvas = c; s.ctx = ctx; s.kind = kind === 'mesh' || kind === 'dots' ? kind : 'disc'; s.w = size; s.h = size; s.dpr = 1; s.dt = 0.016;
    s.t = 9; s.spin = 9; s.yaw = -0.5; s.pitch = 0.45; s.vy = 0; s.vp = 0; s.drag = null; s.ptr = null; s.hover = 0; s.tx = 0; s.ty = 0; s.wx = 0; s.wz = 0; s.first = true; s.o = [0, 0, 0];
    s.acc = parse(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), [155, 17, 30]);
    s.build();
    ctx.fillStyle = '#060607'; ctx.fillRect(0, 0, size, size); ctx.lineCap = 'round';
    s[s.kind]();
    try { return c.toDataURL('image/jpeg', 0.9); } catch (e) { return ''; }
  }

  window.HxSculpture = {
    mount: function (el, kind) { return new S(el, kind); },
    setHold: function (on) { on = !!on; if (on === hold) return; hold = on; pick(); },
    still: still
  };
})();
