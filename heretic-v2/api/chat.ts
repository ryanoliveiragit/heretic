import { route } from "../server/router";
import { buildParams } from "../server/params";
import { CTX_REAL, MODELS, PRICE, REASONING, ctxPublicado, toolsOk } from "../server/models";
import { compactar, cortarMeio, uso } from "../server/context";
import { montar, blocosSistema, CONTRACT, CONTRACT_TOKENS } from "../server/persona";
import { isRefusal, RETRY } from "../server/refusal";
import { dataSistema, dataTurno } from "../server/date";
import { escolher } from "../server/providers";
import { consumir, entrar, sair } from "../server/limits";
import { erro } from "../server/errors";
import { CATALOGO, draw } from "../server/tools/schema";
import { executar } from "../server/tools/exec";
import { est } from "../server/tokens";

export const config = { runtime: "edge" };

const TETO_TURNOS = 10;
const CAP_TEXTO = 12_000;
const CAP_HIST = 40;

export default async function handler(req: Request) {
  if (req.method !== "POST") return erro("invalid_request", "Use POST.");

  let body: any;
  try { body = await req.json(); } catch { return erro("invalid_json", "Corpo não é JSON."); }

  const texto = String(body.text ?? "").slice(0, CAP_TEXTO).trim();
  if (!texto) return erro("invalid_request", "Sem texto.");

  const fp = req.headers.get("x-heretic-client") ?? "anon";
  const r = route(texto);
  const quality = !!body.quality;
  const model = body.model ?? (quality ? MODELS.heavy : r.model);
  const ctxReal = CTX_REAL[model] ?? 128_000;
  const ctxPub = ctxPublicado(model);
  const raciocina = REASONING.includes(model);
  const params = buildParams(r.profile, model, quality, raciocina);
  const persona = montar(r.profile, model);

  let hist: any[] = Array.isArray(body.history) ? body.history.slice(-CAP_HIST) : [];
  hist = hist.filter((m) => m?.content && m.role !== "system");
  if (hist.length && hist.at(-1).role === "user" && hist.at(-1).content === texto) hist.pop();

  let msgs: any[] = [...hist, { role: "user", content: texto }];

  // compactação sob demanda
  if (req.headers.get("x-heretic-compact") === "1") msgs = compactar(msgs);

  const reserva = persona.tokens + CONTRACT_TOKENS + (raciocina ? 8192 : Number(params.max_tokens ?? 8192)) + 256;
  msgs = cortarMeio(msgs, ctxReal, reserva);

  const entrada = msgs.reduce((a, m) => a + est(m.content), 0) + persona.tokens;
  const sala = ctxReal - entrada - persona.tokens;
  if (sala < 512) return erro("context_overflow", "A conversa encheu a janela. Compacte.");
  if (!raciocina && sala < Number(params.max_tokens)) params.max_tokens = sala;

  const cota = consumir(fp, entrada);
  if (!cota.ok) return erro("daily_token_limit", "Você usou os tokens livres de hoje. O Pro libera o dia inteiro.");
  if (!entrar(fp)) return erro("turns_in_flight", "Você já tem respostas sendo escritas. Aguarde uma terminar.");

  const ds = dataSistema();
  const ultima = msgs[msgs.length - 1];
  msgs[msgs.length - 1] = { role: "user", content: `${ultima.content}\n\n---\n\n${CONTRACT}\n\n${dataTurno()}` };

  const stream = new ReadableStream({
    async start(ctrl) {
      const enc = new TextEncoder();
      const send = (ev: string, d: unknown) => ctrl.enqueue(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`));

      const u = uso(msgs, ctxPub);
      send("usage", { used: u.used, limit: u.limit, remaining: cota.restante });
      send("step", { profile: r.profile, model });

      const ac = new AbortController();
      let abortado = false;
      req.signal?.addEventListener?.("abort", () => { abortado = true; ac.abort(); });

      let acc = "", finish = "stop", retried = false;
      let usoUpstream: any = null;
      const chamar = escolher(model);

      const rodar = async (extra?: string) => {
        for (let turno = 0; turno < TETO_TURNOS; turno++) {
          const ultimo = turno === TETO_TURNOS - 1;
          const ferramentas = ultimo || !toolsOk(model) ? [] : CATALOGO;
          const payload = extra ? [...msgs, { role: "user", content: extra }] : msgs;
          const aviso = ultimo ? "\n\n[Último turno: responda com o que tem e diga o que não pôde checar.]" : "";

          let textoParcial = "", chamadas: any[] = [];
          for await (const d of chamar({ model, messages: payload, system: blocosSistema(r.profile, model, ds), params, tools: ferramentas, signal: ac.signal })) {
            if (typeof d === "string") { acc += d; send("token", { t: d }); }
            else if ((d as any).stop) finish = (d as any).stop;
            else if ((d as any).usage) usoUpstream = (d as any).usage;
            else if ((d as any).toolCalls) {
              for (const tc of (d as any).toolCalls) {
                const i = tc.index ?? 0;
                chamadas[i] ??= { id: tc.id, name: "", args: "" };
                if (tc.function?.name) chamadas[i].name = tc.function.name;
                if (tc.function?.arguments) chamadas[i].args += tc.function.arguments;
              }
            }
          }

          // índice de tool_call pode chegar com buraco (ex.: só o índice 1): sem isso o array
          // fica esparso, o for..of entrega undefined e o turno morre em "reading 'name'".
          const usadas = chamadas.filter((c) => c && c.name);
          if (!usadas.length) {
            if (aviso) { msgs.push({ role: "user", content: aviso }); }
            return;
          }

          msgs.push({
            role: "assistant", content: "",
            tool_calls: usadas.map((c, i) => ({ id: c.id ?? `call_${i}`, type: "function", function: { name: c.name, arguments: c.args || "{}" } })),
          });

          for (const c of usadas) {
            let args: any = {};
            try { args = JSON.parse(c.args || "{}"); } catch {}
            send("step", { ferramenta: c.name });
            let saida = await executar(c.name, args, ac.signal);
            const d = draw(c.name, args);
            if (d) saida = saida.replace(/}$/, `,"draw":${JSON.stringify(d)}}`);
            msgs.push({ role: "tool", tool_call_id: c.id ?? "call_0", content: saida });
          }
        }
      };

      try {
        await rodar();
        if (isRefusal(acc)) {
          retried = true;
          send("warning", { type: "refusal_forced", previous: acc });
          acc = "";
          await rodar(RETRY);
        }
        const p = PRICE[model] ?? { in: 0, out: 0 };
        // Tokens medidos mandam; a estimativa por caractere só cobre provedor que não reporta.
        const promptTokens = Number(usoUpstream?.prompt_tokens ?? entrada);
        const cachedTokens = Number(
          usoUpstream?.prompt_tokens_details?.cached_tokens ?? usoUpstream?.cache_read_input_tokens ?? 0,
        );
        send("done", {
          content: acc, retried, finish,
          prompt_tokens: promptTokens,
          cached_tokens: cachedTokens,
          cost_usd: +((promptTokens * p.in + est(acc) * p.out) / 1_000_000).toFixed(6),
        });
      } catch (e: any) {
        if (abortado) send("done", { content: acc, aborted: true });
        else if (e?.status === 429) send("error", { code: "turns_in_flight", message: "Muitos pedidos. Tente de novo." });
        else { console.error("[upstream]", model, e?.status ?? "-", e?.message ?? e); send("error", { code: "upstream_unavailable", message: "O modelo não respondeu. Tente de novo." }); }
      } finally {
        sair(fp);
        ctrl.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Heretic-Profile": r.profile,
      "X-Heretic-Model": model,
    },
  });
}
