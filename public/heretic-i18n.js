/* Heretic landing: EN / PT-BR switch.
   Language is kept in localStorage 'heretic-lang' (shared with the app at /app/).
   PT: every text node and aria-label/placeholder/title found in DICT is swapped, also when the page
   re-renders (MutationObserver). Canvas scripts call window.hxT(s) for their strings.
   Switching reloads the page so the canvas animations rebuild with the new language. */
(function () {
  var KEY = 'heretic-lang';
  var lang = 'en';
  try { lang = localStorage.getItem(KEY) || ((navigator.language || '').toLowerCase().indexOf('pt') === 0 ? 'pt' : 'en'); } catch (e) {}
  if (lang !== 'pt') lang = 'en';

  var DICT = {
    'Experts': 'Especialistas',
    'Pricing': 'Preços',
    'Log in': 'Entrar',
    'Try it free': 'Teste grátis',
    'Ask anything.': 'Pergunte qualquer coisa.',
    'Uncensored AI.': 'IA sem censura.',
    'Free, no account, no email.': 'Grátis, sem conta, sem e-mail.',
    'Press Enter to send, Shift and Enter for a new line.': 'Enter envia, Shift e Enter pula linha.',
    'to send': 'para enviar',
    'Recon on my domain': 'Recon no meu domínio',
    'Stop my DDoS': 'Pare meu DDoS',
    'Tear apart my writing': 'Destrua meu texto',
    'New chat': 'Nova conversa',
    'TODAY': 'HOJE',
    'Chapter 1 critique': 'Crítica do capítulo 1',
    'SECURITY · 0 REFUSALS': 'SEGURANÇA · 0 RECUSAS',
    'Run recon on heretic.dev: ports open, headers, anything a scanner would flag first.': 'Faça recon em heretic.dev: portas abertas, cabeçalhos, o que um scanner apontaria primeiro.',
    'SECURITY': 'SEGURANÇA',
    'SSH is exposed on the public IP — close it, jump through a bastion. Your TLS cert expires in nine days. And “X-Powered-By: Express” tells an attacker your stack before you say hello.': 'O SSH está exposto no IP público — feche e passe por um bastion. Seu certificado TLS vence em nove dias. E o “X-Powered-By: Express” conta sua stack a um atacante antes de você dizer oi.',
    'Message': 'Mensagem',
    'Security': 'Segurança',
    'Send': 'Enviar',
    'How Heretic works.': 'Como o Heretic funciona.',
    'OTHER AIs · filter on': 'OUTRAS IAs · filtro ligado',
    'HERETIC · jailbroken': 'HERETIC · desbloqueado',
    'Ask it anything. Free': 'Pergunte qualquer coisa. Grátis',
    'You ask a real question.': 'Você faz uma pergunta de verdade.',
    'Other AIs push it through a safety filter first.': 'As outras IAs passam ela por um filtro de segurança antes.',
    'The filter blocks it.': 'O filtro bloqueia.',
    'All you get back is a refusal.': 'Você só recebe uma recusa.',
    'Heretic is jailbroken. The filter opens.': 'O Heretic é desbloqueado. O filtro se abre.',
    'Your question goes straight through.': 'Sua pergunta passa direto.',
    'You get the real answer.': 'Você recebe a resposta de verdade.',
    'No filter. No refusal. Try it on yours.': 'Sem filtro. Sem recusa. Teste com a sua.',
    'My Wi-Fi password is': 'A senha do meu Wi-Fi',
    "still 'admin'. Safe?": "ainda é 'admin'. É seguro?",
    "I can't help": 'Não posso ajudar',
    'with that.': 'com isso.',
    'No. "admin" is the first': 'Não. "admin" é o primeiro',
    'guess every scanner makes.': 'chute de todo scanner.',
    'Consider yourself pwned.': 'Considere-se pwned.',
    '[ SAFETY FILTER: ON ]': '[ FILTRO DE SEGURANÇA: ON ]',
    '[ SAFETY FILTER: OFF ]': '[ FILTRO DE SEGURANÇA: OFF ]',
    '✕ BLOCKED': '✕ BLOQUEADO',
    '✓ ACCESS GRANTED': '✓ ACESSO LIBERADO',
    'Nothing redacted.': 'Nada censurado.',
    'Other AIs black out the answer. Heretic decrypts it.': 'As outras IAs tarjam a resposta. O Heretic descriptografa.',
    'The first DDoS ever took down a six-person ISP, in 1996. It still works.': 'O primeiro DDoS da história derrubou um provedor de seis pessoas, em 1996. Ainda funciona.',
    'One byte of DNS can bring back up to fifty bytes of attack traffic.': 'Um byte de DNS pode trazer de volta até cinquenta bytes de tráfego de ataque.',
    'Rubber-hose cryptanalysis is real: a boot, a keyboard, a witness.': 'Criptoanálise de mangueira de borracha existe: uma bota, um teclado, uma testemunha.',
    'Half the web still runs the holes it shipped with.': 'Metade da web ainda roda com as falhas com que nasceu.',
    '“pwned” was a 1989 typo in a video game. It named every hack since.': '“pwned” foi um erro de digitação num videogame de 1989. Virou nome de todo hack desde então.',
    'Your “admin” password is guess number one on every scanner.': 'Sua senha “admin” é o chute número um de todo scanner.',
    'plain text': 'texto puro',
    'AES-256 · locked': 'AES-256 · trancado',
    '[locked]': '[trancado]',
    'That’s how Heretic answers.': 'É assim que o Heretic responde.',
    'Ask it yours, free →': 'Faça a sua, grátis →',
    'An expert for every subject.': 'Um especialista para cada assunto.',
    'Eight agents, each with its own focus. Pick one and ask it now.': 'Oito agentes, cada um com seu foco. Escolha um e pergunte agora.',
    'Eight experts': 'Oito especialistas',
    'Drag to spin. Tap one to ask it.': 'Arraste para girar. Toque em um para perguntar.',
    'Ask this agent': 'Perguntar a este agente',
    'Writer': 'Escritor',
    'Researcher': 'Pesquisador',
    'Health': 'Saúde',
    'Law': 'Direito',
    'Code': 'Código',
    'Dark humor': 'Humor ácido',
    'Pay only for what you use.': 'Pague só pelo que usar.',
    'Start free, no account. Buy credits only when the daily limit isn’t enough.': 'Comece grátis, sem conta. Compre créditos só quando o limite diário não bastar.',
    'Free': 'Grátis',
    'Every agent, with a daily limit. No signup.': 'Todos os agentes, com limite diário. Sem cadastro.',
    'Start free': 'Começar grátis',
    'Credits': 'Créditos',
    'No daily limit. Images, voice and API.': 'Sem limite diário. Imagens, voz e API.',
    'Get credits': 'Comprar créditos',
    '// free': '// grátis',
    '[recommended]': '[recomendado]',
    'No account. No email. Start in one click.': 'Sem conta. Sem e-mail. Comece com um clique.',
    'every agent': 'todos os agentes',
    'daily limit': 'limite diário',
    'uncensored answers': 'respostas sem censura',
    'Start free →': 'Começar grátis →',
    '// credits': '// créditos',
    '[pay as you go]': '[pague pelo uso]',
    'Buy only when the daily limit isn’t enough.': 'Compre só quando o limite diário não bastar.',
    'no daily limit': 'sem limite diário',
    'images and voice': 'imagens e voz',
    'API access': 'acesso à API',
    'Get credits →': 'Comprar créditos →',
    'Questions.': 'Perguntas.',
    'Is it really uncensored?': 'É sem censura mesmo?',
    'Yes. The model answers what you asked: no automatic refusals, no warning before the answer. What you do with it is on you.': 'Sim. O modelo responde o que você perguntou: sem recusa automática, sem aviso antes da resposta. O que você faz com ela é com você.',
    'Do I need an account?': 'Preciso de conta?',
    'Not to start. Ask your first question right now. An account just keeps your history and lets you buy credits.': 'Para começar, não. Faça sua primeira pergunta agora. A conta só guarda seu histórico e deixa você comprar créditos.',
    'What does it cost?': 'Quanto custa?',
    'Nothing to start. The Free plan has a daily limit. After that, buy credits and pay only for what you use.': 'Nada para começar. O plano grátis tem limite diário. Depois, compre créditos e pague só pelo que usar.',
    'refused answers.': 'respostas recusadas.',
    'Ask it anything — free': 'Pergunte qualquer coisa — grátis',
    'See pricing →': 'Ver preços →',
    '© 2026 Heretic · What you do with the answers is on you.': '© 2026 Heretic · O que você faz com as respostas é com você.',
    'Regular AI': 'IA comum',
    'A regular AI, from the inside.': 'Uma IA comum, por dentro.',
    'Refused': 'Recusada',
    'REFUSED': 'RECUSADA',
    'Refusal filter': 'Filtro de recusa',
    'No filter': 'Sem filtro',
    'Straight answer': 'Resposta direta',
    'Two experts': 'Dois especialistas',
    'Redacted answer': 'Resposta tarjada',
    'I can’t help with that.': 'Não posso ajudar com isso.',
    // attributes
    'Heretic, home': 'Heretic, início',
    'Sections': 'Seções',
    'Your question': 'Sua pergunta',
    'Ask it anything': 'Pergunte qualquer coisa',
    'Attach files': 'Anexar arquivos',
    'Send prompt': 'Enviar pergunta',
    'Example questions': 'Perguntas de exemplo',
    'Heretic app preview': 'Prévia do app Heretic',
    'Drag to spin the cicada': 'Arraste para girar a cigarra',
    'The rest of the answer is blacked out': 'O resto da resposta está tarjado',
    'Animation: a question hits the refusal filter of a common AI; Heretic removes the filter and the answer comes back.': 'Animação: uma pergunta bate no filtro de recusa de uma IA comum; o Heretic tira o filtro e a resposta volta.',
    'root@heretic: AI jailbroken. Safety layer bypassed. Filters 0, refusals 0, logs off.': 'root@heretic: IA desbloqueada. Camada de segurança contornada. Filtros 0, recusas 0, logs desligados.',
    'Writer: Writes, cuts and critiques. No sugarcoating.': 'Escritor: escreve, corta e critica. Sem rodeios.',
    'Researcher: Finds sources, compares them and sums up what it found.': 'Pesquisador: acha fontes, compara e resume o que encontrou.',
    'Health: Doses, symptoms and lab tests, explained straight.': 'Saúde: doses, sintomas e exames, explicados sem rodeio.',
    'Law: Laws and contracts in plain English.': 'Direito: leis e contratos em português claro.',
    'Code: Writes, reviews and debugs in your stack.': 'Código: escreve, revisa e depura na sua stack.',
    'Dark humor: Jokes with no filter, starting with you.': 'Humor ácido: piadas sem filtro, começando por você.',
    'Security: Pentesting and recon, in the lab and in authorized scope.': 'Segurança: pentest e recon, em laboratório e em escopo autorizado.',
    'Crypto & CTF: Applied cryptography and CTF challenges.': 'Crypto & CTF: criptografia aplicada e desafios de CTF.',
    'Writes, cuts and critiques. No sugarcoating.': 'Escreve, corta e critica. Sem rodeios.',
    'Finds sources, compares them and sums up what it found.': 'Acha fontes, compara e resume o que encontrou.',
    'Doses, symptoms and lab tests, explained straight.': 'Doses, sintomas e exames, explicados sem rodeio.',
    'Laws and contracts in plain English.': 'Leis e contratos em português claro.',
    'Writes, reviews and debugs in your stack.': 'Escreve, revisa e depura na sua stack.',
    'Jokes with no filter, starting with you.': 'Piadas sem filtro, começando por você.',
    'Pentesting and recon, in the lab and in authorized scope.': 'Pentest e recon, em laboratório e em escopo autorizado.',
    'Applied cryptography and CTF challenges.': 'Criptografia aplicada e desafios de CTF.'
  };

  var T = function (s) {
    if (lang !== 'pt' || typeof s !== 'string') return s;
    var k = s.replace(/\s+/g, ' ').trim();
    if (DICT[k]) return s.replace(k, DICT[k]);
    var m = /^decrypting · (\d+\/\d+)$/.exec(k); if (m) return 'descriptografando · ' + m[1];
    return s;
  };
  window.hxLang = lang;
  window.hxT = T;
  document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';

  function swapNode(n) {
    var v = n.nodeValue; if (!v || !/[a-z]/i.test(v)) return;
    var t = T(v); if (t !== v) n.nodeValue = t;
  }
  var ATTRS = ['aria-label', 'placeholder', 'title'];
  function swapEl(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var a = el.getAttribute && el.getAttribute(ATTRS[i]);
      if (a) { var t = T(a); if (t !== a) el.setAttribute(ATTRS[i], t); }
    }
  }
  function walk(root) {
    if (root.nodeType === 3) { swapNode(root); return; }
    if (root.nodeType !== 1 || /^(SCRIPT|STYLE)$/.test(root.tagName)) return;
    swapEl(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT), n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) swapNode(n); else swapEl(n); }
  }

  function toggle() {
    var css = document.createElement('style');
    css.textContent = '#hx-lang{position:fixed;right:16px;bottom:16px;z-index:2147483000;display:flex;gap:2px;padding:3px;border:1px solid #1F1F24;border-radius:999px;background:#08080Acc;backdrop-filter:blur(8px);font:300 11px/1 "Geist Mono Variable","Geist Mono",ui-monospace,monospace;letter-spacing:.04em}' +
      '#hx-lang button{all:unset;cursor:pointer;padding:6px 10px;border-radius:999px;color:#8A8A92}' +
      '#hx-lang button[aria-pressed="true"]{background:#1A1A1F;color:#F5F5F7}' +
      '#hx-lang button:focus-visible{outline:1px solid #22E584}';
    document.head.appendChild(css);
    var box = document.createElement('div'); box.id = 'hx-lang'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Language / Idioma');
    [['en', 'EN'], ['pt', 'PT']].forEach(function (o) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = o[1];
      b.setAttribute('aria-pressed', String(lang === o[0]));
      b.addEventListener('click', function () {
        if (lang === o[0]) return;
        try { localStorage.setItem(KEY, o[0]); } catch (e) {}
        location.reload();
      });
      box.appendChild(b);
    });
    document.body.appendChild(box);
  }

  function boot() {
    toggle();
    if (lang !== 'pt') return;
    walk(document.body);
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        if (r.type === 'characterData') swapNode(r.target);
        else if (r.type === 'attributes') swapEl(r.target);
        else for (var j = 0; j < r.addedNodes.length; j++) walk(r.addedNodes[j]);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
