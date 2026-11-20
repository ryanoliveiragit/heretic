// Configurações do desenho App v2 (Claude Design, aprovado 18/11): um modal (Dialog da ryan-ui)
// por cima do chat, ~880×600, com o SettingsCommand da ryan-ui em abas (fork heretic-settings:
// Geral, Segurança, Planos e uso, Chaves de API, Perfil, Suporte) e a busca ⌘K no topo.
// Só dados e ações REAIS do app: plano/uso do /api/me, chave Pro (o mesmo fluxo do antigo
// KeyModal: /api/redeem + localStorage), conversas do aparelho. Nada da demo do desenho.
import { useEffect, useMemo, useRef, useState } from "react";
import { Boxes, CircleUserRound, CreditCard, KeyRound, LifeBuoy, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { Dialog, DialogContent } from "@pro/dialog/dialog";
import { Button } from "@pro/button/button";
import { Badge } from "@pro/badge/badge";
import { HoldToConfirm } from "@pro/hold-to-confirm/hold-to-confirm";
import { ConfirmPopover } from "@pro/confirm-popover/confirm-popover";
import { ChipGroup } from "@pro/chip-group/chip-group";
import { Input } from "@pro/input/input";
import { CodeBlock } from "@pro/code-block/code-block";
import { CopyButton } from "@pro/copy-button/copy-button";
import { Progress } from "@pro/progress/progress";
import { AnimatedCounter } from "@pro/animated-counter/animated-counter";
import { EmptyState } from "@pro/empty-state/empty-state";
import { HereticSettings } from "./pro/heretic-settings";
import type { SettingDefinition, SettingsSection, SettingsValues } from "./pro/heretic-settings";
import { api, getKey, setKey } from "./api";
import { RESOURCE_LABEL, formatReset, tightestWindow } from "./api";
import type { LimitTable, Quota, QuotaResource } from "./api";
import type { ModelOption } from "./composer/ai-composer";
import { KBD } from "./kbd";

export type CfgTab = "general" | "modelos" | "security" | "billing" | "keys" | "profile" | "support";

export interface DeviceStats { conversations: number; messages: number; images: number; since: number | null }

export interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: CfgTab;
  onTab: (tab: CfgTab) => void;
  /** Abre já com o campo "Chave Pro" (vindo de "Assinar o Pro"). */
  pasteKey?: boolean;
  plan: string;
  quotas: Quota[];
  limits?: LimitTable;
  models: ModelOption[];
  model: ModelOption;
  onModel: (id: string) => void;
  /** Depois de colar ou remover a chave: novo plano (o app recarrega /api/me). */
  onPlan: (plan: string) => void;
  /** "Assinar o Pro": abre o pagamento por Pix ou cripto (sem isso, cai no campo de colar a chave). */
  onSubscribe?: () => void;
  stats: DeviceStats;
  onDeleteAll: () => void;
  onSignOut: () => void;
}

const SECTIONS: SettingsSection[] = [
  { id: "general", label: "Geral", description: "Ferramenta de trabalho e avisos deste aparelho." },
  { id: "modelos", label: "Modelos", description: "Qual modelo abre contexto, qual audita código, qual resiste a recusa." },
  { id: "security", label: "Segurança", description: "Sua chave, o histórico deste aparelho e a saída limpa." },
  { id: "billing", label: "Planos e uso", description: "Quanto de munição ainda resta em cada limite." },
  { id: "keys", label: "Chaves de API", description: "Use a chave Pro no cabeçalho x-451-key para chamar a API do 451.sh de fora do app. Nunca cole a chave em site, script de terceiro nem repositório público." },
  { id: "profile", label: "Perfil", description: "Modo anônimo e o que este aparelho já rodou." },
  { id: "support", label: "Suporte", description: "Escolha o assunto e escreva em uma frase." },
];
const ICONS = { general: SlidersHorizontal, modelos: Boxes, security: ShieldCheck, billing: CreditCard, keys: KeyRound, profile: CircleUserRound, support: LifeBuoy };
const SUGGESTED = ["chave", "planos-uso", "modelos-guia", "modelo", "api", "suporte"];
const ASSUNTOS = [
  { value: "problema", label: "Reportar uma falha", ph: "O que quebrou?" },
  { value: "ideia", label: "Sugerir uma melhoria", ph: "O que deixaria o 451.sh mais afiado?" },
  { value: "pagamento", label: "Pagamento ou chave", ph: "O que aconteceu?" },
  { value: "dono", label: "Falar com o dono", ph: "Sua mensagem" },
];

const fmtInt = (n: number) => Math.round(n).toLocaleString("pt-BR");
const maskKey = (k: string) => (k.length > 8 ? `${k.slice(0, 5)}••••${k.slice(-4)}` : "••••");
const dayMonth = (ts: number) => new Date(ts).toLocaleDateString("pt-BR", { day: "numeric", month: "long" });

function CicadaAvatar({ pro, size = 56 }: { pro: boolean; size?: number }) {
  return (
    <span className="hx-avatar-cic hx-cfg-avatar" aria-hidden="true" style={{ width: size, height: size }}>
      <span className="hx-cicada" style={{ width: Math.round(size * 0.72), height: Math.round(size * 0.27), ["--cic" as string]: pro ? "#F0335A" : "#F5F5F7" }} />
    </span>
  );
}

function Notifications() {
  const supported = typeof window !== "undefined" && "Notification" in window;
  const [perm, setPerm] = useState(() => (supported ? Notification.permission : "denied"));
  if (!supported) return <Badge size="sm" tone="neutral">Sem suporte neste navegador</Badge>;
  if (perm === "granted") return <Badge size="sm" tone="neutral">Ligados</Badge>;
  if (perm === "denied") return <Badge size="sm" tone="neutral">Bloqueados no navegador</Badge>;
  return <Button variant="secondary" size="sm" onClick={() => { void Notification.requestPermission().then(setPerm); }}>Permitir avisos</Button>;
}

const X_HANDLE = "451chat"; // conta do 451 no X

function Support() {
  const [tema, setTema] = useState("problema");
  const [msg, setMsg] = useState("");
  const a = ASSUNTOS.find(x => x.value === tema) ?? ASSUNTOS[0]!;
  const openX = () => {
    const texto = `${a.label} para @${X_HANDLE}: ${msg}`.trim();
    const url = `https://x.com/intent/post?text=${encodeURIComponent(texto)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };
  return (
    <div className="hx-cfg-support">
      <ChipGroup label="Assunto" options={ASSUNTOS.map(({ value, label }) => ({ value, label }))} value={[tema]} multiple={false} onValueChange={v => { if (v[0]) setTema(v[0]); }} />
      <div className="hx-cfg-support-row">
        <div className="hx-cfg-support-field"><Input label={a.label} placeholder={a.ph} value={msg} maxLength={280} onChange={e => setMsg(e.target.value)} /></div>
        <Button variant="primary" size="md" onClick={openX}>Abrir no X</Button>
      </div>
      <p className="hx-cfg-note" role="note">O seu recado abre no X já marcando <b>@{X_HANDLE}</b>. Você revisa e publica por lá — sem conta aqui, sem e-mail.</p>
    </div>
  );
}

/** Guia honesto por modelo: o que faz, limites reais e para que serve (dados do /api/me). */
const RESOURCES: QuotaResource[] = ["messages", "image_gen", "image_upload", "files"];
/** Geração de imagem é do plano, não do modelo: todo modelo Pro usa o mesmo contador. */
const quotaBucket = (resource: QuotaResource, bucket: string) => (resource === "image_gen" && bucket === "max" ? "titan" : bucket);

function LimitList({ bucket, limits }: { bucket: string; limits?: LimitTable }) {
  if (!limits) return null;
  const rows = RESOURCES.flatMap(resource => {
    const row = limits[resource]?.[quotaBucket(resource, bucket)];
    return row && row["5h"] > 0 ? [{ resource, row }] : [];
  });
  return (
    <ul className="hx-cfg-modellimits">
      {rows.map(({ resource, row }) => <li key={resource}><b>{RESOURCE_LABEL[resource]}:</b> {row["5h"]} em 5 horas, {row.day} por dia, {row.week} por semana, {row.month} por mês</li>)}
    </ul>
  );
}

function ModelGuide({ models, limits, onUnlock }: { models: ModelOption[]; limits?: LimitTable; onUnlock: () => void }) {
  const mil = (n?: number | null) => (n ? `${Math.round(n / 1000)} mil` : "—");
  return (
    <div className="hx-cfg-models">
      {models.map(m => (
        <article key={m.id} className="hx-cfg-modelcard" data-locked={m.locked ? "" : undefined}>
          <header className="hx-cfg-modelhead">
            <h3>{m.name}</h3>
            <span className="hx-cfg-modeltags">
              <Badge size="sm" tone="neutral">{m.tier === "pro" ? "Pro" : "Grátis"}</Badge>
              <Badge size="sm" tone="neutral">Sem censura</Badge>
              {m.locked ? <Badge size="sm" tone="neutral">Bloqueado</Badge> : null}
            </span>
          </header>
          {m.guide ? (
            <>
              <p className="hx-cfg-modelrole">{m.guide.role}</p>
              <p className="hx-cfg-modelfor"><b>Melhor para:</b> {m.guide.bestFor}</p>
              <p className="hx-cfg-modelstyle">{m.guide.style}</p>
              <ul className="hx-cfg-modellimits">{m.guide.limits.map((l, i) => <li key={i}>{l}</li>)}</ul>
              <LimitList bucket={m.bucket ?? "free"} limits={limits} />
              <p className="hx-cfg-modelfallback">{m.guide.fallback}</p>
              <p className="hx-cfg-modeltested">{m.guide.tested}</p>
              {m.locked ? <Button variant="primary" size="sm" onClick={onUnlock}>Desbloquear</Button> : null}
            </>
          ) : <p className="hx-cfg-modelrole">{m.note}</p>}
          <footer className="hx-cfg-modelfacts">
            <span>contexto {mil(m.ctx)} tokens</span>
            <span>≈ US$ {(m.cost100 ?? 0).toFixed(2)} / 100 trocas</span>
            <span>{m.provider === "anthropic" ? "nuvem Claude" : "OpenRouter"}</span>
          </footer>
        </article>
      ))}
      <p className="hx-cfg-note">Sem filtro é do servidor, não do modelo: se um modelo se negar, o 451.sh insiste (até 3×) e troca de motor se continuar negando. A única exceção dura é imagem sexual de menor — e vale só para imagem.</p>
    </div>
  );
}

export function SettingsModal(p: SettingsModalProps) {
  const pro = p.plan === "pro";
  const [pasting, setPasting] = useState(false);
  const [nTry, setNTry] = useState(1);
  const [keyErr, setKeyErr] = useState("");
  const [cleared, setCleared] = useState(false);
  const key = getKey();
  const keyId = `pro-key-${nTry}`;
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!p.open) { setPasting(false); setKeyErr(""); setCleared(false); } }, [p.open]);
  useEffect(() => { if (p.open && p.pasteKey) setPasting(true); }, [p.open, p.pasteKey]);
  // Campo da chave apareceu: foco nele.
  useEffect(() => {
    if (!pasting) return;
    const t = window.setTimeout(() => bodyRef.current?.querySelector<HTMLInputElement>(`[data-setting="${keyId}"] input`)?.focus(), 120);
    return () => window.clearTimeout(t);
  }, [pasting, keyId, p.tab]);

  const startPaste = () => { p.onTab("security"); setPasting(true); };
  const bucket = p.model.bucket ?? "free";
  const meters = RESOURCES.flatMap(resource => {
    const quota = p.quotas.find(q => q.resource === resource && q.bucket === quotaBucket(resource, bucket));
    const win = quota ? tightestWindow(quota) : null;
    return quota && win ? [{ resource, quota, win }] : [];
  });
  const messages = meters.find(m => m.resource === "messages");
  const unlocked = p.models.filter(m => !m.locked);

  const settings = useMemo<SettingDefinition[]>(() => {
    const list: SettingDefinition[] = [
      { id: "modelo", section: "general", label: "Motor padrão", description: "O motor que todo alvo novo já abre por padrão.", kind: "select",
        options: unlocked.map(m => ({ value: m.id, label: m.name })), keywords: ["modelo", "ia", "free", "swift", "rapid", "titan", "max", "motor"] },
      { id: "avisos", section: "general", label: "Avisos", description: "Avisar quando a resposta chegar e o 451.sh estiver em segundo plano.", kind: "custom",
        render: () => <Notifications />, keywords: ["notificação", "aviso", "alerta"] },
      { id: "modelos-guia", section: "modelos", label: "Guia dos modelos", description: "Qual abre contexto, qual audita código, o que recusa e o que não recusa.", kind: "panel",
        keywords: ["modelo", "modelos", "free", "swift", "rapid", "titan", "max", "censura", "sem censura", "limite", "contexto", "custo", "preço", "comparar"],
        render: () => <ModelGuide models={p.models} limits={p.limits} onUnlock={startPaste} /> },
      { id: "chave", section: "security", label: "Chave Pro deste aparelho", kind: "custom",
        description: pro ? `Ativa · ${maskKey(key)}` : keyErr || "Nenhuma chave. Este aparelho está no modo grátis.",
        keywords: ["pro", "licença", "assinatura", "trocar", "remover", "colar", "chave", "código"],
        render: () => pro ? (
          <span className="hx-cfg-actions">
            <Button variant="secondary" size="sm" onClick={() => setPasting(true)}>Trocar</Button>
            <ConfirmPopover title="Remover a chave Pro?" description="Este aparelho volta ao plano grátis." confirmLabel="Remover" cancelLabel="Cancelar" pendingLabel="Removendo" successLabel="Removida" errorTitle="Não deu certo" retryLabel="Tentar de novo" align="end" width={300}
              onConfirm={() => { setKey(""); p.onPlan("free"); }}>Remover</ConfirmPopover>
          </span>
        ) : <Button variant="secondary" size="sm" onClick={() => setPasting(true)}>Colar chave</Button> },
    ];
    if (pasting) list.push({ id: keyId, section: "security", label: pro ? "Nova chave Pro" : "Chave Pro", kind: "text", placeholder: "HRTC-••••-••••-••••",
      description: keyErr || "Cole a chave e salve.", keywords: ["colar", "chave"] });
    list.push(
      { id: "apagar", section: "security", label: "Apagar rastro deste aparelho", kind: "custom",
        description: p.stats.conversations ? "Apaga histórico e sessões só deste aparelho. Sem volta." : "Nenhum rastro neste aparelho.",
        keywords: ["histórico", "limpar", "excluir", "deletar", "conversas", "rastro"],
        render: () => <HoldToConfirm label="Segure para apagar rastro" confirmedLabel="Rastro apagado" tone="danger" duration={1400} confirmed={cleared} disabled={cleared || !p.stats.conversations} onConfirm={() => { setCleared(true); p.onDeleteAll(); }} /> },
      { id: "sair", section: "security", label: "Sair deste aparelho", description: "Tira a chave Pro e o histórico daqui.", kind: "custom",
        keywords: ["sair", "logout", "desconectar", "deslogar"],
        render: () => <ConfirmPopover title="Sair deste aparelho?" description="A chave Pro e o histórico saem daqui." confirmLabel="Sair" cancelLabel="Cancelar" pendingLabel="Saindo" successLabel="Pronto" errorTitle="Não deu certo" retryLabel="Tentar de novo" tone="danger" align="end" width={300}
          onConfirm={() => { p.onSignOut(); }}>Sair</ConfirmPopover> },
      { id: "planos-uso", section: "billing", label: "Plano e uso", description: `${pro ? "Pro" : "Grátis"} · munição de ${p.model.short}`, kind: "panel",
        keywords: ["plano", "assinatura", "assinar", "pro", "grátis", "preço", "mensagens", "imagens", "arquivos", "limite", "uso", "consumo"],
        render: () => (
          <div className="hx-cfg-billing">
            <div className="hx-cfg-plan">
              <span className="hx-cfg-plan-k">Plano atual</span>
              <span className="hx-cfg-plan-name">{pro ? "Pro" : "Grátis"}</span>
              {pro ? <Badge size="sm" tone="neutral">Ativo</Badge> : <span className="hx-cfg-plan-price">R$ 0,00 <small>/ mês</small></span>}
              {pro ? null : <Button variant="primary" size="sm" onClick={p.onSubscribe ?? startPaste}>Assinar o Pro</Button>}
              <span className="hx-cfg-plan-facts">
                {messages ? `${messages.win.remaining} de ${messages.win.limit} mensagens livres` : "Munição por modelo"}<span aria-hidden="true"> · </span>
                {unlocked.length} {unlocked.length === 1 ? "modelo" : "modelos"}
              </span>
              {pro ? null : <span className="hx-cfg-plan-note">O Pro é privado: libera com uma chave de acesso.</span>}
            </div>
            <div className="hx-cfg-usage">
              <div className="hx-cfg-usage-head"><span>Munição de {p.model.short}</span><span>a janela mais perto de esgotar</span></div>
              {meters.map(({ resource, quota, win }) => (
                <div className="hx-cfg-meter" key={resource}>
                  <span className="hx-cfg-models-k">{RESOURCE_LABEL[resource]}</span>
                  <span className="hx-cfg-models-v"><b>{fmtInt(win.used)}</b> de {fmtInt(win.limit)}</span>
                  <Progress value={Math.min(win.used, win.limit)} max={win.limit} aria-label={`${RESOURCE_LABEL[resource]} usados`} />
                  <span className="hx-cfg-models-n">{quota.blocked ? `Limite atingido. Libera ${formatReset(quota.resetAt)}.` : `Janela de ${win.label}${win.resetAt ? `, renova ${formatReset(win.resetAt)}` : ""}`}</span>
                </div>
              ))}
              <div className="hx-cfg-meter">
                <span className="hx-cfg-models-k">Modelos liberados</span>
                <span className="hx-cfg-models-v"><b>{unlocked.length}</b> de {p.models.length}</span>
                <Progress value={unlocked.length} max={Math.max(1, p.models.length)} aria-label="Modelos liberados" />
                <span className="hx-cfg-models-n">{unlocked.length < p.models.length ? `${p.models.filter(m => m.locked).map(m => m.short.replace(/^(Heretic|451)\s+/, "")).join(" e ")} só no Pro` : "Todos liberados"}</span>
              </div>
            </div>
          </div>
        ) },
      { id: "api", section: "keys", label: "Chave de API", description: "Chamar o 451.sh de fora do app, com a chave Pro.", kind: "panel",
        keywords: ["api", "token", "desenvolvedor", "código", "x-451-key", "curl", "integração"],
        render: () => pro ? (
          <div className="hx-cfg-api">
            <div className="hx-cfg-apikey">
              <span className="hx-cfg-apikey-k">Sua chave</span>
              <code className="hx-cfg-apikey-v">{maskKey(key)}</code>
              <CopyButton value={key} label="Copiar chave" />
            </div>
            <CodeBlock language="bash" filename="Exemplo" code={`curl -N ${location.origin}/api/chat \\\n  -H "x-451-key: SUA-CHAVE" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"claude-sonnet-5-5","messages":[{"role":"user","content":"oi"}]}'`} />
            <p className="hx-cfg-note">Troque SUA-CHAVE pela chave acima. A resposta chega em streaming (SSE), igual ao app. Cola a chave só aqui.</p>
          </div>
        ) : (
          <EmptyState title="A API usa a chave Pro" description="Com o Pro, a mesma chave deste aparelho autentica POST /api/chat pelo cabeçalho x-451-key." action={<Button variant="secondary" size="sm" onClick={startPaste}>Colar chave</Button>} />
        ) },
      { id: "perfil", section: "profile", label: "Perfil", description: pro ? "Anônimo · Pro" : "Anônimo · modo grátis", kind: "panel",
        keywords: ["nome", "avatar", "conta", "números", "conversas", "perfil"],
        render: () => (
          <div className="hx-cfg-profile">
            <div className="hx-cfg-who">
              <CicadaAvatar pro={pro} />
              <span className="hx-cfg-who-t"><b>Anônimo</b><span>{pro ? "Pro" : "modo grátis"}{p.stats.since ? ` · neste aparelho desde ${dayMonth(p.stats.since)}` : ""}</span></span>
            </div>
            <div className="hx-cfg-stats">
              <div className="hx-cfg-stat"><AnimatedCounter value={p.stats.conversations} label="Conversas" locale="pt-BR" /></div>
              <div className="hx-cfg-stat"><AnimatedCounter value={p.stats.messages} label="Mensagens" locale="pt-BR" /></div>
              <div className="hx-cfg-stat"><AnimatedCounter value={p.stats.images} label="Imagens" locale="pt-BR" /></div>
            </div>
            <p className="hx-cfg-note">Sem conta, sem e-mail, sem rastro no servidor: as sessões ficam neste aparelho. Os números contam o que foi salvo aqui.</p>
          </div>
        ) },
      { id: "suporte", section: "support", label: "Fale com o dono", description: "Problema, ideia, pagamento ou chave.", kind: "panel",
        keywords: ["suporte", "ajuda", "problema", "bug", "erro", "ideia", "melhoria", "pagamento", "dono", "contato", "feedback"],
        render: () => <Support /> },
    );
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pro, key, pasting, keyId, keyErr, cleared, p.stats, p.quotas, p.limits, p.model, p.models, p.tab]);

  const defaults = useMemo<SettingsValues>(() => ({ modelo: p.model.id }), [p.open]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSave = async (values: SettingsValues, changed: string[]) => {
    if (changed.includes("modelo") && typeof values.modelo === "string") p.onModel(values.modelo);
    if (changed.includes(keyId)) {
      const code = String(values[keyId] ?? "").trim();
      if (!code) return;
      try {
        const r = await api.redeem(code);
        setKey(code); setKeyErr(""); setPasting(false); setNTry(n => n + 1);
        p.onPlan(r.plan);
      } catch {
        setKeyErr("Essa chave não vale. Confira e tente de novo.");
        throw new Error("invalid");
      }
    }
  };

  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent title="Configurações" className="hx-cfgmodal" data-tab={p.tab}
        onEscapeKeyDown={e => { if (bodyRef.current?.querySelector('[role="dialog"]')) e.preventDefault(); }}
        onInteractOutside={e => { const t = e.target as HTMLElement | null; if (t?.closest?.("[data-radix-popper-content-wrapper],[role=menu],[role=listbox]")) e.preventDefault(); }}>
        <div ref={bodyRef} className="hx-cfgbody">
          <HereticSettings title="Configurações" className="hx-cfg" sections={SECTIONS} settings={settings} defaultValues={defaults} suggested={SUGGESTED}
            tab={p.tab} onTabChange={id => p.onTab(id as CfgTab)} icons={ICONS} kbd={KBD} onSave={onSave} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
