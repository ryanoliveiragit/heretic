// Assinar o Pro por Pix ou cripto (dono 18/11, no estilo da imagem que ele mandou: preço grande,
// período e as formas de pagamento em lista, com o processador do lado). Só componentes reais da
// ryan-ui. A pessoa paga na página do processador e volta para /app/?pedido=<id>; aqui o app espera
// a confirmação, recebe a chave Pro e já a ativa neste aparelho. Sem conta e sem e-mail.
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@pro/dialog/dialog";
import { BillingToggle } from "@pro/billing-toggle/billing-toggle";
import { AnimatedCounter } from "@pro/animated-counter/animated-counter";
import { RadioCards } from "@pro/radio-cards/radio-cards";
import { Button } from "@pro/button/button";
import { CopyButton } from "@pro/copy-button/copy-button";
import { authHeaders, setKey } from "./api";
import "./pay.css";

type Period = "mensal" | "trimestral" | "anual";
type Method = "pix" | "cripto";
interface PayInfo { methods: Record<Method, string | null>; periods: Record<Period, { cents: number; days: number }> }
interface Order { id: string; status: "pending" | "paid" | "expired"; method: Method; period: Period; cents: number; key?: string; expiresAt?: number; url?: string }

const PERIODS = [
  { value: "mensal", label: "Mensal" },
  { value: "trimestral", label: "Trimestral", badge: "−11%" },
  { value: "anual", label: "Anual", badge: "−25%" },
];
const PER: Record<Period, string> = { mensal: "por mês", trimestral: "por trimestre", anual: "por ano" };
const DURATION: Record<Period, string> = { mensal: "30 dias", trimestral: "90 dias", anual: "365 dias" };
const PROCESSOR: Record<Method, string> = { pix: "AbacatePay", cripto: "NOWPayments" };
const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const PEDIDO_KEY = "heretic-pedido";

/** Pedido que voltou do processador (?pedido=) ou que ficou pendente neste aparelho. */
export function pendingOrderId(): string {
  try {
    const q = new URLSearchParams(location.search).get("pedido");
    if (q && /^[0-9A-Z]{12}$/.test(q)) return q;
    // A página do Pix pode não mandar a pessoa de volta: o pedido aberto fica guardado por 2 horas.
    const saved = JSON.parse(localStorage.getItem(PEDIDO_KEY) || "null") as { id?: string; at?: number } | null;
    if (saved?.id && /^[0-9A-Z]{12}$/.test(saved.id) && Date.now() - (saved.at ?? 0) < 2 * 3600e3) return saved.id;
  } catch { /* sem location ou modo privado */ }
  return "";
}

function Checkout({ onClose }: { onClose: () => void }) {
  const [info, setInfo] = useState<PayInfo | null>(null);
  const [period, setPeriod] = useState<Period>("mensal");
  const [method, setMethod] = useState<Method | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/pay").then(r => r.json()).then((d: PayInfo) => {
      setInfo(d);
      setMethod(d.methods.pix ? "pix" : d.methods.cripto ? "cripto" : null);
    }).catch(() => setErr("Não consegui abrir o pagamento agora. Tente de novo em instantes."));
  }, []);

  const cents = info?.periods[period]?.cents ?? 0;
  const go = async () => {
    if (!method) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/pay", { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ method, period }) });
      const d = await r.json();
      if (!r.ok || !d.url) throw new Error(d.message || "Não consegui criar a cobrança.");
      try { localStorage.setItem(PEDIDO_KEY, JSON.stringify({ id: d.id, at: Date.now() })); } catch { /* modo privado */ }
      location.href = d.url;
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };

  const none = !!info && !info.methods.pix && !info.methods.cripto;
  return (
    <div className="hx-pay">
      <div className="hx-pay-period">
        <BillingToggle label="Período" value={period} onValueChange={v => setPeriod(v as Period)} options={PERIODS} />
      </div>
      <div className="hx-pay-price">
        <AnimatedCounter value={cents / 100} prefix="R$ " decimals={2} locale="pt-BR" />
      </div>
      <p className="hx-pay-sub">Pro · {PER[period]} ({DURATION[period]})</p>
      <p className="hx-pay-note">Se você já tem o Pro, o tempo que sobrou soma no período novo.</p>
      <p className="hx-pay-k">Como você quer pagar?</p>
      <RadioCards
        layout="list"
        value={method}
        onValueChange={v => setMethod(v as Method)}
        options={[
          { value: "pix", label: "Pix", description: "QR Code no app do seu banco.", meta: PROCESSOR.pix, disabled: !info?.methods.pix, disabledReason: "Ainda não ligado." },
          { value: "cripto", label: "Cripto", description: "BTC, ETH, USDT e mais de 300 moedas, na cotação do processador. O Pro liga quando a rede confirmar.", meta: PROCESSOR.cripto, disabled: !info?.methods.cripto, disabledReason: "Ainda não ligado." },
        ]}
      />
      {err ? <p className="hx-pay-err" role="alert">{err}</p> : null}
      {none ? <p className="hx-pay-err">O pagamento ainda não está ligado.</p> : null}
      <div className="hx-pay-actions">
        <Button variant="ghost" size="md" onClick={onClose}>Agora não</Button>
        <Button variant="primary" size="md" loading={busy} disabled={!method || !cents} onClick={go}>Continuar para o pagamento</Button>
      </div>
      <p className="hx-pay-foot">Você termina na página do processador e volta aqui quando o pagamento confirmar.</p>
    </div>
  );
}

function Waiting({ orderId, onPaid, onClose }: { orderId: string; onPaid: () => void; onClose: () => void }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [gone, setGone] = useState(false);
  const activated = useRef(false);
  useEffect(() => {
    let stop = false, timer = 0, tries = 0;
    const poll = async () => {
      tries++;
      try {
        const r = await fetch(`/api/pay/${orderId}`);
        if (r.status === 404) { setGone(true); return; }
        const d = (await r.json()) as Order;
        if (stop) return;
        setOrder(d);
        if (d.status === "paid" && d.key) {
          if (!activated.current) { activated.current = true; setKey(d.key); try { localStorage.removeItem(PEDIDO_KEY); } catch { /* */ } onPaid(); }
          return;
        }
        if (d.status === "expired") { try { localStorage.removeItem(PEDIDO_KEY); } catch { /* */ } return; }
      } catch { /* rede: tenta de novo */ }
      // Pix confirma em segundos; cripto pode levar minutos. Consulta por até ~1 hora.
      if (!stop && tries < 720) timer = window.setTimeout(poll, tries < 20 ? 3000 : 5000);
    };
    poll();
    return () => { stop = true; window.clearTimeout(timer); };
  }, [orderId, onPaid]);

  if (gone) return <div className="hx-pay"><p className="hx-pay-sub">Não achei esse pedido. Se você pagou, fale com o suporte e informe o código {orderId}.</p><div className="hx-pay-actions"><Button variant="primary" size="md" onClick={onClose}>Fechar</Button></div></div>;
  if (order?.status === "paid" && order.key) {
    return (
      <div className="hx-pay">
        <p className="hx-pay-k">Pagamento confirmado</p>
        <p className="hx-pay-sub">O Pro está ativo neste aparelho até {fmtDate(order.expiresAt!)}.</p>
        <div className="hx-pay-key">
          <code>{order.key}</code>
          <CopyButton value={order.key} label="Copiar chave" copiedLabel="Copiado" failedLabel="Não copiou" />
        </div>
        <p className="hx-pay-note">Guarde esta chave: ela é o seu acesso. Para usar o Pro em outro aparelho, cole a chave em Configurações, Segurança.</p>
        <div className="hx-pay-actions"><Button variant="primary" size="md" onClick={onClose}>Começar</Button></div>
      </div>
    );
  }
  if (order?.status === "expired") return <div className="hx-pay"><p className="hx-pay-sub">Essa cobrança expirou sem pagamento. Você pode gerar outra.</p><div className="hx-pay-actions"><Button variant="primary" size="md" onClick={onClose}>Fechar</Button></div></div>;
  return (
    <div className="hx-pay">
      <p className="hx-pay-k">Esperando a confirmação</p>
      <p className="hx-pay-sub">{order?.method === "cripto" ? "Cripto leva alguns minutos para a rede confirmar. Pode deixar esta tela aberta." : "O Pix costuma confirmar em segundos."}</p>
      <p className="hx-pay-foot">Pedido {orderId}</p>
      <div className="hx-pay-actions">
        <Button variant="ghost" size="md" onClick={onClose}>Fechar e esperar depois</Button>
        {order?.url ? <Button variant="secondary" size="md" onClick={() => { location.href = order.url!; }}>Abrir o pagamento de novo</Button> : null}
      </div>
    </div>
  );
}

/** Janela "Assinar o Pro". Com orderId, mostra a espera e a chave do pedido que voltou do processador. */
export function PayDialog({ open, onOpenChange, orderId, onPaid }: { open: boolean; onOpenChange: (open: boolean) => void; orderId?: string; onPaid: () => void }) {
  const close = () => {
    onOpenChange(false);
    // Tira o ?pedido= do endereço para não reabrir ao recarregar.
    try { if (location.search.includes("pedido=")) history.replaceState(null, "", location.pathname); } catch { /* */ }
  };
  return (
    <Dialog open={open} onOpenChange={o => (o ? onOpenChange(true) : close())}>
      <DialogContent title={orderId ? "Pagamento do Pro" : "Assinar o Pro"} className="hx-paydlg">
        {orderId ? <Waiting orderId={orderId} onPaid={onPaid} onClose={close} /> : <Checkout onClose={close} />}
      </DialogContent>
    </Dialog>
  );
}
