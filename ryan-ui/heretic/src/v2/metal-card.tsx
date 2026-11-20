import { useRef, type ReactNode } from "react";
import ws from "@pro/wallet-stack/wallet-stack.module.css";

/* Cartão prata fosco do 451 (Ryan, 19/11): as camadas do cartão "metal" do wallet-stack da ryan-ui
   (material, textura escovada, faixa de brilho, reflexo e chanfro), sem a proporção de cartão de crédito,
   para caber o veredito do juiz e o pedido do agente. O reflexo segue o ponteiro. */
export function MetalCard({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className={[ws.card, "h-metal", className].filter(Boolean).join(" ")}
      data-variant="metal"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--mx", String(((e.clientX - r.left) / r.width) * 100));
        e.currentTarget.style.setProperty("--my", String(((e.clientY - r.top) / r.height) * 100));
      }}
      onPointerLeave={(e) => { e.currentTarget.style.removeProperty("--mx"); e.currentTarget.style.removeProperty("--my"); }}
    >
      <span className={ws.material} aria-hidden="true" />
      <span className={ws.texture} aria-hidden="true" />
      <span className={`${ws.sweep} h-metal-sweep`} aria-hidden="true" />
      <span className={`${ws.sheen} h-metal-sheen`} aria-hidden="true" />
      <span className={ws.edge} aria-hidden="true" />
      <div className="h-metal-in">{children}</div>
    </div>
  );
}
