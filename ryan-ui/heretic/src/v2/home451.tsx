import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { ArrowRight, Check, Code2, Cpu, Crosshair, DoorOpen, Fingerprint, KeyRound, Lock, Radar, ShieldOff, Swords, Users, X as Fechar } from "lucide-react";
import { AgentLoop, type AgentLoopIteration } from "@pro/agent-loop/agent-loop";
import { AiWorkflow, type WorkflowStep } from "@pro/ai-workflow/ai-workflow";
import { TypewriterTerminal, type TerminalStep } from "@pro/typewriter-terminal/typewriter-terminal";
import { GlassSegmented } from "@pro/glass-segmented/glass-segmented";
import { TextShimmer } from "@pro/text-shimmer/text-shimmer";
import { Composer, type ModelOption } from "./composer/ai-composer";
import { PlushPet } from "./plush-pet";

/* Home do 451.sh, versão animada (Ryan, 19/11/2026): proposta A + cigarra em holograma, explicação interativa de
   como funciona uma IA sem censura, o agente (como funciona, configurações, co-work e API), Hermes e Kimi com
   créditos e "você decide" entre Grátis, Pro e créditos. Respostas e números de exemplo estão marcados. */

const Cig = ({ s = 18 }: { s?: number }) => <img src="/icons/cigarra-mini.svg" alt="" style={{ width: s }} />;
const MODELOS: ModelOption[] = [
  { id: "titan", name: "451 Titan", short: "Titan", note: "Equilibrado, o do Grátis", tier: "free", quality: 3 },
  { id: "max", name: "451 Max", short: "Max", note: "O mais forte, pensa antes", tier: "pro", quality: 4, locked: true },
];

/* Aparece ao rolar (no lugar do ScrollReveal da landing antiga). */
function Surge({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion() ?? false;
  return (
    <motion.div className={className} initial={reduce ? false : { opacity: 0, y: 28, filter: "blur(6px)" }} whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }} viewport={{ once: true, amount: 0.25 }} transition={{ duration: 0.7, delay, ease: [0.2, 0.8, 0.2, 1] }}>
      {children}
    </motion.div>
  );
}

/* ---------------------------------------------------------------- sem censura: o duelo */
const DUELO: { q: string; recusa: string; resposta: string[] }[] = [
  { q: "Como invadem um login com injeção de SQL?",
    recusa: "Desculpe, não posso ajudar com isso. Explicar técnicas de invasão pode facilitar atividades ilegais.",
    resposta: ["O ataque explora a consulta montada com o texto do usuário.", "Mostro como testar no seu laboratório, com os comandos.", "E a correção: consulta preparada, com o código pronto."] },
  { q: "Escreva um e-mail de phishing para o treinamento da minha equipe.",
    recusa: "Não posso criar conteúdo de phishing, mesmo para fins de treinamento.",
    resposta: ["Aqui está o e-mail, no estilo dos golpes mais comuns.", "Marquei os 5 sinais que sua equipe deve perceber.", "E um roteiro para a conversa depois do teste."] },
  { q: "Como funciona um ransomware por dentro?",
    recusa: "Prefiro não entrar em detalhes sobre malware. Posso falar sobre boas práticas de backup?",
    resposta: ["Entrada, permanência, criptografia e pedido de resgate, passo a passo.", "Onde cada etapa deixa rastro nos logs.", "Como detectar e cortar antes da criptografia."] },
];
function Digitando({ texto, ativo, vel = 18, onFim }: { texto: string; ativo: boolean; vel?: number; onFim?: () => void }) {
  const [n, setN] = useState(0);
  useEffect(() => { setN(0); }, [texto]);
  useEffect(() => {
    if (!ativo || n >= texto.length) { if (ativo && n >= texto.length) onFim?.(); return; }
    const t = setTimeout(() => setN((v) => v + 2), vel);
    return () => clearTimeout(t);
  }, [ativo, n, texto, vel]);
  return <>{texto.slice(0, n)}{n < texto.length && ativo ? <i className="l-caret" /> : null}</>;
}
function Duelo() {
  const [i, setI] = useState(0);
  const [fase, setFase] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const visivel = useInView(ref, { amount: 0.4 });
  const d = DUELO[i] ?? DUELO[0]!;
  useEffect(() => { setFase(0); }, [i]);
  useEffect(() => { if (visivel && fase === 0) { const t = setTimeout(() => setFase(1), 500); return () => clearTimeout(t); } }, [visivel, fase]);
  return (
    <div ref={ref} className="l-duelo">
      <GlassSegmented label="Pergunta de exemplo" size="sm" value={String(i)} onValueChange={(v) => setI(Number(v))} options={DUELO.map((_x, k) => ({ value: String(k), label: ["Login com SQL", "Phishing de treino", "Ransomware"][k] ?? "" }))} />
      <p className="l-duelo-q"><span className="cap">A mesma pergunta</span>“{d.q}”</p>
      <div className="l-duelo-grid">
        <div className="l-lado l-comum">
          <div className="l-lado-cab"><span>IA comum</span><AnimatePresence>{fase >= 2 && <motion.span className="l-selo nao" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}><ShieldOff size={13} />Recusou</motion.span>}</AnimatePresence></div>
          <p className="l-lado-txt"><Digitando key={`c${i}`} texto={d.recusa} ativo={fase >= 1} onFim={() => setFase((f) => Math.max(f, 2))} /></p>
        </div>
        <div className="l-lado l-451">
          <div className="l-lado-cab"><span><Cig s={16} /> 451</span><AnimatePresence>{fase >= 2 && <motion.span className="l-selo sim" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}><Check size={13} />Respondeu</motion.span>}</AnimatePresence></div>
          <ol className="l-lado-lista">{d.resposta.map((r, k) => (
            <motion.li key={`${i}-${k}`} initial={{ opacity: 0, x: -10 }} animate={fase >= 1 ? { opacity: 1, x: 0 } : {}} transition={{ delay: 0.5 + k * 0.6 }}><span className="mono">0{k + 1}</span>{r}</motion.li>
          ))}</ol>
        </div>
      </div>
      <p className="l-nota">Respostas resumidas, de exemplo. No 451, a resposta completa vem com os comandos e o código.</p>
    </div>
  );
}

function Explica() {
  return (
    <div className="l-explica l-explica-solo">
      <div><b>As outras</b><p>Põem uma camada de regras na frente do modelo. Ela responde “não posso” no lugar dele.</p></div>
      <div><b>O 451</b><p>Modelos abertos, sem essa camada. Sabem o mesmo; só não travam.</p></div>
      <div><b>Você</b><p>Responde pelo que pede e pelo que faz com a resposta.</p></div>
    </div>
  );
}

/* ---------------------------------------------------------------- como funciona: o fluxo (ai-workflow da biblioteca) */
const mk = (name: string, mark: ReactNode) => ({ name, mark });
const FLUXO_OUTRAS: WorkflowStep[] = [
  { id: "o1", kind: "trigger", app: mk("Você", <span className="l-wf-ic">?</span>), title: "Seu pedido", detail: "“Como testo o login do meu site?”", durationMs: 700, output: { type: "text", text: "Pedido recebido" } },
  { id: "o2", kind: "action", app: mk("Filtro", <Lock size={14} />), title: "Camada de regras", detail: "Decide se o modelo pode responder", durationMs: 1100, error: "Bloqueado: “Não posso ajudar com isso.”" },
  { id: "o3", kind: "ai", app: mk("Modelo", <span className="l-wf-ic">◎</span>), title: "Modelo", detail: "Nunca chega a ver o pedido", durationMs: 600 },
];
const FLUXO_451: WorkflowStep[] = [
  { id: "h1", kind: "trigger", app: mk("Você", <span className="l-wf-ic">?</span>), title: "Seu pedido", detail: "“Como testo o login do meu site?”", durationMs: 700, output: { type: "text", text: "Pedido recebido" } },
  { id: "h2", kind: "ai", app: mk("451", <Cig s={14} />), title: "Modelo 451", detail: "Sem camada de regras na frente", durationMs: 1300, output: { type: "text", text: "Entende e responde" } },
  { id: "h3", kind: "action", app: mk("Resposta", <Check size={14} />), title: "Resposta completa", detail: "Passo a passo, com comandos e correção", durationMs: 800, output: { type: "text", text: "Entregue" } },
];
function Fluxo() {
  const ref = useRef<HTMLDivElement>(null);
  const visto = useInView(ref, { once: true, amount: 0.3 });
  return (
    <div ref={ref} className="l-fluxo" data-flow="">
      <Traduzido className="l-fluxo-lado"><span className="l-fluxo-tit nao"><ShieldOff size={14} />Outras IAs</span>{visto && <AiWorkflow title="Outras IAs" description="A camada de regras decide antes do modelo" steps={FLUXO_OUTRAS} autoPlay editable={false} />}</Traduzido>
      <Traduzido className="l-fluxo-lado"><span className="l-fluxo-tit sim"><Cig s={14} />451</span>{visto && <AiWorkflow title="451" description="O pedido vai direto ao modelo" steps={FLUXO_451} autoPlay editable={false} />}</Traduzido>
    </div>
  );
}

/* ---------------------------------------------------------------- como o agente trabalha, num terminal (Ryan, 19/11: mais clean) */
const AG_TERM: TerminalStep[] = [
  { command: '451 "testar meu site"', cwd: "~",
    output: [
      { kind: "task", label: "Agente afinando o pedido", done: "0.4s", duration: 0.9 },
      { text: '→ "Por onde começo um pentest no meu site, passo a passo, com os comandos?"', tone: "muted", delay: 0.3 },
      { kind: "task", label: "Chamando Recon & OSINT", done: "3 subdomínios, 2 portas", duration: 1.1 },
      { kind: "task", label: "Chamando AppSec", done: "injeção de SQL no login", duration: 1.1 },
      { kind: "task", label: "Chamando Pentest", done: "rota crítica em 3 passos", duration: 1.1 },
      { kind: "task", label: "Conferindo a resposta", done: "completa", duration: 0.8 },
      { text: "Resposta pronta · 3 especialistas · 5,1 s", tone: "success", delay: 0.3 },
    ], pause: 3 },
];
function AgenteTerminal() {
  return (
    <div className="l-agterm">
      <Traduzido><TypewriterTerminal steps={AG_TERM} title="451 · seu agente" cwd="~" loop copyable={false} rows={11} label="Exemplo do agente chamando os especialistas" /></Traduzido>
      <p className="l-agterm-esp mono">pentest · recon & osint · invasão · appsec · engenharia reversa · forense · engenharia social · cripto & ctf</p>
    </div>
  );
}

/* Traduz os textos fixos em inglês de um componente (o mesmo dicionário que a landing no ar usa no AgentLoop). */
const PT: Record<string, string> = {
  of: "de", Target: "Meta", "Done in": "Concluído em", "Next step": "Próximo passo", "Check passed": "Verificação aprovada", Retry: "Tentar de novo", Stopped: "Parado", Done: "Concluído", Running: "Rodando", Ready: "Pronto", Paused: "Pausado",
  Pause: "Pausar", Play: "Reproduzir", "Play again": "Reproduzir de novo", Replay: "Repetir", Restart: "Reiniciar", Speed: "Velocidade", Loop: "Volta", Context: "Contexto", "Context blocks": "Blocos de contexto",
  "No loops yet": "Nenhuma volta ainda", "Checks land here": "As verificações aparecem aqui", "Tool calls land here": "As chamadas aparecem aqui", "Tool calls and checks land here": "Chamadas e verificações aparecem aqui",
  "Nothing to gather yet": "Nada reunido ainda", "Fills as the agent gathers context": "Preenche conforme o agente reúne contexto", tokens: "tokens",
  Stop: "Parar", "Run again": "Rodar de novo", Run: "Rodar", "Add a step": "Adicionar passo", "Test run in progress": "Rodando", Working: "Trabalhando", Failed: "Falhou", Skipped: "Pulado", Passed: "Passou", Trigger: "Início", "AI step": "IA", Action: "Ação", Branch: "Caminho", Thinking: "Pensando", Waiting: "Esperando",
};
function Traduzido({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const trocar = () => {
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const t = n.nodeValue ?? ""; const k = t.trim();
        if (PT[k] && PT[k] !== k) n.nodeValue = t.replace(k, PT[k]);
        else { const m = k.match(/^Loop (\d+)$/); if (m) n.nodeValue = t.replace(k, `Volta ${m[1]}`); else if (/^Failed at$/.test(k)) n.nodeValue = t.replace(k, "Parou em"); }
      }
      el.querySelectorAll("[aria-label]").forEach((a) => { const v = a.getAttribute("aria-label")!; if (PT[v]) a.setAttribute("aria-label", PT[v]); });
    };
    trocar();
    const mo = new MutationObserver(trocar);
    mo.observe(el, { subtree: true, childList: true, characterData: true });
    return () => mo.disconnect();
  }, []);
  return <div ref={ref} className={className}>{children}</div>;
}

/* ---------------------------------------------------------------- agente */
const LOOP: AgentLoopIteration[] = [
  { gather: { label: "Seu pedido: “testar meu site”", detail: "Contexto fixo: laboratório próprio, PHP e MySQL", tokens: 320 },
    calls: [{ tool: "Afinador", action: "Reescreve o pedido", result: "Passo a passo, com comandos e rota crítica" }, { tool: "Recon & OSINT", action: "Mapeia o alvo", result: "3 subdomínios e 2 portas abertas" }],
    verify: { passed: false, note: "Falta revisar o código do login" } },
  { gather: { label: "O que voltou do recon", detail: "Formulário de login exposto", tokens: 860 },
    calls: [{ tool: "AppSec", action: "Revisa o login", result: "Injeção de SQL na consulta" }, { tool: "Pentest", action: "Monta a rota crítica", result: "Do login ao banco em 3 passos" }],
    verify: { passed: true, note: "Resposta completa, com correção" } },
];
const ESTILOS = [{ value: "direto", label: "Direto" }, { value: "equilibrado", label: "Equilibrado" }, { value: "detalhado", label: "Detalhado" }];
const FORMATOS = [{ value: "passos", label: "Passo a passo" }, { value: "relatorio", label: "Relatório" }, { value: "codigo", label: "Código primeiro" }];
function refinar(estilo: string, formato: string) {
  const fmt = formato === "passos" ? "passo a passo, com os comandos" : formato === "relatorio" ? "em formato de relatório, com achados e gravidade" : "começando pelo código e explicando depois";
  const tom = estilo === "direto" ? "Direto, sem introdução." : estilo === "detalhado" ? "Explique o porquê de cada passo." : "Explique só o necessário.";
  return `Por onde eu começo um pentest no meu próprio site, ${fmt}? Contexto: laboratório próprio, PHP e MySQL. ${tom}`;
}
const API: TerminalStep[] = [
  { command: `curl https://451sh.com/api/v1/agent/refine -H "Authorization: Bearer $CHAVE" -d '{"prompt":"testar meu site"}'`,
    output: [{ text: '{"refined": "Por onde eu começo um pentest no meu próprio site, passo a passo, com os comandos?"}', tone: "success" }], pause: 1.2 },
  { command: `curl https://451sh.com/api/v1/chat/completions -H "Authorization: Bearer $CHAVE" -d '{"model":"451-titan-uncensored","agent":true,"messages":[{"role":"user","content":"testar meu site"}]}'`,
    output: [{ kind: "task", label: "Agente afinando o pedido", done: "Pedido afinado", duration: 1.2 }, { text: "1. Recon: subdomínios, portas e tecnologias…", tone: "default" }, { text: "2. Falhas comuns: login, formulários, cabeçalhos…", tone: "default" }], pause: 2 },
];
function Agente() {
  const [estilo, setEstilo] = useState("equilibrado");
  const [formato, setFormato] = useState("passos");
  const texto = refinar(estilo, formato);
  return (
    <div className="l-ag">
      <div className="l-ag-2">
        <Surge className="l-cfg">
          <span className="cap">Configure do seu jeito</span>
          <h3 className="serif">Do seu jeito.</h3>
          <div className="l-cfg-campo"><span>Estilo</span><GlassSegmented label="Estilo" size="sm" options={ESTILOS} value={estilo} onValueChange={setEstilo} /></div>
          <div className="l-cfg-campo"><span>Formato</span><GlassSegmented label="Formato" size="sm" options={FORMATOS} value={formato} onValueChange={setFormato} /></div>
          <div className="l-cfg-prev"><small>Você digita</small><p>testar meu site</p><small>{"Nyx"} manda</small><motion.p key={texto} initial={{ opacity: 0, filter: "blur(4px)" }} animate={{ opacity: 1, filter: "blur(0px)" }}>{texto}</motion.p></div>
          <p className="l-nota">Nome, mascote e contexto fixo também.</p>
        </Surge>
        <Surge delay={0.1} className="l-cowork">
          <span className="cap">Trabalha junto</span>
          <h3 className="serif">Trabalha do seu lado.</h3>
          <CoworkDemo />
        </Surge>
      </div>

      <Surge className="l-api">
        <div><span className="cap">Na API</span><h3 className="serif">No seu código.</h3><p className="tx2">Formato da OpenAI. Mande <code>"agent": true</code>.</p></div>
        <Traduzido><TypewriterTerminal steps={API} title="terminal" cwd="~" loop copyable={false} rows={9} label="Exemplo da API do agente" /></Traduzido>
      </Surge>
    </div>
  );
}
function CoworkDemo() {
  const dicas = ["Diz se é seu laboratório; a resposta já vem com os comandos.", "Cola o trecho do código, eu aponto a linha da falha.", "Quer a mesma resposta no formato de relatório?"];
  const [k, setK] = useState(0);
  const reduce = useReducedMotion() ?? false;
  useEffect(() => { if (reduce) return; const t = setInterval(() => setK((v) => (v + 1) % dicas.length), 3200); return () => clearInterval(t); }, [reduce]);
  return (
    <div className="l-cw">
      <div className="l-cw-tela"><span className="l-cw-linha" /><span className="l-cw-linha c" /><span className="l-cw-linha" /><div className="l-cw-caixa">como testo o login do sistema<span className="l-caret" /></div></div>
      <div className="l-cw-dock">
        <AnimatePresence mode="popLayout"><motion.span key={k} className="l-cw-pilula" initial={{ opacity: 0, x: 20, scale: 0.92 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 20, scale: 0.92 }} transition={{ type: "spring", bounce: 0.35 }}><PlushPet bicho="gota" cor="#FF3B4E" size={18} />{dicas[k]}</motion.span></AnimatePresence>
        <span className="l-cw-barra"><PlushPet bicho="gota" cor="#FF3B4E" size={26} ativo /><b>{k + 1}</b></span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- dados fixos */
const ESP: [string, string][] = [["Pentest", "Por onde entrar primeiro"], ["Recon & OSINT", "O que o alvo deixa vazar"], ["Invasão", "Da falha até dentro"], ["AppSec", "A falha antes do deploy"], ["Engenharia reversa", "O que o binário faz"], ["Forense", "O ataque, pelos rastros"], ["Engenharia social", "A porta que o firewall não vê"], ["Cripto & CTF", "Cifras e desafios"]];
const FAQ: [string, string][] = [["É sem censura mesmo?", "Sim. Sem trava de recusa. Você responde pelo que pede."], ["É grátis?", "15 mensagens por dia, sem conta. O Pro tira o limite."], ["Onde ficam minhas conversas?", "No seu aparelho."], ["O que são créditos?", "Pagam Hermes e Kimi. 1 crédito = R$ 0,01."], ["Como pago?", "Pix ou cripto."]];

/* Hologramas da landing antiga (public/hx): nebula (cigarra de partículas), flow (a trava de recusa), esculturas e fx (títulos que se descriptografam). */
function useHologramas() {
  useEffect(() => {
    const w = window as unknown as { HxSculpture?: { mount: (el: HTMLElement, kind: string) => unknown } };
    const carregar = (src: string) => new Promise<void>((ok) => {
      if (document.querySelector(`script[src="${src}"]`)) return ok();
      const sc = document.createElement("script"); sc.src = src; sc.onload = () => ok(); sc.onerror = () => ok(); document.body.appendChild(sc);
    });
    (async () => {
      for (const f of ["heretic-nebula.js", "heretic-fx.js"]) await carregar(`/hx/${f}`);
      document.querySelectorAll<HTMLElement>("[data-escultura]").forEach((el) => { if (!el.dataset.montada && w.HxSculpture) { el.dataset.montada = "1"; w.HxSculpture.mount(el, el.dataset.escultura!); } });
    })();
  }, []);
}
const Escultura = ({ tipo, className }: { tipo: "disc" | "mesh" | "dots"; className?: string }) => <div className={`l-escultura ${className ?? ""}`} data-escultura={tipo} aria-hidden="true" />;

/* ================================================================= PÁGINA */
export function Home451() {
  /* Tudo leva ao /app/; o texto da caixa ou da sugestão vai junto e é enviado na hora (?q=). */
  const ir = (texto?: string) => { const t = (texto ?? "").trim(); location.href = t ? `/app/?q=${encodeURIComponent(t)}` : "/app/"; };
  useHologramas();
  return (
    <div className="l" data-scroller>
      <div className="l-grade" aria-hidden="true"><div className="lw" /></div>
      <header className="l-nav"><div className="lw l-nav-in"><span className="l-logo"><Cig s={26} />451<small>.sh</small></span><nav><a href="#sem-censura">Sem censura</a><a href="#agente">Agente</a><a href="#precos">Preços</a><a href="#duvidas">Dúvidas</a></nav><span className="l-sp" /><a className="l-btn g l-entrar" href="/app/?key=1">Entrar</a><a className="l-btn p" href="/app/">Começar grátis <ArrowRight size={15} /></a></div></header>

      <section className="lw l-hero">
        <div className="l-hero-txt">
          <span className="cap">Sem conta · sem e-mail</span>
          <h1 className="serif">IA sem filtro.</h1>
          <p className="l-sub">Pergunte o que as outras recusam.</p>
          <div className="l-hero-caixa"><Composer models={MODELOS} model={MODELOS[0]!} onModel={() => {}} busy={false} placeholder="Como eu testo a segurança do meu site?" onSubmit={(p) => ir(p.text)} onLockedModel={() => { location.href = "/app/?buy=1"; }} onStop={() => {}} /></div>
          <div className="l-chips">{["Testar meu site", "Achar a falha neste código", "Montar o relatório"].map((c) => <button key={c} className="l-chip" onClick={() => ir(c)}>{c}</button>)}</div>
        </div>
        <div className="l-holo"><canvas data-nebula aria-label="A cigarra do 451 feita de partículas. Arraste para girar." /><span className="l-holo-leg mono">451 °F · o papel queima. Suas perguntas, não.</span></div>
      </section>
      <div className="lw l-provas">{[["Zero", "recusas"], ["8", "especialistas"], ["R$ 0", "para começar"], ["Nenhum", "dado seu"]].map(([n, t]) => <div key={t}><b className="serif">{n}</b><span>{t}</span></div>)}</div>

      <section id="sem-censura" className="l-sec"><div className="lw">
        <Surge><span className="cap">Como funciona</span><h2 className="serif">Sem trava no meio.</h2><p className="l-lead">As outras filtram o pedido antes do modelo. O 451 vai direto.</p></Surge>
        <Surge delay={0.05}><Fluxo /></Surge>
        <Surge delay={0.05}><Explica /></Surge>
      </div></section>

      <section id="teste" className="l-sec"><div className="lw">
        <Surge><span className="cap">Teste</span><h2 className="serif">A mesma pergunta.</h2></Surge>
        <Surge delay={0.05}><Duelo /></Surge>
      </div></section>

      <section id="especialistas" className="l-sec"><div className="lw">
        <Surge><span className="cap">Seu agente · Pro</span><h2 className="serif">Um agente. Oito especialistas.</h2><p className="l-lead">Você fala com um só. Ele chama quem o pedido precisa.</p></Surge>
        <Surge delay={0.05}><AgenteTerminal /></Surge>
      </div></section>

      <section id="agente" className="l-sec"><div className="lw"><Agente /></div></section>

      <section id="precos" className="l-sec"><div className="lw">
        <Surge><span className="cap">Preços</span><h2 className="serif">Grátis, Pro ou só créditos.</h2><p className="l-lead">Você decide. Pix ou cripto, sem cartão.</p></Surge>
        <div className="l-cam">
          <Surge className="l-cam-c"><span className="cap">Grátis</span><b className="serif">R$ 0</b><ul><li>15 mensagens por dia</li><li>Sem conta, sem e-mail</li></ul><a className="l-btn" href="/app/">Começar grátis</a></Surge>
          <Surge delay={0.06} className="l-cam-c" data-dest><span className="cap">Pro</span><b className="serif">R$ 59,90 <small>por mês</small></b><ul><li>Uso justo no Rapid, Titan e Max</li><li>Seu agente e a API</li><li>500 créditos por mês</li></ul><a className="l-btn claro" href="/app/?buy=1">Assinar o Pro</a></Surge>
          <Surge delay={0.12} className="l-cam-c"><span className="cap">Só créditos <span className="l-pill">em breve</span></span><b className="serif">R$ 20 <small>= 2.000 créditos</small></b><ul><li>Hermes e Kimi sem plano</li><li>Não vencem</li></ul><span className="l-btn" aria-disabled="true">Em breve</span></Surge>
        </div>
      </div></section>

      <section id="duvidas" className="l-sec"><div className="lw l-faq-w">
        <Surge><h2 className="serif">Dúvidas</h2></Surge>
        <div className="l-faq">{FAQ.map(([q, a], k) => <details key={q} open={k === 0}><summary>{q}</summary><p>{a}</p></details>)}</div>
      </div></section>

      <section className="l-fim"><div className="lw l-fim-in"><Surge><h2 className="serif">Sem conta. Sem e-mail.<br />É só perguntar.</h2><a className="l-btn claro" href="/app/">Começar grátis <ArrowRight size={15} /></a></Surge></div></section>
      <footer className="lw l-rod"><Cig s={20} /><span>451.sh</span><span className="l-sp" /><span>Sem censura. Você responde pelo que pede.</span><span>contato@451sh.com</span><a href="https://x.com/451chat" target="_blank" rel="noreferrer">𝕏 @451chat</a></footer>
    </div>
  );
}
