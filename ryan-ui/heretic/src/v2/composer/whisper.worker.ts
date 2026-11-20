/// <reference lib="webworker" />
/* Whisper no navegador (dono 20/11): transcreve a voz quando o reconhecimento do navegador não existe
   ou falha calado (Chromium do Fedora, Brave, Opera, Firefox). Roda num worker para a tela não travar.
   Modelo: whisper-base quantizado (~77 MB), baixado do Hugging Face na 1ª vez e guardado no cache. */
import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;

type Msg = { id: number; audio: Float32Array };
type Asr = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>;

let asr: Promise<Asr> | null = null;

function load(onProgress: (p: { file: string; loaded: number; total: number }) => void): Promise<Asr> {
  if (!asr) {
    asr = (pipeline as unknown as (task: string, model: string, opts: Record<string, unknown>) => Promise<Asr>)(
      "automatic-speech-recognition",
      "onnx-community/whisper-base",
      {
        dtype: "q8",
        device: "wasm",
        progress_callback: (x: { status?: string; file?: string; loaded?: number; total?: number }) => {
          if (x.status === "progress" && x.file) onProgress({ file: x.file, loaded: x.loaded ?? 0, total: x.total ?? 0 });
        },
      },
    ).catch((e) => { asr = null; throw e; });
  }
  return asr;
}

self.onmessage = async (event: MessageEvent<Msg>) => {
  const { id, audio } = event.data;
  try {
    const run = await load((p) => self.postMessage({ id, type: "progress", ...p }));
    self.postMessage({ id, type: "running" });
    const out = await run(audio, { language: "portuguese", task: "transcribe", chunk_length_s: 30, stride_length_s: 5 });
    const text = Array.isArray(out) ? out.map((o) => o.text).join(" ") : out.text;
    self.postMessage({ id, type: "done", text: String(text || "").trim() });
  } catch (e) {
    self.postMessage({ id, type: "error", message: e instanceof Error ? e.message : String(e) });
  }
};
