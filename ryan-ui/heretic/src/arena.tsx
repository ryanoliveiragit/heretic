// Modo Qualidade em arena (dono 18/11): o ModelArena REAL da ryan-ui ("Model arena — Blind
// side-by-side comparison in one card"), num fork só para a conversa (pro/heretic-arena.tsx, gerado
// por heretic-design/extra-build/fork-arena.mjs). As duas respostas já vêm prontas do servidor; o
// runner só as entrega. O juiz automático indica uma, que já é a resposta padrão da conversa; o voto
// do usuário (A ou B) troca pela escolhida. Empate ou "as duas ruins" mantém a indicada pelo juiz.
import { useMemo } from "react";
import { ModelArena } from "./pro/heretic-arena";
import type { ArenaModel, ArenaRunner, ArenaVote } from "./pro/heretic-arena";
import "./arena.css";

export interface ArenaData {
  answers: { model: string; text: string }[];
  /** Índice que o juiz indicou. */
  recommended: number;
  /** Índice que o usuário escolheu; sem escolha vale a indicada. */
  chosen?: number;
}

// Arenas votadas nesta sessão continuam na tela (com a revelação dos modelos); ao recarregar a página,
// a conversa mostra só a resposta escolhida.
const votedNow = new Set<string>();
export const arenaVotedNow = (messageId: string) => votedNow.has(messageId);

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  const timer = window.setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { window.clearTimeout(timer); resolve(); }, { once: true });
});

export function ArenaAnswers({ messageId, question, arena, name, onPick }: {
  messageId: string;
  question: string;
  arena: ArenaData;
  /** Nome revelado de cada resposta depois do voto. */
  name: (modelId: string, index: number) => string;
  onPick?: (index: number) => void;
}) {
  // id único por posição: os dois lados podem cair no mesmo modelo de reserva.
  const contestants = useMemo<ArenaModel[]>(() => arena.answers.map((answer, i) => ({
    id: `${i}:${answer.model}`,
    name: name(answer.model, i),
    provider: "451.sh",
    price: { input: 0, output: 0 },
  })), [arena.answers, name]);
  const prompts = useMemo(() => [{ id: "pergunta", label: "Pergunta", text: question.trim() || "Pergunta" }], [question]);

  // Entrega a resposta já pronta em pedaços, para o cartão animar a chegada como um stream.
  const run = useMemo<ArenaRunner>(() => async function* (model, _prompt, signal) {
    const text = arena.answers[Number(model.id.split(":")[0])]?.text ?? "";
    for (let i = 0; i < text.length && !signal.aborted; i += 24) {
      yield text.slice(i, i + 24);
      await sleep(14, signal);
    }
  }, [arena.answers]);

  const onVote = (vote: ArenaVote) => {
    votedNow.add(messageId);
    if (vote.choice !== "a" && vote.choice !== "b") return;
    const index = Number((vote.winner ?? vote.models[vote.choice === "a" ? 0 : 1]).id.split(":")[0]);
    if (Number.isInteger(index)) onPick?.(index);
  };

  return (
    <div className="hx-arena">
      <ModelArena
        title="Modo Qualidade"
        contestants={contestants}
        prompts={prompts}
        run={run}
        onVote={onVote}
        autoStart
        defaultBlind
        recommendedId={contestants[arena.recommended]?.id}
      />
    </div>
  );
}
