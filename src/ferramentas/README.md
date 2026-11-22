# 451-ferramentas

Ferramentas de consulta para o chat e o agente do 451, no formato do `src/agent/tools` (cada uma exporta `name`, `description`, `schema` e `run(args)`; resultado cortado em 40 KB).
JavaScript puro (ESM), Node 18+, sem dependências. Teste: `node teste.mjs` (9 consultas reais e 6 tentativas de SSRF que precisam ser bloqueadas).

## Ferramentas
| Nome | O que faz | Fontes |
|---|---|---|
| `cve_consultar` | CVE por ID: descrição, CVSS e vetor, CWE, KEV (data, ransomware, prazo), EPSS, referências | NVD, CISA KEV, FIRST EPSS |
| `cve_buscar` | CVEs por palavra-chave, com filtro só KEV e CVSS mínimo | NVD, CISA KEV, EPSS |
| `pacote_vulnerabilidades` | Falhas de um pacote e versão (npm, PyPI, Maven, Go, crates, NuGet, RubyGems, Packagist, Debian, Ubuntu…) e versões corrigidas | OSV |
| `pagina_ler` | Texto de uma página pública | a própria página |
| `ip_info` | Dono e faixa, país, ASN, DNS reverso, portas vistas publicamente | RDAP, RIPEstat, Shodan InternetDB |
| `dominio_info` | DNS (A, AAAA, MX, NS, TXT, CAA, SOA), registro (registrador, datas, status), subdomínios em certificados | DNS, RDAP, crt.sh |
| `asn_info` | Dono do ASN e faixas anunciadas | RIPEstat |
| `site_checar` | Uma visita: status, redirecionamentos, servidor, cabeçalhos de segurança, cookies, certificado TLS | o próprio site |
| `portas_publicas` | Portas, serviços e CVEs vistos por varreduras públicas | Shodan InternetDB |

Toda resposta traz `resumo`, `dados`, `fontes` numeradas ([1], [2]…) e `limitacoes`. `executar(nome, args)` devolve o texto pronto para o modelo e nunca lança erro (erro vira frase clara).

## Segurança
- `pagina_ler` e `site_checar` só acessam http/https nas portas 80 e 443. O nome é resolvido antes, e qualquer IP privado, de loopback, link-local (inclusive metadados de nuvem 169.254.169.254), CGNAT, multicast ou reservado é recusado. A conexão fica presa ao IP conferido e cada redirecionamento é conferido de novo. Sem cookies; até 10 MB e 15 s; respeita robots.txt.
- Nada faz varredura ou teste ativo: portas vêm de varreduras públicas de terceiros. `site_checar` é uma visita comum de navegador.
- `.onion`, `localhost`, `.local` e `.internal` são bloqueados.

## Como ligar no chat
```js
import { paraOpenAI, paraAnthropic, executar, INSTRUCAO_SISTEMA } from './451-ferramentas/index.js';

// OpenRouter / OpenAI (function calling)
const body = { model, messages: [{ role: 'system', content: sistema + '\n' + INSTRUCAO_SISTEMA }, ...msgs], tools: paraOpenAI() };
// quando vier tool_calls: para cada uma
const { texto } = await executar(call.function.name, call.function.arguments);
msgs.push({ role: 'tool', tool_call_id: call.id, content: texto });

// Anthropic Messages: tools: paraAnthropic(); devolva { type: 'tool_result', tool_use_id, content: texto }
```
- O modelo deve citar como [n]. Na tela, as fontes podem abrir num painel ao lado da resposta.
- Limite sugerido: até 6 chamadas de ferramenta por turno.
- Variável opcional `NVD_API_KEY` (grátis em nvd.nist.gov). Sem ela, o NVD aceita 5 consultas a cada 30 s; o pacote já guarda em cache por 1 h.
- O KEV da CISA (cerca de 1,5 MB) é baixado uma vez e fica 6 h em cache.

## Próximas fases (não incluídas)
- Análise estática de arquivos (APK, ELF, PE, PDF, ZIP) num container sem rede, sem executar nada.
- Base de conhecimento de segurança: CVE → CWE → CAPEC → ATT&CK e relatórios públicos de bug bounty, com busca.
- Servidor MCP e CLI do 451 expondo as mesmas ferramentas.
- Busca em índices da dark web: só com pedido explícito do usuário, bloqueio de abuso infantil e sem abrir páginas sozinha. Depende de decisão do dono.
