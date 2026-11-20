// Coluna "Fontes" do desenho App v2 (Claude Design, aprovado 18/11): a lista de fontes do
// ResearchRun da ryan-ui (classes do módulo dele: rail, sourceList, source, sourceButton, mark,
// sourceN, strip…), montada pelas próprias peças, como o turno faz com o ResponseFeedback.
// Diferenças pedidas pelo dono: logo colorido de verdade do site (favicon numa <img>, sem filtro e
// sem fetch), sem animação, só o fundo leve no hover; sem logo, fica a letra.
import { useId, useState } from "react";
import type { SyntheticEvent } from "react";
import { ChevronDown } from "lucide-react";
import rr from "@pro/research-run/research-run.module.css";
import type { WebSource } from "./turn";

export interface RailSource { url: string; title: string; domain: string; snippet?: string }

export function railSources(list: WebSource[] | undefined): RailSource[] {
  return (list ?? []).map(s => {
    let domain = "";
    try { domain = new URL(s.url).hostname.replace(/^www\./, ""); } catch { /* url inválida */ }
    return { url: s.url, title: s.title || domain || s.url, domain: domain || s.url, snippet: s.snippet || undefined };
  });
}

// Favicon: DuckDuckGo primeiro, Google s2 de reserva. Só <img> (sem fetch, sem CORS). Falha = erro de
// carga ou imagem vazia. Os dois respondem 404 COM uma imagem genérica quando o site não tem favicon (o
// navegador mostra mesmo assim): no DuckDuckGo ela tem 48×48; no Google, o globo de 16 px (pedimos 64).
const FAV: Array<(d: string) => string> = [
  d => `https://icons.duckduckgo.com/ip3/${d}.ico`,
  d => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=64`,
];
const favOk = new Map<string, number>();      // domínio → serviço que funcionou
const favBad = new Map<string, number>();     // domínio → quantos serviços já falharam

function SourceMark({ domain, strip }: { domain: string; strip?: boolean }) {
  const [step, setStep] = useState(() => favOk.get(domain) ?? favBad.get(domain) ?? 0);
  const [ok, setOk] = useState(() => favOk.has(domain));
  const letter = (domain || "?").slice(0, 1).toUpperCase();
  const fail = () => { const next = step + 1; favBad.set(domain, next); setOk(false); setStep(next); };
  const onLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const w = e.currentTarget.naturalWidth, h = e.currentTarget.naturalHeight;
    if (w < 2 || (step === 0 && w === 48 && h === 48) || (step === 1 && w <= 16)) { fail(); return; }
    favOk.set(domain, step); setOk(true);
  };
  const cls = [rr.mark, strip ? rr.markStrip : rr.markRow, "hx-fav"].join(" ");
  return (
    <span className={cls} data-ok={ok ? "" : undefined} aria-hidden="true">
      <span className="hx-fav-letter">{letter}</span>
      {step < FAV.length && domain ? (
        <img key={step} src={FAV[step]!(domain)} alt="" width={16} height={16} decoding="async" referrerPolicy="no-referrer" onLoad={onLoad} onError={fail} />
      ) : null}
    </span>
  );
}

function SourceRow({ s, n }: { s: RailSource; n: number }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={rr.source}>
      <button type="button" className={rr.sourceButton} aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <SourceMark domain={s.domain} />
        <span className={rr.sourceMain}>
          <span className={rr.sourceTitle}>{s.title}</span>
          <span className={rr.sourceMeta}>{s.domain}</span>
        </span>
        <span className={rr.sourceN} aria-label={`Fonte ${n}`}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><circle className={rr.ringTrack} cx="10" cy="10" r="7.5" fill="none" /></svg>
          <span>{n}</span>
        </span>
      </button>
      {open ? (
        <div className={rr.clip}>
          {s.snippet ? <p className={rr.snippet}>{s.snippet}</p> : null}
          <a className={rr.sourceLink} href={s.url} target="_blank" rel="noreferrer">{s.url.replace(/^https?:\/\//, "")}</a>
        </div>
      ) : null}
    </li>
  );
}

function SourceList({ sources }: { sources: RailSource[] }) {
  return <ol className={rr.sourceList}>{sources.map((s, i) => <SourceRow key={`${i}-${s.url}`} s={s} n={i + 1} />)}</ol>;
}

/** Coluna da direita (desktop): até o fim da página, com rolagem própria. */
export function SourcesRail({ sources, question }: { sources: RailSource[]; question?: string }) {
  return (
    <aside className={`${rr.rail} hx-rail`} aria-label="Fontes">
      <div className={rr.railHead}><span>Fontes</span><span className={rr.tabular}>{sources.length}</span></div>
      {question ? <div className={rr.railFor}>{question}</div> : null}
      <div className={rr.railScroll}><SourceList sources={sources} /></div>
    </aside>
  );
}

/** Celular: faixa recolhível logo acima da caixa de mensagem. */
export function SourcesStrip({ sources }: { sources: RailSource[] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (!sources.length) return null;
  return (
    <div className={`${rr.strip} hx-strip`}>
      <button type="button" className={rr.stripToggle} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(o => !o)}>
        <span className={rr.stripIcons} aria-hidden="true">{sources.slice(0, 5).map((s, i) => <SourceMark key={`${i}-${s.domain}`} domain={s.domain} strip />)}</span>
        <span>{sources.length === 1 ? "1 fonte" : `${sources.length} fontes`}</span>
        <ChevronDown className={rr.chevron} data-open={open || undefined} aria-hidden="true" />
      </button>
      {open ? <div id={panelId} className={`${rr.clip} hx-strip-panel`}><SourceList sources={sources} /></div> : null}
    </div>
  );
}
