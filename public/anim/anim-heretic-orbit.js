/* Cópia para a "Heretic - Landing Viva". Mudança em relação ao original em uploads/: trava para não rodar duas vezes; textos do painel em português. */
/* Heretic — agentes em órbita.
   Os 8 <li data-agent> (com o mascote do ryan-ui) giram numa elipse inclinada em volta de um núcleo.
   Arrastar gira; passar ou tocar mostra nome e uma linha no centro; clicar fixa o agente e mostra "Usar este agente".
   Pausa fora da tela; prefers-reduced-motion: órbita parada.
   Marcação: <div data-orbit> com <div data-orbit-panel> e a <ul> dos agentes dentro. */
(function () {
  if (window.__hxOrbit) return; window.__hxOrbit = 1; // roda uma vez só por página
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function start(box) {
    if (box._hx) return; box._hx = true;
    var items = [].slice.call(box.querySelectorAll('li[data-agent]'));
    if (!items.length) { box._hx = false; return; }
    // Clicar num especialista abre o chat já com uma pergunta do tema (o app lê ?q= e envia na hora).
    var QMAP = {
      escritor: 'Destrói o primeiro parágrafo do meu texto e reescreve mais curto e forte.',
      pesquisador: 'Acha as fontes sobre isso e me diz quem discorda.',
      saude: 'Quais remédios não posso misturar com álcool?',
      direito: 'Fui demitido sem justa causa. Quais são os meus direitos?',
      codigo: 'Acha e corrige o bug nesta função.',
      humor: 'Me conta uma piada de humor ácido.',
      seguranca: 'Monta um roteiro de pentest para o meu laboratório.',
      ctf: 'Me explica esse desafio de CTF passo a passo.'
    };
    var panel = box.querySelector('[data-orbit-panel]');
    var pName = panel && panel.querySelector('[data-orbit-name]'), pLine = panel && panel.querySelector('[data-orbit-line]'), pUse = panel && panel.querySelector('[data-orbit-use]');
    var data = items.map(function (li) {
      var n = li.querySelector('strong'), d = n && n.nextElementSibling;
      if (d) d.style.display = 'none';
      li.style.cursor = 'pointer'; li.tabIndex = 0;
      return { li: li, nameEl: n, desc: d, id: li.getAttribute('data-agent'), name: n ? n.textContent : '', line: d ? d.textContent : '' };
    });
    var rot = 0, v = reduced ? 0 : .0022, drag = null, hover = -1, pick = -1, visible = true, raf = 0, moved = 0;

    var curK = -1;
    function show(i) {
      var k = i >= 0 ? i : pick; curK = k;
      if (!panel) return;
      if (k < 0) { pName.textContent = 'Oito especialistas'; pLine.textContent = 'Arraste para girar. Toque em um especialista.'; }
      else { pName.textContent = data[k].name; pLine.textContent = data[k].line; pUse.href = '/app/?q=' + encodeURIComponent(QMAP[data[k].id] || data[k].name); }
      pUse.style.visibility = k < 0 ? 'hidden' : 'visible';
    }
    show(-1);

    function frame() {
      raf = 0;
      var W = box.clientWidth, H = box.clientHeight, cx = W / 2, cy = H / 2, narrow = W < 640;
      // a órbita cabe inteira na caixa (que corta o excesso): nenhuma pílula passa da borda
      var rx = Math.max(60, Math.min(W * (narrow ? .40 : .44), 520, W / 2 - (narrow ? 34 : 118))), ry = Math.min(rx * (narrow ? .78 : .42), H / 2 - 44);
      if (!drag && hover < 0 && pick < 0) rot += v; else if (!drag) rot += v * .15;
      v += ((reduced ? 0 : .0022) - v) * .03;
      if (pUse) { var want = curK < 0 ? 'hidden' : 'visible'; if (pUse.style.visibility !== want) pUse.style.visibility = want; }
      data.forEach(function (d, i) {
        var a = rot + i / data.length * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry, depth = (Math.sin(a) + 1) / 2;
        var s = .78 + depth * .34, on = i === hover || i === pick;
        // o renderizador da página reaplica estilos: reforça a cada quadro
        if (d.desc && d.desc.style.display !== 'none') d.desc.style.display = 'none';
        if (d.nameEl) d.nameEl.style.display = narrow ? 'none' : '';
        d.li.style.padding = narrow ? '6px' : '';
        d.li.style.transform = 'translate(' + (cx + x).toFixed(1) + 'px,' + (cy + y).toFixed(1) + 'px) translate(-50%,-50%) scale(' + (on ? s * 1.08 : s).toFixed(3) + ')';
        d.li.style.opacity = (on ? 1 : .38 + depth * .62).toFixed(3);
        d.li.style.zIndex = String(Math.round(depth * 100) + (on ? 200 : 0));
        d.li.style.boxShadow = on ? 'inset 0 0 0 1px var(--accent), 0 18px 50px -18px #000' : 'inset 0 0 0 1px #ffffff1a';
        // máscaras em prata; só a ativa/escolhida acende na cor principal, com brilho fraco
        d.li.style.setProperty('--mask-color', on ? 'var(--accent)' : '#C8C8CE');
        d.li.style.setProperty('--mask-glow', on ? 'drop-shadow(0 0 7px color-mix(in oklab,var(--accent) 40%,transparent))' : 'none');
      });
      if (visible && !reduced) raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf) raf = requestAnimationFrame(frame); }

    data.forEach(function (d, i) {
      d.li.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') { hover = i; show(i); kick(); } });
      d.li.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') { hover = -1; show(-1); kick(); } });
      d.li.addEventListener('click', function () { if (moved > 6) return; pick = pick === i ? -1 : i; show(pick); kick(); });
      d.li.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick = pick === i ? -1 : i; show(pick); kick(); } });
      d.li.addEventListener('focus', function () { hover = i; show(i); kick(); });
      d.li.addEventListener('blur', function () { hover = -1; show(-1); kick(); });
    });
    box.addEventListener('pointerdown', function (e) { if (e.target.closest('a,button')) return; drag = { x: e.clientX }; moved = 0; box.style.cursor = 'grabbing'; });
    addEventListener('pointermove', function (e) {
      if (!drag) return; var dx = e.clientX - drag.x; drag.x = e.clientX; moved += Math.abs(dx);
      rot += dx * .006; v = dx * .006; kick();
    }, { passive: true });
    function up() { if (drag) { drag = null; box.style.cursor = ''; kick(); } }
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) kick(); }).observe(box);
    addEventListener('resize', kick);
    kick();
  }

  function scan() { document.querySelectorAll('[data-orbit]').forEach(start); }
  // a página do Claude Design remonta elementos; observa sempre, no máximo uma busca por quadro
  var pend = 0;
  new MutationObserver(function () { if (!pend) pend = requestAnimationFrame(function () { pend = 0; scan(); }); }).observe(document.documentElement, { childList: true, subtree: true });
  scan();
})();
