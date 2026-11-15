// Cursor do Heretic: ponto + anel que segue com atraso. Só em mouse/trackpad (pointer: fine).
// Sobre links e botões o anel cresce; no clique encolhe; em campos de texto volta o cursor de digitação.
(function () {
  if (window.__hereticCursor) return;
  if (!matchMedia("(pointer: fine)").matches) return;
  window.__hereticCursor = true;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  var css = document.createElement("style");
  css.textContent =
    "html.hc, html.hc *{cursor:none!important}" +
    "html.hc input, html.hc textarea, html.hc [contenteditable=true], html.hc select{cursor:text!important}" +
    ".hc-dot,.hc-ring{position:fixed;left:0;top:0;pointer-events:none;z-index:2147483646;border-radius:999px;opacity:0;transition:opacity .2s}" +
    ".hc-dot{width:5px;height:5px;margin:-2.5px 0 0 -2.5px;background:#fff}" +
    ".hc-ring{width:34px;height:34px;margin:-17px 0 0 -17px;border:1px solid rgba(255,255,255,.55);" +
    "transition:opacity .2s,width .25s cubic-bezier(.2,.7,.2,1),height .25s cubic-bezier(.2,.7,.2,1),margin .25s cubic-bezier(.2,.7,.2,1),background .25s,border-color .25s}" +
    ".hc-on .hc-dot,.hc-on .hc-ring{opacity:1}" +
    ".hc-hover .hc-ring{width:54px;height:54px;margin:-27px 0 0 -27px;background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.8)}" +
    ".hc-down .hc-ring{width:24px;height:24px;margin:-12px 0 0 -12px}" +
    ".hc-text .hc-dot,.hc-text .hc-ring{opacity:0!important}";
  document.head.appendChild(css);

  var dot = document.createElement("div"); dot.className = "hc-dot";
  var ring = document.createElement("div"); ring.className = "hc-ring";
  function mount() { document.body.appendChild(dot); document.body.appendChild(ring); document.documentElement.classList.add("hc"); }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);

  var root = document.documentElement, x = -100, y = -100, rx = -100, ry = -100, raf = 0;
  function loop() {
    rx += (x - rx) * (reduce ? 1 : 0.2); ry += (y - ry) * (reduce ? 1 : 0.2);
    ring.style.transform = "translate3d(" + rx + "px," + ry + "px,0)";
    if (Math.abs(x - rx) + Math.abs(y - ry) > 0.2) raf = requestAnimationFrame(loop); else raf = 0;
  }
  var INTERACTIVE = "a,button,[role=button],[role=option],[role=tab],[role=radio],[role=switch],label,summary,[data-pill]";
  var TEXT = "input,textarea,[contenteditable=true],select";
  addEventListener("pointermove", function (e) {
    if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    x = e.clientX; y = e.clientY;
    dot.style.transform = "translate3d(" + x + "px," + y + "px,0)";
    root.classList.add("hc-on");
    var t = e.target && e.target.closest ? e.target : null;
    root.classList.toggle("hc-text", !!(t && t.closest(TEXT)));
    root.classList.toggle("hc-hover", !!(t && t.closest(INTERACTIVE)));
    if (!raf) raf = requestAnimationFrame(loop);
  }, { passive: true });
  addEventListener("pointerdown", function () { root.classList.add("hc-down"); }, { passive: true });
  addEventListener("pointerup", function () { root.classList.remove("hc-down"); }, { passive: true });
  document.addEventListener("mouseleave", function () { root.classList.remove("hc-on"); });
  addEventListener("blur", function () { root.classList.remove("hc-on"); });
})();
