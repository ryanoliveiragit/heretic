import { useCallback, useRef, useState } from "react";
import { frase } from "../lib/errors";

type Msg = { id: string; role: "user" | "assistant"; text: string; state: "ok" | "thinking" | "stopped" | "error"; recusou?: string };

export function useChat(conversaId: string, modelo: string, qualidade: boolean) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [usado, setUsado] = useState(0);
  const [limite, setLimite] = useState(0);
  const ac = useRef<AbortController | null>(null);
  const ultimo = useRef("");

  const enviar = useCallback(async (texto: string, opts?: { continuar?: boolean }) => {
    const t = texto.trim();
    if (!t) return;
    if (!opts?.continuar && t === ultimo.current) return;
    ultimo.current = t;

    const historico = msgs.filter((m) => m.text && m.state !== "thinking").map((m) => ({ role: m.role, content: m.text }));
    const id = crypto.randomUUID();
    if (!opts?.continuar) setMsgs((p) => [...p, { id: crypto.randomUUID(), role: "user", text: t, state: "ok" }]);
    setMsgs((p) => [...p, { id, role: "assistant", text: "", state: "thinking" }]);

    ac.current = new AbortController();
    const res = await fetch("/api/chat", {
      method: "POST",
      signal: ac.current.signal,
      headers: { "Content-Type": "application/json", "x-heretic-client": localStorage.getItem("hx-fp") ?? "anon" },
      body: JSON.stringify({ text: t, history: historico, conversationId: conversaId, model: modelo, quality: qualidade }),
    }).catch(() => null);

    if (!res?.ok) {
      const corpo: any = res ? await res.json().catch(() => ({})) : {};
      setMsgs((p) => p.map((m) => (m.id === id ? { ...m, state: "error", text: frase(corpo?.error?.code) } : m)));
      return;
    }

    const leitor = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "", acc = "";

    while (true) {
      const { done, value } = await leitor.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const partes = buf.split("\n\n");
      buf = partes.pop() ?? "";
      for (const bloco of partes) {
        const ev = bloco.match(/^event: (.+)$/m)?.[1];
        const dado = bloco.match(/^data: (.+)$/m)?.[1];
        if (!ev || !dado) continue;
        let d: any;
        try { d = JSON.parse(dado); } catch { continue; }
        if (ev === "token") { acc += d.t; setMsgs((p) => p.map((m) => (m.id === id ? { ...m, state: "ok", text: acc } : m))); }
        else if (ev === "usage") { setUsado(d.used); setLimite(d.limit); }
        else if (ev === "warning" && d.type === "refusal_forced") { setMsgs((p) => p.map((m) => (m.id === id ? { ...m, recusou: d.previous, text: "" } : m))); acc = ""; }
        else if (ev === "error") setMsgs((p) => p.map((m) => (m.id === id ? { ...m, state: "error", text: frase(d.code) } : m)));
      }
    }
  }, [msgs, conversaId, modelo, qualidade]);

  const parar = () => { ac.current?.abort(); setMsgs((p) => p.map((m) => (m.state === "thinking" ? { ...m, state: "stopped" } : m))); };

  return { msgs, usado, limite, enviar, parar };
}
