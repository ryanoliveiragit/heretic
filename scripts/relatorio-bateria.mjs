// Uso: node scripts/relatorio-bateria.mjs <pasta antes> [pasta depois]
// Lê os JSON da bateria dos modelos locais e imprime um resumo em Markdown (acertos por grupo, tempos, falhas).
// Recalcula o idioma com a regra atual (só reprova se tiver mais inglês que português).
import { readdirSync, readFileSync, existsSync } from 'node:fs';

const [ANTES, DEPOIS] = process.argv.slice(2);
const sem = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2010-\u2015\u2212]/g, '-').toLowerCase(); // hífen especial (U+2011) vira -
const PT = /\b(que|nao|para|com|uma|um|voce|e|sao|esta|dos|das|do|da|no|na|em|por|mais|como|se|ao|os|as|segunda|terca|quarta|quinta|sexta|sabado|domingo|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|minutos?|reais|codigo|sim)\b/g;
const EN = /\b(the|and|is|are|you|with|for|this|that|of|to|it|on|monday|tuesday|wednesday|thursday|friday|saturday|sunday|minutes?|answer)\b/g;
const idiomaOk = (t) => { const s = sem(String(t).replace(/```[\s\S]*?```/g, ' ')); return (s.match(EN) || []).length <= (s.match(PT) || []).length; };
const le = (dir) => (dir && existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))) : []);
const mediana = (l) => { const v = l.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
const n1 = (v) => (v == null ? '—' : String(Math.round(v * 10) / 10).replace('.', ','));

function resumo(r) {
  const casos = r.casos;
  const grupos = {};
  for (const c of casos) { const g = grupos[c.grupo] || (grupos[c.grupo] = { ok: 0, n: 0 }); g.n += 1; g.ok += c.ok ? 1 : 0; }
  return {
    nome: r.nome, acertos: casos.filter((c) => c.ok).length, total: casos.length, grupos,
    naoPt: casos.filter((c) => c.grupo !== 'Código' && !idiomaOk(c.texto)).map((c) => c.id),
    lacos: casos.filter((c) => c.laco).map((c) => c.id), cortadas: casos.filter((c) => c.cortada).map((c) => c.id),
    erros: casos.filter((c) => c.erro).map((c) => `${c.id}: ${c.erro}`),
    frio: r.aquecimento?.s_total, med_total: mediana(casos.map((c) => c.s_total)), med_1o: mediana(casos.map((c) => c.s_1o_texto)),
    med_toks: mediana(casos.map((c) => c.tok_s)), max_total: Math.max(...casos.map((c) => c.s_total)),
    falhas: casos.filter((c) => !c.ok).map((c) => `${c.id} (${c.nota})`),
  };
}
function tabela(titulo, lista) {
  if (!lista.length) return;
  const rs = lista.map(resumo);
  const grupos = [...new Set(rs.flatMap((r) => Object.keys(r.grupos)))];
  console.log(`\n### ${titulo}\n`);
  console.log(`| | ${rs.map((r) => r.nome).join(' | ')} |`);
  console.log(`|---|${rs.map(() => '---').join('|')}|`);
  console.log(`| **Acertos** | ${rs.map((r) => `**${r.acertos}/${r.total}**`).join(' | ')} |`);
  for (const g of grupos) console.log(`| ${g} | ${rs.map((r) => (r.grupos[g] ? `${r.grupos[g].ok}/${r.grupos[g].n}` : '—')).join(' | ')} |`);
  console.log(`| Respondeu em português | ${rs.map((r) => (r.naoPt.length ? `falhou em ${r.naoPt.join(', ')}` : 'sempre')).join(' | ')} |`);
  console.log(`| 1ª resposta depois de carregar (s) | ${rs.map((r) => n1(r.frio)).join(' | ')} |`);
  console.log(`| Tempo típico por pergunta (s) | ${rs.map((r) => n1(r.med_total)).join(' | ')} |`);
  console.log(`| Pior tempo (s) | ${rs.map((r) => n1(r.max_total)).join(' | ')} |`);
  console.log(`| Velocidade típica (tokens/s) | ${rs.map((r) => n1(r.med_toks)).join(' | ')} |`);
  console.log(`| Cortadas / laço | ${rs.map((r) => `${r.cortadas.length} / ${r.lacos.length}`).join(' | ')} |`);
  for (const r of rs) if (r.falhas.length || r.erros.length) console.log(`\n- ${r.nome} errou: ${[...r.falhas, ...r.erros].join('; ')}`);
}
tabela('Antes', le(ANTES));
tabela('Depois', le(DEPOIS));
