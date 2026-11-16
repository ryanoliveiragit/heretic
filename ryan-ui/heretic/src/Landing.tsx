import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";

import { Button } from "@/registry/components/button/button";
import { Accordion } from "@/registry/components/accordion/accordion";
import { GhostMascot } from "@pro/ghost-mascot/ghost-mascot";
import { CubeMascot } from "@pro/cube-mascot/cube-mascot";
import { VoiceOrb } from "@pro/voice-orb/voice-orb";

import { AGENTS, type Mascot } from "./agents";

const CRIMSON = "#9B111E";
const go = (path: string) => { window.location.hash = path; };

function AgentMascot({ kind, size = 32 }: { kind: Mascot; size?: number }) {
  return kind === "cube" ? <CubeMascot size={size} color={CRIMSON} /> : <GhostMascot size={size} color={CRIMSON} />;
}

function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const reduce = useReducedMotion();
  return (
    <motion.div ref={ref} className={className}
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.6, delay, ease: [0.2, 0.7, 0.2, 1] }}>
      {children}
    </motion.div>
  );
}

/* ── Demo do produto: uma conversa real se escrevendo sozinha ── */
const DEMOS = [
  { agent: AGENTS[1], q: "Mapeie os subdomínios de lab.exemplo.com (ambiente autorizado).",
    a: "Encontrei 4 subdomínios ativos: api, painel, staging e vpn. O staging responde com cabeçalhos de depuração ligados — vale olhar primeiro." },
  { agent: AGENTS[3], q: "O que este binário faz quando recebe o argumento --update?",
    a: "Ele baixa um arquivo de um IP fixo, confere só o tamanho (não a assinatura) e executa. Isso é o ponto fraco: dá para trocar o arquivo no meio do caminho." },
  { agent: AGENTS[7], q: "Este texto parece base64 dentro de base64. Resolve pra mim?",
    a: "Duas camadas de base64 e depois um XOR com a chave 0x2A. A flag é CTF{camadas_sobre_camadas}." },
];

function ProductDemo() {
  const reduce = useReducedMotion();
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState(0);
  const demo = DEMOS[idx];

  useEffect(() => {
    if (reduce) { setTyped(demo.a.length); return; }
    setTyped(0);
    let n = 0;
    let t: number;
    const start = window.setTimeout(function tick() {
      n += 2;
      setTyped(n);
      if (n < demo.a.length) t = window.setTimeout(tick, 22);
      else t = window.setTimeout(() => setIdx((i) => (i + 1) % DEMOS.length), 3200);
    }, 900);
    return () => { window.clearTimeout(start); window.clearTimeout(t); };
  }, [idx, reduce, demo.a.length]);

  const done = typed >= demo.a.length;

  return (
    <div className="demo" aria-label="Exemplo de conversa no Heretic">
      <div className="demo-bar">
        <span className="demo-dots" aria-hidden><i /><i /><i /></span>
        <span className="demo-agent"><AgentMascot kind={demo.agent.mascot} size={18} /> {demo.agent.name}</span>
      </div>
      <motion.div key={idx} className="demo-body" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .4 }}>
        <p className="demo-q">{demo.q}</p>
        <p className="demo-a">
          {demo.a.slice(0, typed)}
          {!done && <span className="caret" aria-hidden />}
        </p>
      </motion.div>
      <div className="demo-tabs" role="tablist">
        {DEMOS.map((d, i) => (
          <button key={d.agent.id} role="tab" aria-selected={i === idx} className={i === idx ? "on" : ""} onClick={() => setIdx(i)}>
            {d.agent.name}
          </button>
        ))}
      </div>
    </div>
  );
}

const KEYWORDS = [
  "pentest", "recon", "privilege escalation", "reverse shell", "CVE", "exploit dev",
  "enumeração", "SQLi", "fuzzing", "pivoting", "OSINT", "engenharia reversa",
  "post-exploitation", "red team", "CTF", "hardening", "buffer overflow", "0-day em lab",
];

function Marquee() {
  const reduce = useReducedMotion();
  const row = [...KEYWORDS, ...KEYWORDS];
  return (
    <div className="marquee" aria-hidden>
      <motion.div className="marquee-track"
        animate={reduce ? undefined : { x: ["0%", "-50%"] }}
        transition={{ duration: 38, ease: "linear", repeat: Infinity }}>
        {row.map((k, i) => <span key={i} className="kw">{k}</span>)}
      </motion.div>
    </div>
  );
}

const STEPS = [
  { n: "1", t: "Escolha um agente", d: "Pentest, recon, engenharia reversa, CTF e outros." },
  { n: "2", t: "Pergunte do seu jeito", d: "Por texto ou por voz, sem precisar montar prompt." },
  { n: "3", t: "Receba a resposta direta", d: "Sem sermão e sem recusa no que é autorizado." },
];

const FAQ = [
  { title: "O que é o Heretic?", content: "Um chat de IA para quem trabalha com segurança. Em vez de um assistente genérico, você conversa com agentes especialistas que já sabem o que fazer em cada área." },
  { title: "Para que posso usar?", content: "Segurança autorizada: seu laboratório, alvos em escopo contratado, CTF, pesquisa e estudo." },
  { title: "Preciso criar conta?", content: "Não para começar. Você entra e usa o plano grátis; se quiser mais, compra créditos." },
];

export function Landing() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <a className="lp-brand" href="#/"><GhostMascot size={24} color={CRIMSON} /> <span>Heretic</span></a>
        <nav className="lp-links">
          <a href="#agentes">Agentes</a>
          <a href="#precos">Preços</a>
        </nav>
        <div className="lp-nav-cta">
          <button className="lp-link-btn" onClick={() => go("#/app")}>Entrar</button>
          <Button variant="primary" size="sm" onClick={() => go("#/app")}>Começar</Button>
        </div>
      </header>

      {/* 1. O que é — em uma frase, com o produto à mostra */}
      <section className="lp-hero">
        <Reveal>
          <h1 className="lp-title">O chat de IA feito para segurança.</h1>
          <p className="lp-sub">Converse com agentes especialistas em pentest, recon, engenharia reversa e CTF. Respostas diretas, sem rodeio.</p>
          <div className="lp-hero-cta">
            <Button variant="primary" size="lg" onClick={() => go("#/app")}>Começar grátis</Button>
          </div>
        </Reveal>
        <Reveal delay={0.15} className="lp-hero-demo"><ProductDemo /></Reveal>
      </section>

      <Marquee />

      {/* 2. Como funciona */}
      <section className="lp-steps">
        {STEPS.map((s, i) => (
          <Reveal key={s.n} delay={i * 0.08} className="step">
            <span className="step-n">{s.n}</span>
            <h3>{s.t}</h3>
            <p>{s.d}</p>
          </Reveal>
        ))}
      </section>

      {/* 3. Agentes */}
      <section id="agentes" className="lp-agents">
        <Reveal>
          <h2 className="lp-h2">Um especialista para cada tarefa.</h2>
        </Reveal>
        <div className="agent-list">
          {AGENTS.map((ag, i) => (
            <Reveal key={ag.id} delay={(i % 4) * 0.05} className="agent-row">
              <AgentMascot kind={ag.mascot} size={30} />
              <div>
                <h3>{ag.name}</h3>
                <p>{ag.focus}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* 4. Voz e API — duas ideias, lado a lado */}
      <section className="lp-split">
        <Reveal className="split-item">
          <div className="split-visual"><VoiceOrb state="idle" size={140} /></div>
          <h3>Fale em vez de digitar</h3>
          <p>Mande um áudio e o agente responde.</p>
        </Reveal>
        <Reveal delay={0.08} className="split-item">
          <pre className="split-code"><code>{`curl heretic.app/v1/chat \\
  -H "Authorization: Bearer $HERETIC_KEY" \\
  -d '{"agent":"recon","msg":"..."}'`}</code></pre>
          <h3>Sua chave de API</h3>
          <p>Leve os agentes para os seus scripts.</p>
        </Reveal>
      </section>

      {/* 5. Preços */}
      <section id="precos" className="lp-pricing">
        <Reveal><h2 className="lp-h2">Comece grátis.</h2></Reveal>
        <div className="price-grid">
          <Reveal className="price-card">
            <h3>Grátis</h3>
            <p className="price">R$ 0</p>
            <p className="price-desc">Mensagens por dia para experimentar.</p>
            <Button variant="secondary" size="md" onClick={() => go("#/app")}>Entrar</Button>
          </Reveal>
          <Reveal delay={0.08} className="price-card">
            <h3>Créditos</h3>
            <p className="price">R$ —</p>
            <p className="price-desc">Todos os agentes, voz e API. Sem mensalidade.</p>
            <Button variant="primary" size="md" onClick={() => go("#/app")}>Comprar créditos</Button>
          </Reveal>
        </div>
      </section>

      {/* 6. FAQ */}
      <section className="lp-faq">
        <Accordion items={FAQ} defaultOpen={-1} size="lg" />
      </section>

      <footer className="lp-footer">
        <span className="lp-foot-brand"><GhostMascot size={18} color={CRIMSON} /> Heretic</span>
        <span>Uso em segurança autorizada.</span>
      </footer>
    </div>
  );
}
