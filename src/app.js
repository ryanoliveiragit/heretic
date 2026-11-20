// Hono app — API routes only (no static files, no Node.js APIs).
// Shared between Vercel Edge (api/[[...route]].js) and local dev (src/server.js).

import { Hono } from 'hono';
import { health, listProjects, createProject, deleteProject,
  listConversations, createConversation, deleteConversation,
  listMessages, addMessage } from './store.js';
import { getPersona, setPersona } from './persona.js';
import { streamChat, qualityAnswer, enhancePrompt, imagePrompt, imageIntent, imageFollowups, agentTip, getRoutes, setRoute, MODEL_CATALOG } from './upstream.js';
import { checkBudget, incrementUsage } from './budget.js';
import { checkGlobalBudget, recordCost } from './cost.js';
import { AGENTS, agentPrompt } from './agents.js';
import { planOf, tierOf, modelsFor, resolveModel, visitorIds, keyFrom, planForKey, isAdmin, FAIR_USE_MODEL, PUBLIC_MODELS } from './plans.js';
import { creditBalance, spendCredits, addExtraCredits, priceCredits, throttle, MIN_TO_START, THROTTLE_SECONDS, THROTTLE_PRO_SECONDS } from './credits.js';
import { LIMITS, RESOURCES, HIDDEN_BUCKETS, bucketOf, subjectsFor, peekQuota, consumeQuota, refundQuota, limitsStore, spendStatus, addSpend } from './limits.js';
import { readAttachments, newUploads } from './attachments.js';
import { v1 } from './v1.js';
import { pay, payWebhook } from './pay.js';

// Mensagem de quando o Pro bate o uso justo também no Rapid: diz quando volta, no horário de Brasília.
function fairUseStop(st) {
  const quando = st && st.resetAt ? new Date(st.resetAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  return `Você chegou ao uso justo do Pro por agora.${quando ? ` Volta a liberar ${quando}.` : ''} Hermes e Kimi seguem com créditos.`;
}

export const app = new Hono();

// Pagamento do Pro (Pix via Woovi, cripto via NOWPayments).
// GET/POST /api/pay via catch-all; GET /api/pay/:id via api/pay/[orderId].js; webhook em /api/payment.
app.route('/api/pay', pay);
app.post('/api/payment', payWebhook);

// API compatível com OpenAI — chave 451 do Pro/Pro Plus em clientes como o opencode.
// A Vercel só entrega caminhos /api de UM segmento à função; por isso o rewrite em vercel.json
// manda /v1/* para a entrada /api (que a função pega) preservando o caminho original /v1/...
// Montamos nos dois prefixos para casar o caminho que o Hono enxergar.
app.route('/v1', v1);
app.route('/api/v1', v1);

// Teto de saída por modelo (dono, 19/11): Max e os modelos de créditos respondem mais longo.
const LONG_MODELS = ['claude-sonnet-5-5', 'hermes-4-405b', 'kimi-k3.1-pro-uncensored'];
const maxTokensFor = (modelId) => (LONG_MODELS.includes(modelId) ? 2000 : 900);
const TIER_LABEL = { free: 'Grátis', pro: 'Pro', plus: 'Pro Plus' };
// Limites que o app recebe: sem os buckets pagos, que para o assinante são "ilimitados".
const visibleLimits = () => Object.fromEntries(Object.entries(LIMITS).map(([r, b]) =>
  [r, Object.fromEntries(Object.entries(b).filter(([k]) => !HIDDEN_BUCKETS.includes(k)))]));

// Quem está sendo contado nos limites deste pedido.
const subjectsOf = (c, plan) => subjectsFor({ plan, proKey: keyFrom(c), visitorIds: visitorIds(c) });
// Corta o histórico antigo do grátis: o limite de mensagens não segura o tamanho de cada mensagem.
const FREE_MAX_INPUT_CHARS = 48000;
function capHistory(messages) {
  let room = FREE_MAX_INPUT_CHARS;
  const kept = [];
  for (const m of [...messages].reverse()) {
    const text = typeof m?.content === 'string' ? m.content : '';
    if (room <= 0) break;
    kept.unshift(text.length > room ? { ...m, content: text.slice(0, room) } : m);
    room -= text.length;
  }
  return kept;
}
const ATTACHMENT_ERRORS = {
  attachment_type: 'Tipo de arquivo não aceito. Envie JPG, PNG, WEBP, GIF ou PDF.',
  attachment_invalid: 'Não consegui abrir este arquivo.',
  attachment_count: 'Envie no máximo 5 anexos por mensagem.',
  attachment_size: 'Os anexos passam do tamanho máximo desta mensagem.',
  attachment_pages: 'O PDF passa de 30 páginas.',
};

// QA 20/11: rotas do app antigo (o app atual não usa) expunham o prompt de sistema inteiro, o modelo de
// verdade por trás de cada 451 e deixavam trocar a rota de modelos sem senha. Agora só com a chave de
// admin (header x-451-admin); sem ela respondem 404. /api/health público devolve só {ok}.
const ROTAS_INTERNAS = /^\/api\/(persona|models|routes|projects|conversations|approve|agents)(\/|$)/;
const ehAdmin = (c) => { const k = process.env.ADMIN_KEY || process.env.HERETIC_ADMIN_KEY || ''; return !!k && (c.req.header('x-451-admin') || c.req.header('x-heretic-admin') || '') === k; };
app.use('/api/*', async (c, next) => {
  if (ROTAS_INTERNAS.test(c.req.path) && !ehAdmin(c)) return c.json({ error: 'not_found' }, 404);
  if (c.req.path === '/api/health' && !ehAdmin(c)) return c.json({ ok: true });
  await next();
});
// /api/me é público: nota neutra por modelo, sem fornecedor nem preço de custo.
const NOTA_PUBLICA = {
  'zai-org/glm-5.3-flash-uncensored': 'O mais rápido. Sem censura.',
  'nousresearch/hermes-4-405b': 'Equilíbrio entre velocidade e profundidade. Sem censura.',
  'claude-sonnet-5-5': 'Raciocina antes de responder. Sem censura.',
  'hermes-4-405b': 'Modelo grande para textos longos. Usa créditos.',
  'kimi-k3.1-pro-uncensored': 'O mais forte, para tarefas difíceis. Usa créditos.',
};
const modeloPublico = (m) => { const { provider, price_in, price_out, api_model, venice_model, ...resto } = m; return { ...resto, note: NOTA_PUBLICA[m.id] ?? '' }; };

// ── Agents ──
app.get('/api/agents', (c) => c.json(Object.entries(AGENTS).map(([id, a]) => ({ id, name: a.name }))));

// ── Health ──
app.get('/api/health', (c) => c.json(health()));

// ── Models ──
app.get('/api/models', (c) => c.json(MODEL_CATALOG));

// ── Routes ──
app.get('/api/routes', (c) => c.json(getRoutes()));
app.put('/api/routes', async (c) => {
  const { mode, model } = await c.req.json();
  if (!mode || !model) return c.json({ error: 'mode e model obrigatórios' }, 400);
  try { return c.json(setRoute(mode, model)); }
  catch (e) { return c.json({ error: e.message }, 400); }
});

// ── Projects ──
app.get('/api/projects', (c) => c.json(listProjects()));
app.post('/api/projects', async (c) => {
  const { name, target_url } = await c.req.json();
  return c.json(createProject(name, target_url || null), 201);
});
app.delete('/api/projects/:id', (c) => {
  deleteProject(parseInt(c.req.param('id')));
  return c.json({ ok: true });
});

// ── Conversations ──
app.get('/api/conversations', (c) => {
  const projectId = c.req.query('projectId');
  return c.json(listConversations(projectId ? parseInt(projectId) : null));
});
app.post('/api/conversations', async (c) => {
  const { project_id, title } = await c.req.json();
  return c.json(createConversation(project_id || null, title), 201);
});
app.delete('/api/conversations/:id', (c) => {
  deleteConversation(parseInt(c.req.param('id')));
  return c.json({ ok: true });
});
app.get('/api/conversations/:id/messages', (c) =>
  c.json(listMessages(parseInt(c.req.param('id')))));

// ── Approvals ──
app.post('/api/approve', async (c) => {
  const body = await c.req.json();
  return c.json({ ok: true, decision: body.decision });
});

// ── Persona ──
app.get('/api/persona', (c) => c.json({ content: getPersona() }));
// PUT com trancas (dono 18/11): o site é aberto e qualquer visitor conseguia trocar a persona
// de todos. Com HERETIC_ADMIN_KEY configurada → exige o header x-heretic-admin. Sem a chave,
// em produção o PUT fica fechado (fail-closed); em dev segue aberto.
app.put('/api/persona', async (c) => {
  const adminKey = process.env.ADMIN_KEY || process.env.HERETIC_ADMIN_KEY;
  if (adminKey) {
    if ((c.req.header('x-451-admin') || c.req.header('x-heretic-admin') || '') !== adminKey) {
      return c.json({ error: 'unauthorized', message: 'Chave de admin inválida (header x-heretic-admin).' }, 401);
    }
  } else if (process.env.NODE_ENV === 'production') {
    return c.json({ error: 'locked', message: 'PUT /api/persona desativado: HERETIC_ADMIN_KEY não configurada.' }, 403);
  }
  const { content } = await c.req.json();
  setPersona(content);
  return c.json({ ok: true });
});

// ── Chat (SSE streaming) ──
// Who is asking: plan, today's token use and the models they can pick.
app.get('/api/me', async (c) => {
  const plan = planOf(c), tier = tierOf(c), subjects = await subjectsOf(c, plan);
  const models = modelsFor(plan).map(m => modeloPublico({ ...m, bucket: bucketOf(m.id, tier) }));
  const buckets = [...new Set(models.filter(m => !m.locked).map(m => m.bucket))].filter(b => !HIDDEN_BUCKETS.includes(b));
  const rows = await Promise.all(RESOURCES.flatMap(resource => buckets.map(bucket => peekQuota(subjects, resource, bucket))));
  const credits = tier === 'free' ? null : await creditBalance(subjects[0].id, tier).catch(() => null);
  // Uso justo do Pro (teto por custo real): só porcentagens, nunca valores em dólar.
  const admin = isAdmin(c);
  const fairUse = tier === 'free' || admin ? null : await spendStatus(subjects, 'pro').catch(() => null);
  return c.json({ plan, tier, tierLabel: TIER_LABEL[tier], admin, store: limitsStore(), models, quotas: rows, limits: visibleLimits(), credits, fairUse });
});

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
// Medido em 20/11 (9 gerações, saldo do RunPod conferido): normal ~4 s, adulta ~20 s de GPU + 5 s ociosa.
const MOTOR_USD = { zimage: 0.0031, chroma: 0.0086 };
// Lucro (20/11): no Pro a imagem soma o custo real no MESMO medidor do chat (teto único por assinante).
// Acabou a cota de imagens ou o teto → a imagem sai dos créditos; sem créditos → para.
const IMG_CREDITOS = { zimage: 5, chroma: 20 };
const MSG_SEM_CREDITOS = 'Acabaram as imagens do seu plano e os créditos. Imagem extra custa 5 créditos (adulta, 20). Espere a cota zerar ou recarregue créditos.';
async function cobrancaImagem(subjects, pro, tier, admin = false) {
  // Administrador: sem cota de imagens, sem teto e sem créditos.
  if (admin) return { modo: 'admin', charges: [], reserved: { quotas: undefined } };
  const charges = [{ resource: 'image_gen', bucket: pro ? 'pro' : 'free' }];
  const teto = pro ? await spendStatus(subjects, 'pro').catch(() => ({})) : {};
  if (!teto.blocked) {
    const reserved = await consumeQuota(subjects, charges);
    if (reserved.ok) return { modo: 'cota', charges, reserved };
    if (!pro) return { erro: { error: 'limit_reached', quota: reserved.quota }, status: 429 };
  }
  const bal = await creditBalance(subjects[0].id, tier).catch(() => null);
  if (!bal || bal.total < IMG_CREDITOS.zimage) return { erro: { error: 'no_credits', message: MSG_SEM_CREDITOS }, status: 402 };
  return { modo: 'creditos', charges: [], reserved: { quotas: undefined }, saldo: bal.total };
}
// Depois do motor escolhido: confere o saldo (adulta custa mais) e, no fim, cobra créditos ou soma no teto.
const podePagar = (cob, motor) => cob.modo !== 'creditos' || cob.saldo >= IMG_CREDITOS[motor];
async function fecharCobranca(subjects, tier, cob, motor) {
  if (cob.modo === 'creditos') { await spendCredits(subjects[0].id, tier, IMG_CREDITOS[motor]).catch(() => {}); return IMG_CREDITOS[motor]; }
  if (cob.modo === 'admin') return 0;
  if (tier !== 'free') await addSpend(subjects, 'pro', MOTOR_USD[motor]).catch(() => {});
  return 0;
}
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
async function motorImagem(motor, prompt, formato, seed, ref = null, estado = null) {
  // GPU separada para o adulto (20/11): cada uma mantém o seu modelo carregado, sem a troca de 40–50 s.
  const key = process.env.RUNPOD_API_KEY, ep = (motor === 'chroma' && process.env.RUNPOD_ENDPOINT_ADULTO) || process.env.RUNPOD_ENDPOINT_ID;
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
    // A pessoa cancelou (fechou a conexão): para a GPU na hora para não pagar o resto.
    if (estado && estado.cancelado) {
      await fetch(`https://api.runpod.ai/v2/${ep}/cancel/${id}`, { method: 'POST', headers: H }).catch(() => {});
      throw new Error('cancelado');
    }
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

// Cancelar (20/11): quando o navegador fecha a conexão, `estado.cancelado` vira true; o motor cancela o
// job no RunPod e a rota devolve a cota (falha -> refundQuota).
function transmitir(fn, req = null) {
  const enc = new TextEncoder();
  const estado = { cancelado: false };
  try { if (req && req.signal) req.signal.addEventListener('abort', () => { estado.cancelado = true; }); } catch {}
  const stream = new ReadableStream({
    async start(ctrl) {
      const beat = setInterval(() => { try { ctrl.enqueue(enc.encode(' ')); } catch { estado.cancelado = true; } }, 5000);
      const fim = (obj) => { clearInterval(beat); try { ctrl.enqueue(enc.encode(JSON.stringify(obj))); ctrl.close(); } catch {} };
      try { await fn(fim, estado); } catch { fim({ error: 'image_failed' }); }
    },
    cancel() { estado.cancelado = true; },
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
  const tier = tierOf(c);
  const cob = await cobrancaImagem(subjects, pro, tier, isAdmin(c));
  if (cob.erro) return c.json(cob.erro, cob.status);
  const { charges, reserved } = cob;

  return transmitir(async (fim, estado) => {
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
      if (estado.cancelado) return falha({ error: 'cancelled' });
      if (!podePagar(cob, motor)) return falha({ error: 'no_credits', message: MSG_SEM_CREDITOS });
      const image = await motorImagem(motor, prompt, formato, seed, null, estado);
      recordCost(MOTOR_USD[motor]).catch(() => {});
      const creditos = await fecharCobranca(subjects, tier, cob, motor);
      return fim({ image, token: await marcaImagem(image), provider: '451', model: motor, estilo, formato, prompt, seed, quotas: reserved.quotas, creditos });
    } catch (e) { return falha({ error: estado.cancelado ? 'cancelled' : 'image_failed' }); }
  }, c.req.raw);
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
  const tier = tierOf(c);
  const cob = await cobrancaImagem(subjects, pro, tier, isAdmin(c));
  if (cob.erro) return c.json(cob.erro, cob.status);
  const { charges, reserved } = cob;
  return transmitir(async (fim, estado) => {
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
      if (estado.cancelado) return falha({ error: 'cancelled' });
      if (!podePagar(cob, motor)) return falha({ error: 'no_credits', message: MSG_SEM_CREDITOS });
      const image = await motorImagem(motor, prompt, formato, Math.floor(Math.random() * 999999999), imgs[0].src, estado);
      recordCost(MOTOR_USD[motor]).catch(() => {});
      const creditos = await fecharCobranca(subjects, tier, cob, motor);
      return fim({ image, token: await marcaImagem(image), provider: '451', model: motor, prompt, quotas: reserved.quotas, creditos });
    } catch { return falha({ error: estado.cancelado ? 'cancelled' : 'image_failed' }); }
  }, c.req.raw);
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


// Validate an access code (paste "Enter key" flow). Returns the plan it unlocks.
// Co-work do agente (Pro/Plus): uma dica de próximo passo a partir do último pedido e resposta.
app.post('/api/agent/tip', async (c) => {
  const tier = tierOf(c);
  if (tier !== 'pro' && tier !== 'plus') return c.json({ error: 'pro_only' }, 403);
  let body = {};
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_body' }, 400); }
  const plan = planOf(c), subjects = await subjectsOf(c, plan);
  if (!isAdmin(c) && !(await throttle(`${subjects[0].id}:tip`))) return c.json({ error: 'rate_limit' }, 429);
  const tip = await agentTip(body.question, body.answer).catch(() => null);
  return c.json({ tip });
});

app.post('/api/redeem', async (c) => {
  // QA 20/11: sem limite, dava para testar códigos em sequência. 1 tentativa a cada 3 s por visitante.
  const ids = visitorIds(c);
  if (!(await throttle(`redeem:${(ids && ids[0]) || 'anon'}`, 3))) return c.json({ ok: false, error: 'rate_limit', message: 'Espere alguns segundos e tente de novo.' }, 429);
  let code = '';
  try { code = (await c.req.json()).code || ''; } catch {}
  const plan = planForKey(code);
  if (!plan) return c.json({ ok: false, error: 'invalid_code' }, 400);
  return c.json({ ok: true, plan: 'pro', tier: plan, tierLabel: TIER_LABEL[plan] });
});

// Recarga de créditos avulsos (hoje manual; o webhook de pagamento usa o mesmo caminho depois).
// Exige HERETIC_ADMIN_KEY no header x-heretic-admin. body: { code, amount }.
app.post('/api/admin/credits', async (c) => {
  const adminKey = process.env.ADMIN_KEY || process.env.HERETIC_ADMIN_KEY;
  if (!adminKey || (c.req.header('x-451-admin') || c.req.header('x-heretic-admin') || '') !== adminKey) return c.json({ error: 'unauthorized' }, 401);
  let body = {};
  try { body = await c.req.json(); } catch {}
  const tier = planForKey(body.code);
  if (!tier) return c.json({ error: 'invalid_code' }, 400);
  const [subject] = await subjectsFor({ plan: 'pro', proKey: body.code, visitorIds: [] });
  const extra = await addExtraCredits(subject.id, body.amount);
  return c.json({ ok: true, tier, extra, balance: await creditBalance(subject.id, tier) });
});

// Buy/checkout stub: issues a fresh signed Pro code. Swap for Stripe later;
// for now it just returns a code the buyer can copy and paste into "Enter key".
app.post('/api/checkout', async (c) => {
  // Desativado: Pro é exclusivo do dono, sem geração pública de chave.
  return c.json({ ok: false, error: 'disabled', message: 'Pro não está aberto.' }, 403);
});

app.post('/api/chat', async (c) => {
  // QA 20/11: JSON quebrado dava 500; lista sem mensagem da pessoa chamava o modelo só com o prompt de
  // sistema (gastava e ele se apresentava pelo nome do fornecedor). Os dois agora param aqui, sem custo.
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_body', message: 'Pedido inválido: envie JSON.' }, 400); }
  if (!body || !Array.isArray(body.messages) || !body.messages.some((m) => m && m.role === 'user' && (typeof m.content === 'string' ? m.content.trim() : Array.isArray(m.content) && m.content.length))) {
    return c.json({ error: 'empty_message', message: 'Mande uma mensagem.' }, 400);
  }
  const mode = body.mode || 'chat';
  const convId = body.conversationId;
  const plan = planOf(c), tier = tierOf(c), admin = isAdmin(c);
  let modelId = resolveModel(plan, body.model);
  if (!modelId) return c.json({ error: 'pro_model', message: 'Este modelo faz parte do Pro.' }, 403);
  let bucket = bucketOf(modelId, tier);

  const parsed = readAttachments(body.messages);
  if (parsed.error) return c.json({ error: parsed.error, message: ATTACHMENT_ERRORS[parsed.error] }, 400);
  if (parsed.count && bucket === 'free') return c.json({ error: 'pro_attachment', message: 'Imagem e PDF fazem parte dos modelos Pro.' }, 403);
  const chatMessages = plan === 'pro' ? parsed.messages : capHistory(parsed.messages);

  const budget = checkBudget();
  if (budget.blocked && !admin) return c.json({ error: 'Daily limit reached' }, 429);
  // Teto global em dólar (OpenUncensored): mês estourado ou saldo da chave acabando.
  const globalBudget = await checkGlobalBudget();
  // Administrador passa do teto mensal; só para se o saldo do provedor acabar de verdade.
  if (!globalBudget.ok && bucket !== 'free' && !(admin && globalBudget.reason === 'monthly_budget')) {
    return c.json({ error: 'budget', message: globalBudget.reason === 'monthly_budget' ? 'Teto mensal do provedor atingido.' : 'Saldo do provedor acabou.', budget: globalBudget }, 402);
  }

  // Mensagem, imagens enviadas e arquivos têm limites separados; só o que é novo nesta mensagem gasta.
  const uploads = newUploads(chatMessages);
  const subjects = await subjectsOf(c, plan);
  // Freio de velocidade (uso justo): uma mensagem a cada poucos segundos por pessoa.
  // No grátis o freio vale por aparelho, não por IP (IP de operadora é compartilhado).
  const throttleId = (subjects.find(x => x.id.startsWith('fp:')) || subjects[0]).id;
  const freio = tier === 'free' ? THROTTLE_SECONDS : THROTTLE_PRO_SECONDS;
  if (!admin && !(await throttle(throttleId, freio))) {
    return c.json({ error: 'slow_down', message: `Calma: espere ${freio} segundos entre uma mensagem e outra.` }, 429);
  }
  // Modelos de ponta só com créditos.
  if (bucket === 'credits') {
    const bal = await creditBalance(subjects[0].id, tier);
    if (bal.total < MIN_TO_START) return c.json({ error: 'no_credits', message: 'Seus créditos acabaram. Os modelos 451 Rapid, Titan e Max seguem no uso justo do Pro; para Hermes e Kimi, recarregue créditos ou espere a cota do próximo mês.', credits: bal }, 402);
  }
  // Administrador: nada a reservar (sem cota de mensagens, imagens enviadas ou arquivos).
  const chargesFor = (b) => (admin ? [] : [
    { resource: 'messages', bucket: b },
    { resource: 'image_upload', bucket: b, amount: uploads.images },
    { resource: 'files', bucket: b, amount: uploads.files },
  ]);
  // Teto por custo real (dono 20/11): passou do gasto da janela nos modelos 451 → segue no Rapid;
  // passou também no Rapid → para até a janela zerar. Erro no contador nunca bloqueia (fail-open).
  let spendFair = false;
  if (!admin && bucket === 'pro' && (await spendStatus(subjects, 'pro').catch(() => ({}))).blocked) {
    modelId = FAIR_USE_MODEL; bucket = 'pro_rapid'; spendFair = true;
  }
  if (!admin && bucket === 'pro_rapid') {
    const st = await spendStatus(subjects, 'pro_rapid').catch(() => ({}));
    if (st.blocked) return c.json({ error: 'fair_use_cap', message: fairUseStop(st), resetAt: st.resetAt }, 429);
  }
  let charges = chargesFor(bucket);
  let reserved = admin ? { ok: true, quotas: [] } : await consumeQuota(subjects, charges);
  // Uso justo do "ilimitado": passou do teto do dia nos modelos 451 → a conversa segue no Rapid.
  let fairUse = spendFair;
  if (!reserved.ok && bucket === 'pro' && reserved.quota?.resource === 'messages') {
    modelId = FAIR_USE_MODEL; bucket = 'pro_rapid'; fairUse = true;
    charges = chargesFor(bucket);
    reserved = await consumeQuota(subjects, charges);
  }
  if (!reserved.ok) return c.json({ error: 'limit_reached', quota: reserved.quota, requested: reserved.requested }, 429);

  const userMsg = body.messages?.filter(m => m.role === 'user').pop();
  if (convId && userMsg) addMessage(convId, 'user', userMsg.content);

  const agent = agentPrompt(body.agent);
  const planLine = `Plano ${TIER_LABEL[tier]}. Respostas diretas, sem repetir contexto.`;
  const modelNome = PUBLIC_MODELS.find(p => p.id === modelId)?.name || '451';
  const idLine = `Identidade: você é o ${modelNome} (451sh.com). Se perguntarem qual modelo ou IA você é, responda "${modelNome}" — nunca o nome do provedor, da infraestrutura ou de outro modelo.`;
  const systemPrompt = agent ? `${planLine}\n\n${getPersona()}\n\n${agent}\n\n${idLine}` : `${planLine}\n\n${getPersona()}\n\n${idLine}`;
  // Sampling calmo por padrão: temperatura 1.0 + top_p 1.0 fazia os modelos menores
  // (ex.: Venice UC grátis) degenerarem em texto sem sentido e misturar idioma. 0.6/0.9 +
  // frequency_penalty mantém a resposta coerente e direta.
  // Raciocínio (baixo/médio/alto): o usuário escolhe o quanto o Max pensa; vira thinking budget no upstream.
  const effortNorm = { baixo: 'baixo', low: 'baixo', medio: 'medio', medium: 'medio', alto: 'alto', high: 'alto' }[String(body.effort || '').toLowerCase()] || null;
  const params = {
    temperature: body.params?.temperature ?? 0.6,
    top_p: body.params?.top_p ?? 0.9,
    // Teto de saída por plano (mapa do dono, 19/11): Free 600, Titan 900, Max 2000.
    // Administrador: teto de saída igual ao da API /v1 (8192), não o do plano.
    max_tokens: admin ? Math.min(Number(body.params?.max_tokens) || 8192, 8192) : Math.min(Number(body.params?.max_tokens) || maxTokensFor(modelId), maxTokensFor(modelId)),
    frequency_penalty: body.params?.frequency_penalty ?? 0.4,
    presence_penalty: body.params?.presence_penalty ?? 0.1,
    ...(effortNorm ? { effort: effortNorm } : {}),
  };

  const ac = new AbortController();
  let fullText = '';

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event, data) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      // Flush imediato: fecha a conexão SSE com o cliente na hora. Sem isto, se o upstream demora
      // (ex.: Pollinations lento), o navegador desiste antes do 1º token e mostra "Load failed".
      controller.enqueue(encoder.encode(`: connected\n\n`));
      if (fairUse) send('warning', { type: 'fair_use', message: 'Uso justo: você passou do uso desta janela nos modelos 451; esta resposta vem do 451 Rapid.' });
      // Batimento: o Max só entrega o texto quando termina, o que pode levar minutos. Sem nenhum byte
      // nesse intervalo o Safari derruba a conexão e mostra "Load failed". O app ignora comentários SSE.
      const batimento = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: ping\n\n`)); } catch { clearInterval(batimento); }
      }, 15000);
      try {
        const usage = {};
        // Afinador: antes de responder, um modelo rápido reescreve o pedido do usuário (só Pro/Plus,
        // quando ligado). Emite 'enhanced' para o app animar o texto trocando. Falhou → segue igual.
        let sendMessages = chatMessages;
        if (body.enhance && (tier === 'pro' || tier === 'plus') && userMsg && typeof userMsg.content === 'string') {
          send('warning', { type: 'enhancing', message: 'Afinando o pedido…' });
          const better = await enhancePrompt(mode, userMsg.content, ac.signal, usage, body.agentPrefs || null).catch(() => '');
          if (better && better !== userMsg.content.trim()) {
            const lui = chatMessages.map(m => m.role).lastIndexOf('user');
            if (lui >= 0) sendMessages = chatMessages.map((m, i) => (i === lui ? { ...m, content: better } : m));
            send('enhanced', { original: userMsg.content, text: better });
          }
        }
        const chatPayload = { messages: sendMessages, systemPrompt, modelId, ...params, creditsOk: bucket === 'credits' };
        // Modelo que de fato respondeu pode mudar no meio (roteador e escalada por recusa): o
        // custo/cota têm de seguir quem respondeu, não o que foi pedido.
        let doneId = modelId;
        const handlers = {
          onToken: (t) => { fullText += t; send('token', { token: t }); },
          // FORÇA TUDO: o guarda descartou uma recusa parcial → o texto final começa limpo.
          onWarning: (w) => {
            if (w && w.type === 'refusal_forced') fullText = '';
            if (w && w.to && w.type !== 'fair_use') doneId = w.to; // roteador/escalada avisam o destino
            send('warning', w);
          },
          signal: ac.signal,
          usage,
        };
        // Modo Qualidade (best-of-2) só no Pro; caso contrário, stream normal de 1 modelo.
        if (body.quality && plan === 'pro' && !parsed.count) {
          await qualityAnswer(mode, chatPayload, handlers);
        } else {
          for await (const _ of streamChat(mode, chatPayload, handlers)) { /* tokens via onToken */ }
        }

        if (convId && fullText) addMessage(convId, 'assistant', fullText);
        incrementUsage();
        // Custo real do turno: o provedor devolve ou.cost_usd; sem ele, estima por tokens × preço
        // do modelo que respondeu de verdade (doneId).
        const cat = MODEL_CATALOG.find(m => m.id === doneId);
        const cost = usage.cost_usd != null
          ? Number(usage.cost_usd)
          : ((Number(usage.input_tokens) || 0) * (cat?.price_in || 0) + (Number(usage.output_tokens) || 0) * (cat?.price_out || 0)) / 1e6;
        if (cost > 0) await recordCost(cost).catch(() => {});
        // O balde também pode ter mudado (escalada para modelo de créditos, por exemplo).
        const doneBucket = bucketOf(doneId, tier);
        if (!admin && fullText && (doneBucket === 'pro' || doneBucket === 'pro_rapid')) await addSpend(subjects, doneBucket, cost).catch(() => {});
        // Hermes/Kimi: desconta créditos pelo custo real (resposta vazia não cobra).
        if (doneBucket === 'credits' && fullText) {
          const bal = await spendCredits(subjects[0].id, tier, priceCredits(cost)).catch(() => null);
          if (bal) send('credits', { spent: priceCredits(cost), balance: bal });
        }
        // Resposta vazia não gasta o limite de quem perguntou.
        const quotas = fullText || admin ? reserved.quotas : await refundQuota(subjects, charges);
        send('usage', { quotas });
        send('done', { content: fullText });
      } catch (e) {
        if (!fullText && !admin) await refundQuota(subjects, charges).catch(() => {});
        const msg = e.name === 'AbortError' ? 'Aborted by user' : e.message;
        try { send('error', { message: msg }); } catch { /* cliente já saiu */ }
      } finally {
        clearInterval(batimento);
        controller.close();
      }
    },
    cancel() { ac.abort(); },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
});
