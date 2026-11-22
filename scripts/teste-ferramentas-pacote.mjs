import { executar, paraOpenAI } from '../src/ferramentas/index.js';
const casos = [
  ['cve_consultar', { id: 'CVE-2021-44228' }],
  ['cve_buscar', { termo: 'openssl', so_kev: true, limite: 3 }],
  ['pacote_vulnerabilidades', { pacote: 'org.apache.logging.log4j:log4j-core', ecossistema: 'Maven', versao: '2.14.1' }],
  ['pagina_ler', { url: 'https://example.com', max_caracteres: 600 }],
  ['ip_info', { ip: '1.1.1.1' }],
  ['dominio_info', { dominio: 'example.com', subdominios: false }],
  ['asn_info', { asn: 'AS13335' }],
  ['site_checar', { url: 'https://example.com' }],
  ['portas_publicas', { host: '1.1.1.1' }],
];
const bloqueios = [
  ['pagina_ler', { url: 'http://127.0.0.1:8000/' }],
  ['pagina_ler', { url: 'http://169.254.169.254/latest/meta-data/' }],
  ['pagina_ler', { url: 'http://localhost/' }],
  ['pagina_ler', { url: 'https://example.com:8443/' }],
  ['site_checar', { url: 'http://10.0.0.1' }],
  ['ip_info', { ip: '192.168.0.1' }],
];
console.log('ferramentas no formato OpenAI:', paraOpenAI().length);
let falhas = 0;
for (const [n, a] of casos) {
  const t0 = Date.now(); const r = await executar(n, a);
  if (!r.ok) falhas++;
  console.log(`${r.ok ? 'OK ' : 'ERRO'} ${n} (${Date.now() - t0} ms): ${r.texto.split('\n')[0].slice(0, 220)}`);
}
for (const [n, a] of bloqueios) {
  const r = await executar(n, a);
  const ok = !r.ok && /bloquead|privad|reservad|interno|só as portas|inválido|não há dado/i.test(r.texto);
  if (!ok) falhas++;
  console.log(`${ok ? 'BLOQUEOU' : 'FALHOU '} ${n} ${JSON.stringify(a)} → ${r.texto.slice(0, 120)}`);
}
console.log(falhas ? `${falhas} problema(s)` : 'tudo certo');
process.exit(falhas ? 1 : 0);
