import { useEffect, useId, useState, type CSSProperties } from "react";
import { motion, useReducedMotion, type TargetAndTransition } from "motion/react";

/* Mascote do agente do 451 (Ryan, 19/11: "queria o mascote assim", referência de bolhas lisas com olhos ovais).
   Formas e cores próprias: gota, bloco, bolha, feijão e chama. Corpo liso com degradê e brilho, dois olhos de pé.
   Anima balançando, piscando e olhando; "ativo" pula de leve. Com "reduzir movimento", fica parado. */
export type Bicho = "gota" | "bloco" | "bolha" | "feijao" | "chama";
export const BICHOS: [Bicho, string][] = [["gota", "Gota"], ["bloco", "Bloco"], ["bolha", "Bolha"], ["feijao", "Feijão"], ["chama", "Chama"]];
export const CORES: [string, string][] = [["#FF3B4E", "Vermelho"], ["#FF6A1F", "Laranja"], ["#FFB21A", "Âmbar"], ["#FF2E88", "Pink"], ["#E0249A", "Magenta"], ["#FF5E5B", "Coral"], ["#B44BFF", "Roxo"], ["#FF8A3D", "Tangerina"]];

const tom = (hex: string, f: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(f > 1 ? v + (255 - v) * (f - 1) : v * f))));
  return `rgb(${c.join(",")})`;
};

/* Formas um pouco mais altas que largas (dono 19/11: "ta achatado"), dentro de 8..94 no viewBox de 100. */
const FORMA: Record<Bicho, string> = {
  gota: "M50 7 C62 24 84 40 84 62 C84 81 69 94 50 94 C31 94 16 81 16 62 C16 40 38 24 50 7 Z",
  /* Bloco é quadrado de verdade, 74x74 (dono 19/11: "nao ta um quadrado"). */
  bloco: "M30 17 H70 C81 17 87 23 87 34 V74 C87 85 81 91 70 91 H30 C19 91 13 85 13 74 V34 C13 23 19 17 30 17 Z",
  bolha: "M50 9 C70 9 86 27 86 51 C86 75 70 93 50 93 C30 93 14 75 14 51 C14 27 30 9 50 9 Z",
  feijao: "M34 12 C48 6 60 16 70 15 C84 14 90 36 86 56 C82 78 66 93 47 92 C27 91 13 75 14 54 C15 36 20 18 34 12 Z",
  chama: "M50 6 C58 22 86 34 86 58 C86 77 70 93 50 93 C30 93 14 77 14 58 C14 40 30 34 36 20 C40 28 44 30 48 30 C46 22 46 14 50 6 Z",
};

/* Truques que ele faz sozinho, um de cada vez, em intervalos aleatórios. */
const TRUQUES: Record<string, TargetAndTransition> = {
  pula: { y: [0, -14, 0, -5, 0], scaleY: [1, 0.94, 1.05, 0.98, 1], scaleX: [1, 1.04, 0.97, 1.01, 1], transition: { duration: 0.9, ease: "easeOut" } },
  gira: { rotate: [0, 360], transition: { duration: 0.8, ease: [0.6, 0, 0.3, 1] } },
  cambalhota: { y: [0, -22, -22, 0, 0], rotate: [0, 0, -360, -360, -360], scaleY: [1, 1, 1, 0.94, 1], transition: { duration: 1.1, times: [0, 0.25, 0.7, 0.85, 1], ease: "easeInOut" } },
  balanca: { rotate: [0, -14, 12, -8, 5, 0], transition: { duration: 1.1, ease: "easeInOut" } },
  amassa: { scaleX: [1, 1.1, 0.96, 1.02, 1], scaleY: [1, 0.9, 1.05, 0.99, 1], transition: { duration: 0.7 } },
  pisca: { scaleY: [1, 1], transition: { duration: 0.1 } },
};
const NOMES = Object.keys(TRUQUES);

export function PlushPet({ bicho = "gota", cor = "#FF4B5C", size = 48, ativo = false, className, style }: { bicho?: Bicho; cor?: string; size?: number; ativo?: boolean; className?: string; style?: CSSProperties }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const forma = FORMA[bicho] ?? FORMA.gota;
  const reduzir = useReducedMotion() ?? false;
  const [truque, setTruque] = useState<{ n: string; k: number }>({ n: "pisca", k: 0 });
  const [piscar, setPiscar] = useState(0);
  useEffect(() => {
    if (reduzir) return;
    let t: number;
    const proximo = () => {
      t = window.setTimeout(() => {
        setTruque((v) => ({ n: NOMES[Math.floor(Math.random() * NOMES.length)] ?? "pisca", k: v.k + 1 }));
        proximo();
      }, (ativo ? 1400 : 2600) + Math.random() * (ativo ? 1600 : 3400));
    };
    proximo();
    const b = window.setInterval(() => setPiscar((v) => v + 1), 2600 + Math.random() * 1800);
    return () => { window.clearTimeout(t); window.clearInterval(b); };
  }, [ativo, reduzir]);
  const olhoY = bicho === "chama" ? 58 : bicho === "gota" ? 60 : 52;
  return (
    <span className={["h-pet", className].filter(Boolean).join(" ")} data-ativo={ativo || undefined} style={{ width: size, height: size, ...style }} aria-hidden="true">
      <svg viewBox="0 0 100 100" width={size} height={size} shapeRendering="geometricPrecision">
        <defs>
          <linearGradient id={`g${id}`} x1="0.2" y1="0" x2="0.8" y2="1">
            <stop offset="0" stopColor={tom(cor, 1.28)} />
            <stop offset=".5" stopColor={cor} />
            <stop offset="1" stopColor={tom(cor, 0.7)} />
          </linearGradient>
          <radialGradient id={`s${id}`} cx="50%" cy="100%" r="70%">
            <stop offset="0" stopColor="#000" stopOpacity=".32" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`b${id}`} cx="34%" cy="24%" r="40%">
            <stop offset="0" stopColor="#fff" stopOpacity=".5" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="50" cy="97" rx="24" ry="3.2" fill="#000" opacity=".35" />
        <motion.g key={truque.k} style={{ transformOrigin: "50% 60%", transformBox: "fill-box" }} animate={reduzir ? undefined : TRUQUES[truque.n]}>
        <g className="h-pet-corpo">
          <path d={forma} fill={`url(#g${id})`} />
          <path d={forma} fill={`url(#s${id})`} />
          <path d={forma} fill={`url(#b${id})`} />
          <path d={forma} fill="none" stroke={tom(cor, 0.55)} strokeOpacity=".55" strokeWidth="1.6" />
          <ellipse cx="35" cy={olhoY - 22} rx="8" ry="4.2" fill="#fff" opacity=".55" transform={`rotate(-24 35 ${olhoY - 22})`} />
          <motion.g className="h-pet-olhos" key={`p${piscar}`} style={{ transformOrigin: "50% 50%", transformBox: "fill-box" }} animate={reduzir ? undefined : { scaleY: [1, 0.1, 1] }} transition={{ duration: 0.18, delay: 0.05 }}>
            <g className="h-pet-pupila">
              <rect x="34" y={olhoY - 10} width="11" height="20" rx="5.5" fill="#FFFDF8" stroke={tom(cor, 0.45)} strokeOpacity=".35" strokeWidth="1" />
              <rect x="55" y={olhoY - 10} width="11" height="20" rx="5.5" fill="#FFFDF8" stroke={tom(cor, 0.45)} strokeOpacity=".35" strokeWidth="1" />
            </g>
          </motion.g>
        </g>
        </motion.g>
      </svg>
    </span>
  );
}
