// 3.2 chars/token é a média real de português nos tokenizers em uso.
// len/4 subestima 25% e o medidor nunca dispara poda.
const CHARS_PER_TOKEN = 3.2;

export const est = (s: string) => Math.ceil((s ?? "").length / CHARS_PER_TOKEN);

export const RESERVA_PUBLICADA = 8192;
