// Monta public/ para o deploy:
//   /            landing desktop (código exportado do Claude Design)
//   /m.html      landing celular
//   /app/        chat (React + ryan-ui, build do Vite)
//   PWA: manifest, service worker, ícones.
// Uso: node scripts/build-site.mjs
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Acento da landing (dono, 16/11): vermelho carmim #F0335A (trocado do verde #22E584).
// accent() reescreve as duas paletas antigas (vermelho coral #FF6B6B e verde terminal #22E584)
// para o carmim, tanto em hex quanto no rgb usado nos canvas.
const ACCENT = "#F0335A", ACCENT_STRONG = "#FF6B86", ACCENT_RGB = "240,51,90";
const green = (t) => t
  .replace(/#FF6B6B/gi, ACCENT).replace(/#FF8A8A/gi, ACCENT_STRONG)
  .replace(/#22E584/gi, ACCENT).replace(/#4BF09E/gi, ACCENT_STRONG)
  .replace(/rgba\(255,107,107,/g, `rgba(${ACCENT_RGB},`)
  .replace(/rgba\(34,229,132,/g, `rgba(${ACCENT_RGB},`)
  .replace(/\b34,\s*229,\s*132\b/g, ACCENT_RGB);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUB = join(ROOT, "public");
const SITE = join(ROOT, "site");
const LAND = join(SITE, "landing");

rmSync(PUB, { recursive: true, force: true });
mkdirSync(PUB, { recursive: true });

// 1) chat
execSync("npx vite build --config vite.heretic.config.ts", { cwd: join(ROOT, "ryan-ui"), stdio: "inherit" });

// 2) landing: design system, vendor, scripts
cpSync(join(LAND, "_ds"), join(PUB, "_ds"), { recursive: true });
cpSync(join(LAND, "vendor"), join(PUB, "vendor"), { recursive: true });
cpSync(join(LAND, "heretic-sculptures.js"), join(PUB, "heretic-sculptures.js"));
// heretic-cpu.js é declarado mais abaixo (THEME); copiado no fim com o tema aplicado.
cpSync(join(LAND, "heretic-cpu.js"), join(PUB, "heretic-cpu.js"));
writeFileSync(join(PUB, "heretic-nebula.js"), green(readFileSync(join(LAND, "heretic-nebula.js"), "utf8")));
writeFileSync(join(PUB, "heretic-orbit.js"), green(readFileSync(join(LAND, "heretic-orbit.js"), "utf8")));
// imagens que a landing verde usa (logo e máscara dos especialistas)
cpSync(join(LAND, "uploads"), join(PUB, "uploads"), { recursive: true });
cpSync(join(LAND, "heretic-hack.js"), join(PUB, "heretic-hack.js"));
// estes têm o acento fixo no código → passam pelo accent() (verde/coral antigos → carmim)
writeFileSync(join(PUB, "heretic-i18n.js"), green(readFileSync(join(LAND, "heretic-i18n.js"), "utf8")));
writeFileSync(join(PUB, "heretic-fx.js"), green(readFileSync(join(LAND, "heretic-fx.js"), "utf8")));
writeFileSync(join(PUB, "heretic-flow.js"), green(readFileSync(join(LAND, "heretic-flow.js"), "utf8")));
writeFileSync(join(PUB, "heretic-sections.js"), green(readFileSync(join(LAND, "heretic-sections.js"), "utf8")));
const support = readFileSync(join(LAND, "support.js"), "utf8")
  .replaceAll("https://unpkg.com/@babel/standalone@7.29.0/babel.min.js", "/vendor/babel.min.js")
  .replaceAll("https://unpkg.com/react@18.3.1/umd/react.production.min.js", "/vendor/react.production.min.js")
  .replaceAll("https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js", "/vendor/react-dom.production.min.js");
if (support.includes("unpkg.com")) console.warn("aviso: support.js ainda referencia unpkg.com");
writeFileSync(join(PUB, "support.js"), support);

// 3) PWA
cpSync(join(SITE, "icons"), join(PUB, "icons"), { recursive: true });
cpSync(join(SITE, "manifest.webmanifest"), join(PUB, "manifest.webmanifest"));
// carimbo do build: renova o cache do service worker e dos scripts da raiz
const STAMP = Date.now().toString(36);
writeFileSync(join(PUB, "sw.js"), readFileSync(join(SITE, "sw.js"), "utf8").replace("__BUILD__", STAMP));
cpSync(join(SITE, "cursor.js"), join(PUB, "cursor.js"));

// 4) páginas da landing com injeções
const HEAD = `<title>Heretic — Uncensored AI</title>
<meta name="description" content="Uncensored AI that answers anything. Free to start, no account, no email.">
<meta name="theme-color" content="#040405">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Heretic">
<script src="/cursor.js" defer></script>
<script src="/heretic-i18n.js" defer></script>
<script src="/heretic-fx.js" defer></script>
<script src="/heretic-flow.js" defer></script>
<script src="/heretic-sections.js" defer></script>
<link rel="preconnect" href="https://api.fontshare.com" crossorigin>
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=switzer@300,400,500,600&display=swap">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif&display=swap">
<style>/* tipografia igual ao drael.sh (dono, 15/11): Instrument Serif 400 nos títulos, Switzer 400/500 no texto, Geist Mono 400 nos rótulos */
:root,html:root[data-brand]{--font-body:'Switzer',ui-sans-serif,system-ui,sans-serif!important;--font-display:'Instrument Serif',Georgia,serif!important}
body,[style*="Geist Variable"],[style*="Inter Variable"],[style*="Switzer"],button,input,textarea{font-family:'Switzer',ui-sans-serif,system-ui,sans-serif!important;letter-spacing:-.02em}
[style*="font:600"],[style*="font:700"],[style*="font-weight:600"],[style*="font-weight:700"],b,strong{font-weight:500!important}
code,pre,kbd,[style*="Geist Mono"],[data-boot]{font-family:'Geist Mono Variable','Geist Mono',ui-monospace,SFMono-Regular,Menlo,monospace!important;font-weight:300!important;letter-spacing:-.01em}
body h1,body h1[style]{font-family:'Instrument Serif',Georgia,serif!important;font-weight:400!important;font-size:clamp(56px,7.2vw,104px)!important;line-height:1!important;letter-spacing:-.02em!important;text-shadow:none!important}
body h2,body h2[style]{font-family:'Instrument Serif',Georgia,serif!important;font-weight:400!important;font-size:clamp(44px,5.2vw,72px)!important;line-height:1!important;letter-spacing:-.03em!important}
body h1 *,body h2 *{font-family:inherit!important;font-weight:inherit!important;letter-spacing:inherit!important}
body h1 [style*="Geist Mono"],body h1 [style*="Geist Mono"] *{font-family:'Instrument Serif',Georgia,serif!important;font-weight:400!important;letter-spacing:-.02em!important;font-size:1em!important;line-height:1!important}
/* contraste de pesos (UI/UX pro): texto fino, destaque médio, palavra-chave e números grossos */
body p,body li,body dd,[data-flow-cap],[data-lantern-text],nav a,header a{font-weight:300!important}
body p [style*="color:#F5F5F7"],body p [style*="color:var(--foreground)"],body p [data-decrypt],body p b,body p strong{font-weight:500!important;color:#FFFFFF!important}
button,[role="button"],a[data-flow-cta],[data-orbit-use]{font-weight:500!important}
body h1>span[data-hero-word],body h1>span[data-hero-word] *{display:none!important}
body h1>span:last-child:not([data-hero-word]),body h1>span:last-child:not([data-hero-word]) *{font-family:'Switzer',ui-sans-serif,system-ui,sans-serif!important;font-style:normal!important;font-weight:600!important;letter-spacing:-.05em!important;font-size:.9em!important;color:var(--accent)!important}
[data-zero-num],[data-zero-num] *{font-family:'Switzer',ui-sans-serif,system-ui,sans-serif!important;font-weight:600!important;letter-spacing:-.06em!important}
[data-fx-kicker],[data-flow-tag]{font-weight:300!important}
/* prata e preto; verde só como acento (~10%) */
body h1,body h1>span:first-child,body h2{background:linear-gradient(180deg,#FFFFFF 15%,#B9B9C2 90%);-webkit-background-clip:text;background-clip:text;color:transparent!important;-webkit-text-fill-color:transparent}
body h2 *{-webkit-text-fill-color:transparent}
[data-orbit-name]{font-family:'Instrument Serif',Georgia,serif!important;font-weight:400!important;font-size:44px!important;letter-spacing:-.02em!important}
/* microinterações (Framer): mola curta ao passar e ao tocar */
button{transition:transform .22s cubic-bezier(.34,1.56,.64,1),background-color .2s ease,box-shadow .2s ease,color .2s ease}
button:hover{transform:translateY(-1px)}
button:active{transform:translateY(0) scale(.96);transition-duration:.08s}
[data-card]{transition:transform .35s cubic-bezier(.34,1.56,.64,1),box-shadow .3s ease!important}
[data-card]:hover{transform:translateY(-4px)}
[data-orbit-use]{transition:transform .22s cubic-bezier(.34,1.56,.64,1)}
[data-orbit-use]:hover{transform:translateY(-1px)}[data-orbit-use]:active{transform:scale(.96)}
@media (prefers-reduced-motion: reduce){button,button:hover,button:active,[data-card],[data-card]:hover{transform:none!important;transition:none!important}}</style>
<style>/* darkness: branco + vermelho claro (10%) só no botão principal e no segmento ativo */
button[class*="_primary_"]{background:#FF6B6B!important;color:#0A0A0B!important;box-shadow:0 10px 30px -12px #FF6B6B80!important}
button[class*="_primary_"]:hover{background:linear-gradient(180deg,#FFFFFF,#E2E2E8 55%,#B4B4BE)!important}
button[class*="_segment_"][aria-checked="true"],button[class*="_segment_"][aria-checked="true"] *{color:#F5F5F7!important}</style>`;

const redirect = (toMobile) => `<script>(function(){var m=matchMedia('(max-width: 820px)').matches;${toMobile
  ? "if(m)location.replace('/m.html'+location.search+location.hash);"
  : "if(!m)location.replace('/'+location.search+location.hash);"}})();</script>`;

// Botões da landing levam ao app; a pergunta digitada no topo abre o app com ela.
const WIRE = `<script>(function(){
var CTA=/^(try it free|start free|log in|get credits|ask it anything[ .—–-]*free|try it free, no signup)$/i;
function label(el){return (el.getAttribute('aria-label')||el.textContent||'').replace(/\\s+/g,' ').trim();}
function heroInput(){return document.querySelector('textarea[aria-label="Your question"],input[aria-label="Your question"],textarea[data-input]');}
function goApp(q){location.href='/app/'+(q?('?q='+encodeURIComponent(q)):'');}
document.addEventListener('click',function(e){
  var path=e.composedPath?e.composedPath():[e.target];
  for(var i=0;i<path.length;i++){var el=path[i];if(!el||!el.tagName)continue;
    if(el.tagName==='BUTTON'||el.tagName==='A'){var t=label(el);
      if(CTA.test(t)){e.preventDefault();e.stopPropagation();goApp();return;}
      if(/^(send|send prompt)$/i.test(t)){var h=heroInput();if(h&&h.value.trim()){e.preventDefault();e.stopPropagation();goApp(h.value.trim());}return;}
      return;}}
},true);
document.addEventListener('keydown',function(e){
  if(e.key!=='Enter'||e.shiftKey)return;var el=e.target;
  if(el&&(el.tagName==='TEXTAREA'||el.tagName==='INPUT')&&el.value&&el.value.trim()&&el===heroInput()){e.preventDefault();e.stopPropagation();goApp(el.value.trim());}
},true);
if('serviceWorker' in navigator&&!/^(localhost|127\\.0\\.0\\.1)$/.test(location.hostname)){addEventListener('load',function(){navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(function(){});});}
})();</script>`;

// A página de celular foi feita para rodar dentro da moldura de iPhone do Claude Design:
// a raiz tem 390 px e height:100% com overflow:hidden. Fora da moldura, passa a altura da tela pela cadeia.
const MOBILE_FIT = `<style>html,body,body>div,body>div>.sc-host{height:100%;margin:0}
body>div>.sc-host>div{width:100%!important;max-width:none!important}</style>`;

// Tokens de cor da landing desktop (carmim etc.). A página de celular herdava isso da moldura.
const TOKENS = (readFileSync(join(LAND, "landing.dc.html"), "utf8")
  .match(/html:root\[data-brand="aurabot"\]\[data-theme="dark"\]\{[^}]*\}/) || [""])[0];
if (!TOKENS) throw new Error("não achei os tokens de cor na landing desktop");

// Tema darkness (dono, 15/11): preto + branco; vermelho claro #FF6B6B só como acento (10%). Prata rejeitado.
const THEME = [
  [/#9B111E/gi, "#FF6B6B"], [/#C8102E/gi, "#FF8A8A"],
  [/--accent-foreground:#F5F5F5/g, "--accent-foreground:#0A0A0B"], [/--lime-ink:#F5F5F5/g, "--lime-ink:#0A0A0B"],
  [/#08080A/gi, "#040405"], [/#0E0E10/gi, "#0A0A0C"], [/#131316/gi, "#0E0E11"], [/#17171A/gi, "#121215"],
  // paleta grafite/roxo/lima (outra conversa) → darkness
  [/--accent-foreground:#FFFFFF/gi, "--accent-foreground:#0A0A0B"],
  [/#6C3BFF/gi, "#FF6B6B"], [/#8460FF/gi, "#FF8A8A"], [/#7C5CFF/gi, "#FF6B6B"], [/#C6F432/gi, "#FF6B6B"], [/#D4FF4A/gi, "#FF8A8A"], [/#D6D6DC/gi, "#FF6B6B"],
  [/#1E1E22/gi, "#040405"], [/#242429/gi, "#0A0A0C"], [/#2A2A30/gi, "#0E0E11"], [/#2F2F36/gi, "#121215"], [/#38383F/gi, "#1A1A1E"],
  [/#303037/gi, "#19191D"], [/#3C3C44/gi, "#26262B"],
];
const themed = (txt) => THEME.reduce((t, [re, to]) => t.replace(re, to), txt);
const DARKNESS = `<style>
/* tema hacker: vinheta, linhas de monitor CRT, glitch nos títulos, cursor de terminal */
body::before{content:"";position:fixed;inset:0;z-index:2147483000;pointer-events:none;background:radial-gradient(130% 95% at 50% 0%,transparent 55%,#00000080 100%)}
body::after{content:"";position:fixed;inset:0;z-index:2147483001;pointer-events:none;background:repeating-linear-gradient(0deg,#ffffff04 0 1px,transparent 1px 3px)}
h2{filter:drop-shadow(0 12px 30px #000)}
h2,h2 *{color:#F5F5F7}
h2::before{content:"> ";font-family:'Geist Mono Variable',ui-monospace,monospace;font-weight:500;color:#FF6B6B;-webkit-text-fill-color:#FF6B6B}
body h1 [style*="Instrument Serif"]::after{content:"_";display:inline-block;margin-left:.06em;color:#FF6B6B;animation:hxBlink 1s steps(1) infinite}
@keyframes hxBlink{50%{opacity:0}}
@keyframes hxGlitch{0%,95%,100%{transform:none;text-shadow:none}96%{transform:translate(-2px,1px) skewX(-4deg);text-shadow:-4px 0 #FF6B6B90,4px 0 #ffffff40}97%{transform:translate(2px,-1px);text-shadow:4px 0 #FF6B6B90}98%{transform:none;text-shadow:none}}
[data-boot]{margin:0 0 24px;min-height:1.6em;font:300 13px/1.6 'Geist Mono Variable',ui-monospace,monospace;color:#7C7C86;text-align:left;white-space:pre;display:inline-block}
[data-boot] b{color:#FF6B6B;font-weight:600}
[data-boot] i{font-style:normal;color:#F5F5F7}
@media (prefers-reduced-motion: reduce){h1,body::after,body h1 [style*="Instrument Serif"]::after{animation:none}}
</style>`;

function page(src, out, toMobile) {
  let html = readFileSync(join(LAND, src), "utf8");
  html = themed(html);
  html = html.replace('<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' + HEAD + "\n" + redirect(toMobile)
    + (toMobile ? "" : `\n${MOBILE_FIT}`));
  if (!toMobile) html = html.replace("</helmet>", `<style>${themed(TOKENS)}</style>\n</helmet>`);
  html = html.replace("</helmet>", DARKNESS + "\n</helmet>");
  html = html.replace('<html>', '<html lang="en" data-brand="aurabot" data-theme="dark" style="background:#040405">');
  html = html.replace("</body>", WIRE + "\n</body>");
  html = html.replace(/src="(\/?)((?:heretic-[\w-]+|support|cursor)\.js)"/g, (m, sl, f) => `src="${sl}${f}?v=${STAMP}"`);
  writeFileSync(join(PUB, out), green(html));
}
page("landing.dc.html", "index.html", true);
page("mobile.dc.html", "m.html", false);
if (existsSync(join(LAND, "heretic-cpu.js"))) writeFileSync(join(PUB, "heretic-cpu.js"), themed(readFileSync(join(LAND, "heretic-cpu.js"), "utf8").replace(/#6C3BFF/gi, "#F5F5F7")));
writeFileSync(join(PUB, "heretic-sculptures.js"), themed(readFileSync(join(LAND, "heretic-sculptures.js"), "utf8")));
// módulo opcional "user" que as páginas do Claude Design tentam importar
writeFileSync(join(PUB, "user"), "/* vazio */\n");

for (const f of ["index.html", "m.html", "app/index.html", "sw.js", "manifest.webmanifest", "support.js"]) {
  if (!existsSync(join(PUB, f))) throw new Error(`faltou ${f}`);
}
console.log("site pronto em public/");
