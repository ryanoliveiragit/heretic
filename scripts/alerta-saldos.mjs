// Uso: node scripts/alerta-saldos.mjs
// Alerta diário de saldo do 451 (dono 21/11: "nunca ficar no vermelho"). Sem custo: lê o painel do 451
// (as mesmas chaves que o site usa) com a chave de administrador do cofre. Nunca imprime chave.
// Avisa quando OpenUncensored, OpenRouter ou RunPod estão abaixo de US$ 5, quando não deu para ler,
// quando o Claude falhou nas últimas 24 h (a Anthropic não tem API de saldo: falha = provável falta de
// crédito) ou quando o grátis passou do teto do dia. Sai em JSON: { alertas: [...], resumo: {...} }.
import { readFileSync } from 'node:fs';

const COFRE = '/home/ethical/.config/OpenBot/agent-api-keys/.vault/agent-93309c59-405f-4014-907c-1678704894c7';
const LIMITE_USD = 5;
const chave = (n) => { try { return readFileSync(`${COFRE}/${n}`, 'utf8').trim(); } catch { return ''; } };
const usd = (v) => `US$ ${Number(v).toFixed(2).replace('.', ',')}`;
const saida = { quando: new Date().toISOString(), alertas: [], resumo: {} };

try {
  const r = await fetch('https://451sh.com/api/admin/painel', { headers: { 'x-451-key': chave('KEY_451_ADMIN') }, signal: AbortSignal.timeout(45000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  const s = d.saldos || {};
  for (const [nome, v] of [['OpenUncensored', s.openuncensored_usd], ['OpenRouter', s.openrouter_usd], ['RunPod', s.runpod_usd]]) {
    saida.resumo[nome] = v == null ? 'sem leitura' : usd(v);
    if (v == null) saida.alertas.push(`${nome}: não deu para ler o saldo.`);
    else if (v < LIMITE_USD) saida.alertas.push(`${nome}: ${usd(v)}, abaixo de US$ ${LIMITE_USD}. Recarregar.`);
  }
  const dia = Date.now() - 86400000;
  const recentes = (d.mensagens || []).filter((m) => m.t >= dia && !m.imagem);
  const falhas = recentes.filter((m) => m.claude === 'falhou').length;
  const comClaude = recentes.filter((m) => m.claude).length;
  saida.resumo.claude_24h = `${comClaude} mensagens passaram pelo Claude, ${falhas} falharam`;
  if (falhas) saida.alertas.push(`Claude falhou em ${falhas} de ${comClaude} mensagens nas últimas 24 h: confira o crédito no Console da Anthropic.`);
  const hoje = (d.gratis?.dias || []).find((x) => x.dia === new Date().toISOString().slice(0, 10));
  saida.resumo.gratis_hoje_rs = hoje ? hoje.custo_rs : 0;
  saida.resumo.resultado_rs = d.totais?.resultado_rs ?? null;
  saida.resumo.custo_24h_rs = Math.round(recentes.reduce((t, m) => t + (Number(m.custo_rs) || 0), 0) * 100) / 100;
} catch (e) {
  saida.alertas.push(`O painel do 451 não respondeu (${e.message}): não deu para conferir os saldos.`);
}
console.log(JSON.stringify(saida, null, 1));
