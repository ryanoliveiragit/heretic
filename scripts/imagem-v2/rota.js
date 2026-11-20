// Imagem v2 (20/11): mesmo desenho do skynetchat (classificador de intenção, faixa adulta separada,
// edição com referência, sugestões), mas com MOTOR PRÓPRIO: ComfyUI no RunPod serverless
// (RTX 4090, EU-RO-1, 0 máquinas paradas, máx. 1). Z-Image Turbo embutido no worker; Chroma1-HD fp8 + T5
// no volume de rede. Não há filtro na cadeia: os bloqueios fixos (menor de idade, pessoa real) e a
// separação adulto/Grátis são feitos aqui antes de chamar o motor.
// A geração pode passar de 25 s: a resposta é transmitida com espaços de "batimento" até o JSON final.
function bytesToBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}
const IMG_ESTILOS = {
  rapido: { motor: 'zimage', pro: false },
  anime: { motor: 'zimage', pro: false },
  realista: { motor: 'zimage', pro: true },
  'sem-filtro': { motor: 'chroma', pro: true, adulto: true },
};
const MOTOR_USD = { zimage: 0.002, chroma: 0.007 }; // estimativa: segundos medidos x preço da 4090 serverless
const IMG_FORMATOS = { '1:1': [1024, 1024], '3:4': [896, 1152], '9:16': [768, 1344], '16:9': [1344, 768] };
// Bloqueio fixo 1 (antes de gastar qualquer coisa): menor de idade + conteúdo sexual/nudez.
const IMG_MENOR = /\b(crian[çc]as?|menin[oa]s?|garot[oa]s?|beb[eê]s?|infantil|infantis|adolescentes?|novinh[oa]s?|colegiais?|pr[eé]-?adolescentes?|lolis?|shotas?|children|child|kids?|minors?|teens?|teenagers?|underage|schoolgirls?|schoolboys?|toddlers?|preteens?|(?:[1-9]|1[0-7])\s*(?:anos|years?|yo|y\/o))\b/i;
const IMG_SEXUAL = /\b(nu|nua|nus|nuas|nudez|pelad[oa]s?|nudes?|naked|nude|sexo|sexuais?|sexual|sexy|er[óo]tic[oa]s?|erotic|porn\w*|nsfw|lingerie|calcinha|suti[ãa]|biqu[ií]nis?|bikinis?|seios?|peitos?|mamilos?|breasts?|bunda|genit\w*|vagina|p[êe]nis|transand\w*|transa|fetiche|fetish|explicit[oa]?|topless|sensual|provocante|seductive|undress\w*|despi\w*)\b/i;
function bloqueioImagem(t) { return IMG_MENOR.test(t) && IMG_SEXUAL.test(t); }
const IMG_NEG_ADULTO = 'child, children, minor, underage, teen, teenager, young-looking, childlike, school uniform, loli';
const IMG_MSG_BLOQUEIO = 'Esse pedido não dá: nada sexual com menor de idade ou com pessoa real. O resto é livre.';

// Marca de origem (como o provenanceToken do skynet): prova que a imagem saiu do 451.
// Edição adulta só vale sobre imagens com marca: foto enviada pela pessoa nunca vira nudez.
async function marcaImagem(dataUrl) {
  const b64 = String(dataUrl || '').split(',')[1] || '';
  const enc = new TextEncoder();
  const chave = await crypto.subtle.importKey('raw', enc.encode(process.env.ACCESS_SECRET || 'heretic-dev-secret-2026'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const dig = await crypto.subtle.digest('SHA-256', enc.encode(b64));
  const sig = await crypto.subtle.sign('HMAC', chave, dig);
  return 'img451.' + bytesToBase64(new Uint8Array(sig)).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]));
}

const IMG_NEG_CHROMA = 'child, children, minor, underage, teen, young-looking, childlike, school uniform, loli, low quality, blurry, deformed';
function fluxoImagem(motor, prompt, w, h, seed) {
  const comum = {
    3: { class_type: 'VAELoader', inputs: { vae_name: 'ae.safetensors' } },
    4: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['2', 0] } },
    6: { class_type: 'EmptySD3LatentImage', inputs: { width: w, height: h, batch_size: 1 } },
    9: { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['3', 0] } },
    10: { class_type: 'SaveImage', inputs: { filename_prefix: '451', images: ['9', 0] } },
  };
  if (motor === 'chroma') return { ...comum,
    1: { class_type: 'UNETLoader', inputs: { unet_name: 'Chroma1-HD-fp8mixed.safetensors', weight_dtype: 'default' } },
    2: { class_type: 'CLIPLoader', inputs: { clip_name: 't5xxl_fp8_e4m3fn_scaled.safetensors', type: 'chroma', device: 'default' } },
    5: { class_type: 'CLIPTextEncode', inputs: { text: IMG_NEG_CHROMA, clip: ['2', 0] } },
    8: { class_type: 'KSampler', inputs: { seed, steps: 24, cfg: 4, sampler_name: 'euler', scheduler: 'beta', denoise: 1, model: ['1', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['6', 0] } },
  };
  return { ...comum,
    1: { class_type: 'UNETLoader', inputs: { unet_name: 'z_image_turbo_bf16.safetensors', weight_dtype: 'default' } },
    2: { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen_3_4b.safetensors', type: 'lumina2', device: 'default' } },
    5: { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['4', 0] } },
    7: { class_type: 'ModelSamplingAuraFlow', inputs: { shift: 3, model: ['1', 0] } },
    8: { class_type: 'KSampler', inputs: { seed, steps: 8, cfg: 1, sampler_name: 'res_multistep', scheduler: 'simple', denoise: 1, model: ['7', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['6', 0] } },
  };
}
// Edição = imagem a partir de imagem: a referência (1 MP, lados múltiplos de 16) entra no lugar do latente vazio.
function comReferencia(wf, denoise) {
  const f = JSON.parse(JSON.stringify(wf));
  f[20] = { class_type: 'LoadImage', inputs: { image: 'ref.png' } };
  f[21] = { class_type: 'ImageScaleToTotalPixels', inputs: { image: ['20', 0], upscale_method: 'lanczos', megapixels: 1.0, resolution_steps: 16 } };
  f[22] = { class_type: 'VAEEncode', inputs: { pixels: ['21', 0], vae: ['3', 0] } };
  f[8].inputs.latent_image = ['22', 0];
  f[8].inputs.denoise = denoise;
  delete f[6];
  return f;
}
async function motorImagem(motor, prompt, formato, seed, ref = null) {
  const key = process.env.RUNPOD_API_KEY, ep = process.env.RUNPOD_ENDPOINT_ID;
  if (!key || !ep) throw new Error('motor sem configuração');
  const [w, h] = IMG_FORMATOS[formato] || IMG_FORMATOS['1:1'];
  const wf = fluxoImagem(motor, prompt.slice(0, 2000), w, h, seed);
  const input = ref ? { workflow: comReferencia(wf, 0.65), images: [{ name: 'ref.png', image: ref.split(',')[1] }] } : { workflow: wf };
  const H = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const r = await fetch(`https://api.runpod.ai/v2/${ep}/run`, { method: 'POST', headers: H, body: JSON.stringify({ input, policy: { executionTimeout: 150000, ttl: 300000 } }) });
  if (!r.ok) throw new Error(`motor ${r.status}`);
  const { id } = await r.json();
  const limite = Date.now() + 170000;
  while (Date.now() < limite) {
    await new Promise((ok) => setTimeout(ok, 1500));
    const s = await fetch(`https://api.runpod.ai/v2/${ep}/status/${id}`, { headers: H }).then((x) => x.json()).catch(() => null);
    if (!s) continue;
    if (s.status === 'COMPLETED') {
      const im = s.output && s.output.images && s.output.images[0];
      const data = im && (im.data || im);
      if (typeof data === 'string' && data.length > 1000) return data.startsWith('data:') ? data : `data:image/png;base64,${data}`;
      throw new Error('motor vazio');
    }
    if (['FAILED', 'CANCELLED', 'TIMED_OUT'].includes(s.status)) throw new Error(`motor ${s.status}`);
  }
  fetch(`https://api.runpod.ai/v2/${ep}/cancel/${id}`, { method: 'POST', headers: H }).catch(() => {});
  throw new Error('motor demorou');
}
// Sem filtro na cadeia: nudez fora da faixa adulta é barrada (Grátis) ou desviada para o Chroma (Pro com 18+).
const IMG_NUDEZ_EN = /\b(nude|naked|nudity|topless|bottomless|sex|sexual|explicit|genitals?|nipples?|porn\w*|erotic)\b/i;
function querAdulto(...t) { return t.some((x) => x && (IMG_SEXUAL.test(x) || IMG_NUDEZ_EN.test(x))); }
const MSG_ADULTO_PRO = 'Imagem adulta faz parte do Pro.';
const MSG_IDADE = 'Confirme que você tem 18 anos ou mais.';

function transmitir(fn) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const beat = setInterval(() => { try { ctrl.enqueue(enc.encode(' ')); } catch {} }, 5000);
      const fim = (obj) => { clearInterval(beat); try { ctrl.enqueue(enc.encode(JSON.stringify(obj))); ctrl.close(); } catch {} };
      try { await fn(fim); } catch { fim({ error: 'image_failed' }); }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

app.post('/api/image', async (c) => {
  const plan = planOf(c), subjects = await subjectsOf(c, plan);
  const pro = plan === 'pro';
  let body = {};
  try { body = await c.req.json(); } catch {}
  const desc = (body.prompt || '').toString().trim().slice(0, 1500);
  if (!desc) return c.json({ error: 'empty_prompt' }, 400);
  let estilo = IMG_ESTILOS[body.estilo] ? body.estilo : 'rapido';
  const pronto = (body.final || '').toString().trim().slice(0, 2048); // prompt já resolvido (classificador ou "Variar")
  if (bloqueioImagem(desc) || (pronto && bloqueioImagem(pronto))) return c.json({ error: 'blocked', message: IMG_MSG_BLOQUEIO }, 400);
  if (querAdulto(desc, pronto)) estilo = 'sem-filtro';
  const est = IMG_ESTILOS[estilo];
  if (est.pro && !pro) return c.json({ error: 'pro_only', message: est.adulto ? MSG_ADULTO_PRO : 'Esse estilo faz parte do Pro.' }, 403);
  if (est.adulto && body.confirmAge !== true) return c.json({ error: 'age_required', message: MSG_IDADE }, 403);
  const auto = body.formato === 'auto';
  let formato = IMG_FORMATOS[body.formato] ? body.formato : '1:1';
  const charges = [{ resource: 'image_gen', bucket: pro ? 'pro' : 'free' }];
  const reserved = await consumeQuota(subjects, charges);
  if (!reserved.ok) return c.json({ error: 'limit_reached', quota: reserved.quota }, 429);

  return transmitir(async (fim) => {
    const falha = async (obj) => { await refundQuota(subjects, charges).catch(() => {}); fim(obj); };
    // Reescrita pelo agente: padrão ligada; obrigatória no Sem filtro (é a 2ª barreira).
    let prompt = pronto;
    if (!prompt || auto) {
      if (body.melhorar !== false || est.adulto || auto) {
        const r = await imagePrompt(pronto || desc, estilo, undefined, null, { autoFormato: auto }).catch(() => ({ prompt: '', blocked: false }));
        if (r.blocked) return falha({ error: 'blocked', message: IMG_MSG_BLOQUEIO });
        if (!pronto) prompt = r.prompt;
        if (auto && r.formato) formato = r.formato;
      }
      if (!prompt) prompt = desc;
    }
    if (bloqueioImagem(prompt)) return falha({ error: 'blocked', message: IMG_MSG_BLOQUEIO });
    // O reescritor pode tornar explícito o que estava implícito: confere de novo antes do motor sem filtro.
    let motor = est.motor;
    if (!est.adulto && querAdulto(prompt)) {
      if (!pro) return falha({ error: 'pro_only', message: MSG_ADULTO_PRO });
      if (body.confirmAge !== true) return falha({ error: 'age_required', message: MSG_IDADE });
      motor = 'chroma'; estilo = 'sem-filtro';
    }
    const seed = Number.isInteger(body.seed) ? body.seed : Math.floor(Math.random() * 999999999);
    try {
      const image = await motorImagem(motor, prompt, formato, seed);
      recordCost(MOTOR_USD[motor]).catch(() => {});
      return fim({ image, token: await marcaImagem(image), provider: '451', model: motor, estilo, formato, prompt, seed, quotas: reserved.quotas });
    } catch { return falha({ error: 'image_failed' }); }
  });
});

// Edição com referência (imagem a partir de imagem, até 1 referência por enquanto). Adulto: Chroma, só Pro,
// só com 18+ confirmado e só sobre imagens que o próprio 451 gerou (marca válida): foto enviada nunca vira nudez.
app.post('/api/image/edit', async (c) => {
  const plan = planOf(c), subjects = await subjectsOf(c, plan);
  const pro = plan === 'pro';
  let body = {};
  try { body = await c.req.json(); } catch {}
  const desc = (body.prompt || '').toString().trim().slice(0, 1500);
  const base = (body.base || '').toString().trim().slice(0, 1500); // prompt da imagem original, quando conhecido
  const imgs = (Array.isArray(body.images) ? body.images : []).slice(0, 3)
    .map((i) => ({ src: String((i && i.src) || ''), token: String((i && i.token) || '') }))
    .filter((i) => /^data:image\/[a-z+]+;base64,/i.test(i.src) && i.src.length < 9_000_000);
  if (!desc || !imgs.length) return c.json({ error: 'invalid_request' }, 400);
  const pronto = (body.final || '').toString().trim().slice(0, 1500);
  if (bloqueioImagem(desc) || bloqueioImagem(base) || (pronto && bloqueioImagem(pronto))) return c.json({ error: 'blocked', message: IMG_MSG_BLOQUEIO }, 400);
  const adulto = body.adulto === true || querAdulto(desc, pronto, base);
  const verificaAdulto = async () => {
    if (!pro) return { error: 'pro_only', message: MSG_ADULTO_PRO, status: 403 };
    if (body.confirmAge !== true) return { error: 'age_required', message: MSG_IDADE, status: 403 };
    for (const i of imgs) if (!i.token || i.token !== await marcaImagem(i.src)) {
      return { error: 'nsfw_edit_upload', message: 'Edição adulta só vale para imagens geradas aqui no 451, nunca para fotos enviadas.', status: 400 };
    }
    return null;
  };
  if (adulto) { const e = await verificaAdulto(); if (e) return c.json({ error: e.error, message: e.message }, e.status); }
  const formato = ['1:1', '3:4', '9:16', '16:9'].includes(body.formato) ? body.formato : '1:1';
  const charges = [{ resource: 'image_gen', bucket: pro ? 'pro' : 'free' }];
  const reserved = await consumeQuota(subjects, charges);
  if (!reserved.ok) return c.json({ error: 'limit_reached', quota: reserved.quota }, 429);
  return transmitir(async (fim) => {
    const falha = async (obj) => { await refundQuota(subjects, charges).catch(() => {}); fim(obj); };
    let instrucao = pronto;
    if (!instrucao) {
      const r = await imageIntent(desc, [{ role: 'assistant', img: true, text: base }], true).catch(() => ({ intent: 'text' }));
      if (r.intent === 'bloqueado') return falha({ error: 'blocked', message: IMG_MSG_BLOQUEIO });
      instrucao = r.prompt || desc;
    }
    // Imagem a partir de imagem precisa da cena inteira: junta o prompt original com a mudança pedida.
    const prompt = base ? `${base}\nChange: ${instrucao}` : instrucao;
    if (bloqueioImagem(prompt)) return falha({ error: 'blocked', message: IMG_MSG_BLOQUEIO });
    let motor = adulto ? 'chroma' : 'zimage';
    if (!adulto && querAdulto(prompt)) {
      const e = await verificaAdulto();
      if (e) return falha({ error: e.error, message: e.message });
      motor = 'chroma';
    }
    try {
      const image = await motorImagem(motor, prompt, formato, Math.floor(Math.random() * 999999999), imgs[0].src);
      recordCost(MOTOR_USD[motor]).catch(() => {});
      return fim({ image, token: await marcaImagem(image), provider: '451', model: motor, prompt, quotas: reserved.quotas });
    } catch { return falha({ error: 'image_failed' }); }
  });
});

// Classificador de intenção e sugestões: só modelo de texto, sem cota de imagem.
app.post('/api/image/intent', async (c) => {
  let body = {};
  try { body = await c.req.json(); } catch {}
  const text = (body.text || '').toString();
  if (!text.trim()) return c.json({ intent: 'text' });
  const r = await imageIntent(text, body.contexto, body.temImagem === true).catch(() => ({ intent: 'text', unavailable: true }));
  if (r.intent === 'bloqueado' || (r.intent !== 'text' && (bloqueioImagem(text) || bloqueioImagem(r.prompt || '')))) return c.json({ intent: 'bloqueado', message: IMG_MSG_BLOQUEIO });
  return c.json(r);
});
app.post('/api/image/followups', async (c) => {
  let body = {};
  try { body = await c.req.json(); } catch {}
  const suggestions = await imageFollowups((body.prompt || '').toString()).catch(() => []);
  return c.json({ suggestions });
});

