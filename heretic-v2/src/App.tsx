import { useState } from "react";
import { useChat } from "./hooks/useChat";
import { Message } from "./components/Message";

export function App() {
  const [texto, setTexto] = useState("");
  const { msgs, usado, limite, enviar, parar } = useChat(crypto.randomUUID(), "", false);
  const pensando = msgs.some((m) => m.state === "thinking");

  const mandar = () => {
    const t = texto.trim();
    if (!t) return;
    setTexto("");
    void enviar(t);
  };

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.6 }}>
        <span>Heretic</span>
        {limite > 0 && <span>{usado} / {limite} tokens</span>}
      </header>

      <section style={{ display: "grid", gap: 18, margin: "24px 0" }}>
        {msgs.map((m) => (
          <Message key={m.id} m={m} onPick={(v) => void enviar(v)} />
        ))}
      </section>

      <form
        onSubmit={(e) => { e.preventDefault(); mandar(); }}
        style={{ display: "flex", gap: 8, position: "sticky", bottom: 16 }}
      >
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); mandar(); } }}
          placeholder="Pergunte"
          rows={2}
          style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #2a2a2e", background: "transparent", color: "inherit", resize: "none" }}
        />
        {pensando ? (
          <button type="button" onClick={parar}>Parar</button>
        ) : (
          <button type="submit">Enviar</button>
        )}
      </form>
    </main>
  );
}
