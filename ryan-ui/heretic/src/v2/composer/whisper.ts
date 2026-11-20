/* Ponte para o Whisper no navegador (whisper.worker.ts). Converte a gravação para 16 kHz mono,
   manda ao worker e devolve o texto. onProgress recebe 0..100 enquanto baixa o modelo e null ao transcrever. */

let worker: Worker | null = null;
let seq = 0;

/** Grava o microfone com MediaRecorder. stop() devolve o áudio; cancel() descarta. */
export function gravarMicrofone(stream: MediaStream) {
  const tipos = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  const mimeType = tipos.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(t));
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const partes: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) partes.push(e.data); };
  rec.start(250);
  const fechar = () => stream.getTracks().forEach((t) => t.stop());
  return {
    stop: () => new Promise<Blob>((resolve) => {
      if (rec.state === "inactive") { fechar(); resolve(new Blob(partes, { type: rec.mimeType })); return; }
      rec.onstop = () => { fechar(); resolve(new Blob(partes, { type: rec.mimeType })); };
      rec.stop();
    }),
    cancel: () => { try { if (rec.state !== "inactive") rec.stop(); } catch { /* */ } fechar(); },
  };
}

async function para16k(blob: Blob): Promise<Float32Array> {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  try {
    const dec = await ctx.decodeAudioData(await blob.arrayBuffer());
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(dec.duration * 16000)), 16000);
    const src = off.createBufferSource();
    src.buffer = dec;
    src.connect(off.destination);
    src.start();
    const out = await off.startRendering();
    return out.getChannelData(0).slice();
  } finally {
    ctx.close().catch(() => {});
  }
}

export async function transcreverAudio(blob: Blob, onProgress?: (pct: number | null) => void): Promise<string> {
  const audio = await para16k(blob);
  if (audio.length < 16000 * 0.3) return ""; // menos de 0,3 s: nada falado
  if (!worker) worker = new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" });
  const w = worker;
  const id = ++seq;
  return new Promise<string>((resolve, reject) => {
    const arquivos: Record<string, { loaded: number; total: number }> = {};
    const ouvir = (e: MessageEvent) => {
      const d = e.data as { id: number; type: string; file?: string; loaded?: number; total?: number; text?: string; message?: string };
      if (d.id !== id) return;
      if (d.type === "progress" && d.file) {
        arquivos[d.file] = { loaded: d.loaded ?? 0, total: d.total ?? 0 };
        const tot = Object.values(arquivos).reduce((s, f) => s + f.total, 0);
        const got = Object.values(arquivos).reduce((s, f) => s + f.loaded, 0);
        onProgress?.(tot > 0 ? Math.min(100, Math.round((got / tot) * 100)) : 0);
      } else if (d.type === "running") onProgress?.(null);
      else if (d.type === "done") { w.removeEventListener("message", ouvir); resolve(d.text ?? ""); }
      else if (d.type === "error") { w.removeEventListener("message", ouvir); reject(new Error(d.message || "whisper")); }
    };
    w.addEventListener("message", ouvir);
    w.postMessage({ id, audio }, [audio.buffer]);
  });
}
