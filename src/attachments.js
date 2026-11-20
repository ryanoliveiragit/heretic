// Anexos dos modelos pagos: imagem e PDF. Chegam em messages[i].attachments, ao lado do texto, para
// o resto do servidor continuar tratando content como string.
// O Heretic Max lê os arquivos direto. Os modelos só de texto recebem a leitura feita por um modelo
// de visão auxiliar, que transcreve o arquivo antes da resposta.

export const MAX_ATTACHMENTS = 5;
// A Vercel recusa corpo acima de ~4,5 MB: a soma em base64 fica abaixo disso com folga para o texto.
export const MAX_ATTACHMENT_CHARS = 3_400_000;
// PDF é o anexo mais caro no Max (cerca de 1,5 mil tokens por página, reenviados a cada leitura).
export const MAX_PDF_PAGES = 30;

const SIGNATURES = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/gif': (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  'image/webp': (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  'application/pdf': (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
};

function headBytes(data) {
  try { return Uint8Array.from(atob(data.slice(0, 24)), c => c.charCodeAt(0)); } catch { return new Uint8Array(); }
}

/** Páginas do PDF pelo que está legível no arquivo; 0 quando o índice vem comprimido. */
function pdfPages(data) {
  let raw = '';
  try { raw = atob(data); } catch { return 0; }
  const objects = (raw.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
  const counts = [...raw.matchAll(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages/g)].map(m => Number(m[1] || m[2]) || 0);
  return Math.max(objects, ...counts, 0);
}

const cleanName = (name) => String(name || 'anexo').replace(/[\r\n\t"\\[\]]/g, ' ').trim().slice(0, 120) || 'anexo';

/** Valida os anexos do pedido. Devolve { error } ou { messages, count }. */
export function readAttachments(messages) {
  let count = 0, chars = 0;
  const out = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || !message.attachments) { out.push(message); continue; }
    const { attachments, ...rest } = message;
    if (message.role !== 'user' || !Array.isArray(attachments)) { out.push(rest); continue; }
    const clean = [];
    for (const item of attachments) {
      const mime = String(item?.mime || '').toLowerCase();
      const data = String(item?.data || '');
      const accepts = SIGNATURES[mime];
      if (!accepts) return { error: 'attachment_type' };
      if (!data || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return { error: 'attachment_invalid' };
      if (!accepts(headBytes(data))) return { error: 'attachment_invalid' };
      count += 1; chars += data.length;
      if (count > MAX_ATTACHMENTS) return { error: 'attachment_count' };
      if (chars > MAX_ATTACHMENT_CHARS) return { error: 'attachment_size' };
      const kind = mime === 'application/pdf' ? 'pdf' : 'image';
      const pages = kind === 'pdf' ? pdfPages(data) : 0;
      if (pages > MAX_PDF_PAGES) return { error: 'attachment_pages' };
      clean.push({ kind, name: cleanName(item.name), mime, data, pages });
    }
    out.push(clean.length ? { ...rest, attachments: clean } : rest);
  }
  return { messages: out, count };
}

/** Blocos do Claude para uma mensagem com anexos. */
export function anthropicBlocks(text, attachments) {
  const blocks = attachments.map(a => (a.kind === 'pdf'
    ? { type: 'document', title: a.name, source: { type: 'base64', media_type: a.mime, data: a.data } }
    : { type: 'image', source: { type: 'base64', media_type: a.mime, data: a.data } }));
  blocks.push({ type: 'text', text: text || 'Analise o anexo.' });
  return blocks;
}

// ── leitura auxiliar para modelos só de texto ──
// O GLM não aceita desligar o raciocínio (a API responde 400): cada leitor leva a própria configuração.
const READERS = [
  { model: 'qwen/qwen3.7-flash', reasoning: { enabled: false } },
  { model: 'z-ai/glm-5.3-flash', reasoning: { effort: 'low', exclude: true } },
];
const READ_PROMPT = 'Leia o anexo e devolva somente o conteúdo dele, em texto. Transcreva todo o texto visível, na íntegra e no idioma original, mantendo tabelas e números exatos. Se houver imagem, descreva objetivamente pessoas, objetos, cenário, gráficos e qualquer detalhe relevante. Não opine, não comente e não escreva introdução.';
const REFUSED = /^\s*(desculpe|sinto muito|não posso|não consigo|i can(?:no|')t|i'm sorry|sorry)/i;

const readCache = new Map();

async function cacheKey(item) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(item.data));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function askReader({ model, reasoning }, item, { apiKey, referer, signal }) {
  const part = item.kind === 'pdf'
    ? { type: 'file', file: { filename: item.name, file_data: `data:${item.mime};base64,${item.data}` } }
    : { type: 'image_url', image_url: { url: `data:${item.mime};base64,${item.data}` } };
  const ctrl = new AbortController();
  const stop = () => ctrl.abort();
  if (signal) signal.addEventListener('abort', stop);
  const timer = setTimeout(stop, 60000);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, 'HTTP-Referer': referer },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: [{ type: 'text', text: READ_PROMPT }, part] }],
        temperature: 0,
        max_tokens: Number(process.env.READER_MAX_TOKENS) || 8000,
        reasoning,
        ...(item.kind === 'pdf' ? { plugins: [{ id: 'file-parser', pdf: { engine: 'pdf-text' } }] } : {}),
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return '';
    const data = await res.json();
    const text = String(data?.choices?.[0]?.message?.content || '').trim();
    return REFUSED.test(text) ? '' : text;
  } catch { return ''; } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', stop);
  }
}

async function readOne(item, options) {
  const key = await cacheKey(item);
  if (readCache.has(key)) return readCache.get(key);
  let text = '';
  for (const reader of READERS) {
    text = await askReader(reader, item, options);
    if (text) break;
  }
  if (text) {
    readCache.set(key, text);
    if (readCache.size > 40) readCache.delete(readCache.keys().next().value);
  }
  return text;
}

/** Quantos anexos NOVOS a última mensagem do usuário traz: é só isso que gasta o limite. */
export function newUploads(messages) {
  const last = [...(messages || [])].reverse().find(m => m && m.role === 'user');
  const items = last?.attachments || [];
  const textFiles = (String(last?.content || '').match(/^--- file: .+ ---$/gm) || []).length;
  return { images: items.filter(a => a.kind === 'image').length, files: items.filter(a => a.kind === 'pdf').length + textFiles };
}

/**
 * Para o Max: só a última mensagem vai como arquivo de verdade. Anexos antigos viram texto, para
 * uma conversa longa não pagar a leitura do mesmo arquivo a cada resposta. PDF sem contagem de
 * páginas confiável também vira texto, porque o custo dele não teria teto.
 */
export async function prepareForMax(messages, options) {
  let lastUser = -1;
  messages.forEach((m, i) => { if (m && m.role === 'user') lastUser = i; });
  const keep = (m, i) => i === lastUser && m.attachments.every(a => a.kind !== 'pdf' || a.pages > 0);
  const older = messages.map((m, i) => (m && m.attachments && keep(m, i) ? { ...m, attachments: undefined, _native: m.attachments } : m));
  const digested = await digestAttachments(older, options);
  return digested.map((m) => {
    if (!m || !m._native) return m;
    const { _native, ...rest } = m;
    return { ...rest, attachments: _native };
  });
}

/** Troca os anexos por texto, para modelos que não enxergam arquivo. */
export async function digestAttachments(messages, options) {
  if (!messages.some(m => m && m.attachments)) return messages;
  return Promise.all(messages.map(async (message) => {
    if (!message || !message.attachments) return message;
    const { attachments, ...rest } = message;
    const parts = await Promise.all(attachments.map(async (item) => {
      const text = await readOne(item, options);
      return text
        ? `[Conteúdo do anexo "${item.name}"]\n${text}\n[Fim do anexo "${item.name}"]`
        : `[O anexo "${item.name}" não pôde ser lido. Diga isso ao usuário e não invente o conteúdo.]`;
    }));
    return { ...rest, content: `${rest.content || ''}\n\n${parts.join('\n\n')}`.trim() };
  }));
}
