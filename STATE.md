## 2026-11-21 (15h) — Bateria dos modelos locais + melhorias; busca na web consertada

Pedido do dono: "bateria de testes e melhorias" nos modelos locais (Qwen 35B, Gemma 26B, gpt-oss 20B).
- Bateria: `scripts/bateria-locais.mjs` (17 casos pelo caminho do site: português, contas/datas exatas,
  código rodado com testes, pizza/opções/tabela do app, instrução, texto longo, identidade, velocidade,
  laço e corte); resumo `scripts/relatorio-bateria.mjs`; amostras repetidas `scripts/amostras-gptoss.mjs`.
  Custo zero (tudo local). Antes → depois: Gemma 14/17 → 17/17 (típico 20,4 s → 1,6 s); Qwen 16 → 15/17
  (erra dia da semana sem raciocínio; só admin); gpt-oss 17/17 e 14/17 em duas rodadas → 16/17 com a nota
  do servidor (25 amostras: 17/25 → 22/25, inglês 1 → 0, mediana 1,9 s → 1,4 s).
- Publicado: Gemma com `enable_thinking: false` (o raciocínio escondido gastava os 900 tokens e a resposta
  saía vazia); teto de saída por modelo local (`max_out`: gpt-oss 2.000, Qwen 1.800, Gemma 1.500; antes o
  grátis cortava em 900); guarda de tempo de 265 s (`LOCAL_PRAZO_MS`): fecha com o texto parcial e aviso
  de "continue" em vez de a Vercel cortar em ~300 s e sumir a resposta (2 da Gemma sumiram às 13h35);
  nota do servidor no fim da pergunta dos locais (data de hoje em Brasília, dia da semana calculado das
  datas citadas, lembrete de idioma se a pergunta é em português). Teste: `scripts/teste-prazo-local.mjs`.
- OpenRouter (regressão minha): a chave do cofre é de GESTÃO (lê saldo/cria chaves, não gera texto). Das
  03:14 às ~14:30 a busca na web e a reserva Dolphin ficaram fora. Criei com ela a chave de uso "451 site
  (Vercel) 21/11" (hash b4983ead5f…, sem limite) e pus em `OPENROUTER_API_KEY`; a de gestão ficou em
  `OPENROUTER_MGMT_KEY` só para o painel ler o saldo. Apagar a chave nova: openrouter.ai/settings/keys.
- Deploys: `dpl_9d3hiSpkis1tFYFxYdZgeU8kGfvE` (busca) e `dpl_8kyM17eVga6uPJut9tVtWixEPBm5` (nota). Voltar
  o deploy para antes de 14h30 traria de volta a chave quebrada: para desfazer, reverta o commit e publique.
- Prints para o X (pedido do Super Hacking): `Shared/451-prints-x/` (busca no ar, com fontes). O print de
  "troca de modelo na recusa" não existe: a tela não mostra essa troca (só o aviso do pré-roteador).

## 2026-11-21 (04h52) — PUBLICADO: gpt-oss-20b Heretic grátis e sem limite para todos

O dono escolheu o vencedor dos modelos locais (via Super Hacking): gpt-oss-20b Heretic (menos recusas
que o Qwen, acertou código, conta e dia da semana, o mais rápido). Na porta 8000 ele já é o padrão.
- Vercel: `LOCAL_FREE_MODEL=local:gptoss20b` (Production e Preview). Ele aparece no seletor de todos em
  "No seu plano", rótulo "gpt-oss-20b Heretic", nota "Grátis e sem limite de mensagens. Roda no
  computador do 451 e pode ter fila." Sem cota, sem custo, sem contador de mensagens; o freio de 8 s
  entre mensagens do grátis continua (anti-spam). Qwen 35B e Gemma 26B: só o admin, em "Em teste (só você)".
- Prompt dos locais: regra de idioma no fim ("responda sempre no idioma do usuário…"), porque o gpt-oss
  respondeu "Monday" numa pergunta curta em português. Testado: "Sábado", "segunda-feira".
- Conferido no ar como usuário comum (sem chave), escolhendo no seletor: resposta "Sábado" em 5,5 s,
  painel com custo R$ 0. Deploy `dpl_3F14k5Fh1E3H56xs7eqR4VXXTHVW`; 8 arquivos conferidos por sha1.
  **Undo:** `npx vercel rollback https://451sh-9w2j842i6-dwadwdwas-projects.vercel.app --scope dwadwdwas-projects`
  (ou tirar `LOCAL_FREE_MODEL` da Vercel e publicar de novo).

## 2026-11-21 (04h12) — PUBLICADO: modelos locais no site (só admin) com aviso de fila

Pedido do dono via agente Super Hacking: testar no site os 3 modelos locais do gateway dele (porta 8000:
Qwen3.6 35B, Gemma 4 26B, gpt-oss 20B), escolher o melhor e depois deixá-lo grátis e sem limite, com aviso
de fila. Porta 8000, gateway e serviços do llama são DELE: não mexer.
- Ponte: `porteiro-local/porteiro.mjs` (serviço `porteiro-451.service` do usuário, liga no boot) ouve em
  127.0.0.1:8017, só aceita o segredo `x-451-local` (arquivo `/home/ethical/.config/451-local/token`, 600;
  na Vercel `LOCAL_LLM_TOKEN`), repassa à 8000 só os 3 nomes de modelo, corta a saída em 2.048 tokens, e
  mantém um túnel rápido da Cloudflare (trycloudflare) avisando o endereço ao site (`POST
  /api/local/registro` → Redis `451:local:url`). Log sem conteúdo em `porteiro-local/porteiro.log`.
  Comandos: `systemctl --user status|restart|stop porteiro-451.service`.
- Site: provedor `local` (src/local.js + upstream.js `streamLocal`): sem nenhuma chamada paga (sem Claude,
  busca, juiz nem reserva), histórico até 6 mil tokens, saída até 1.500 (a função Edge corta em ~300 s).
  O comentário `: fila {...}` do gateway vira aviso no lugar do "Pensando": "Você está na fila (posição N).
  Tem muita gente usando o modelo grátis agora." ou "Trocando de modelo, pode levar até 1 minuto.".
  Balde `local`: sem cota e sem custo. Seletor: grupo "Modelos locais", só para o admin.
  `api/local/registro.js` existe porque o `[[...route]]` só pega um nível de caminho.
- Liberar o vencedor para todos (grátis, sem limite de mensagens; freio de segundos e fila valem):
  `LOCAL_FREE_MODEL=local:qwen35b|local:gemma26b|local:gptoss20b` na Vercel + deploy.
- Conferido no ar (como admin, custo zero): Qwen 109 s, Gemma 114 s, gpt-oss 52 s, cada um com troca de
  modelo e o aviso na tela; com o modelo já carregado e o prompt em cache, o 1º token sai em ~1 s (o 1º
  pedido depois de uma troca lê ~4,3 mil tokens: ~37 s no Qwen). Fila testada localmente (posição 1).
  Visitante não vê nem usa os locais (o pedido cai no modelo grátis normal: um teste meu gastou 1
  mensagem grátis real).
- Deploy no ar: ver `npx vercel inspect 451sh.com`. Antes: `dpl_8pDzmewfgeWPDahRoehLTch2NrbZ`.
  **Undo:** `npx vercel rollback https://451sh-68830us0p-dwadwdwas-projects.vercel.app --scope dwadwdwas-projects`
  e `systemctl --user disable --now porteiro-451.service`.

## 2026-11-21 (03h16) — PUBLICADO: freios contra prejuízo, cartão de opções, gráficos e custo por mensagem

Pedidos do dono: "Todos" (fechar os 4 buracos de prejuízo + OpenRouter do site = chave do cofre); "o chart
e o ask estão sem formatação"; "gastei R$ 0,10 num prompt? em qual modelo? preciso saber essas coisas".
- Freios (`src/credits.js`, `src/cost.js`, `src/entrada.js`, app.js, v1.js): créditos nunca negativos
  (antes de chamar, o pior caso tem de caber no saldo; a saída é limitada ao que o saldo paga), câmbio
  5,95; grátis com teto TOTAL de US$ 5/dia (`FREE_DAY_USD`; depois disso 429 até virar o dia UTC); Pro
  com histórico cortado em 200 mil caracteres (`PRO_MAX_INPUT_CHARS`). Teste: `scripts/teste-freios.mjs`.
- Chat v2 (`ryan-ui/heretic/src/v2/ai-answer/ai-answer.tsx`): ```ask vira cartão de opções (RadioCards
  da ryan-ui; aceita –, —, •, · e números), um toque manda a opção como próxima mensagem (`onFollowUp`);
  pizza e barras simples (Mermaid `pie`/`xychart-beta` ou ```chart em JSON) viram DonutChart/BarChart da
  ryan-ui; o resto do Mermaid segue desenhado (rótulo do cartão conforme o tipo; pizza do Mermaid com
  cores). Prompt (upstream.js DIAGRAMAS + persona.js): gráfico de números em Mermaid, opção com "- ".
  Custo do prompt: +~60 tokens (~1% sem cache; com cache, ~0). Teste: `scripts/teste-tela-chat.mjs`.
- Custo por mensagem (`src/upstream.js` `anotaParte` + `src/uso.js`): cada chamada paga guarda modelo,
  papel (resposta, decide busca, confere recusa, busca, confere pessoa), tokens, cache gravado/lido e
  custo; `451:uso:msgs` (últimas 500) e `451:uso:m:<id>` (30 por usuário, 30 dias). No grátis o id é um
  apelido com hash e segredo (nunca o IP). Só números. Painel: seção "Últimas mensagens" + "de onde sai
  o custo" (sw.js v8; backup `backups/painel-antes-mensagens/`). Medidor segue 100% nos 16 cenários.
- OpenRouter: `OPENROUTER_API_KEY` da Vercel (Production 03h14, Preview 03h15) = chave do cofre. Agora o
  painel lê o saldo da conta: US$ 4,17 (abaixo do alerta de US$ 5). A chave antiga do site não existe
  mais em lugar nenhum (era "sensitive"); voltar o deploy volta a chave antiga junto (env por deploy).
- Deploy `dpl_8pDzmewfgeWPDahRoehLTch2NrbZ` → https://451sh-68830us0p-dwadwdwas-projects.vercel.app
  (alias 451sh.com); 11 arquivos conferidos por sha1. Antes: `dpl_3D8U5jf6wbaMMe576hceZp56FzmW`.
  **Undo:** `npx vercel rollback https://451sh-gan17n0q3-dwadwdwas-projects.vercel.app --scope dwadwdwas-projects`
- Conferido no ar com 1 mensagem real de admin (Rapid, R$ 0,116): o Sonnet respondeu com pizza (rosca
  desenhada) e cartão de 3 opções clicáveis; o painel mostrou Claude Sonnet R$ 0,1160 (7.149 tokens
  gravando o cache + 148 de saída) e GLM 5.3 decidindo a busca R$ 0,0002.


## 2026-11-21 (02h13) — PUBLICADO: registro de uso por usuário + seção "Usuários do 451" no painel

Pedido do dono: no 451 Painel PWA, ver cada usuário (comprou?, o que usa, custo, lucro, se o Claude
respondeu ou desceu) e os preços, para saber se está perdendo dinheiro. Regra: nunca as conversas.
- `src/uso.js`: por mensagem guarda só números (nível, Claude respondeu/recusou/falhou, quem entregou,
  para onde desceu, tokens, custo, créditos, buscas, imagens). Pagantes e dono um por um (id = hash da
  chave, `idDaChave` em limits.js); grátis só em total por dia + visitantes únicos (PFADD). Pagamento
  confirmado gravado sem prazo em `pay.js/markPaid` (os pedidos `pay:order:*` somem em 7 dias; o painel
  também conta os que ainda estão lá). Teste prova que nenhum texto entra (`scripts/teste-painel.mjs`).
- `GET /api/admin/painel` (app.js + `api/admin/painel.js`): só com chave de admin (`x-451-key`), CORS só
  para a origem do painel. Devolve usuários, grátis (7/30 dias e total), totais com resultado, preços
  (do catálogo, mensagem típica medida) e saldos ao vivo (OpenUncensored, OpenRouter, RunPod; cache 5 min).
- Deploy `dpl_3D8U5jf6wbaMMe576hceZp56FzmW` (451sh.com); antes `dpl_2ZskMSn2…` (mesma mudança sem o
  diagnóstico do OpenRouter). Undo: `npx vercel rollback https://451sh-2bqjh2iua-dwadwdwas-projects.vercel.app --scope dwadwdwas-projects`.
- Painel (pasta do agente Super Hacking, `posts/painel/site`; backup em `backups/painel-antes-usuarios/`):
  seção nova em index.html, app.js, app.css; sw.js v7. Chave de admin só no localStorage do aparelho.
  Publicado com `openbot.replace_site` (site c5221478…) a partir de `painel-publicacao/site` (cópia; o
  OpenBot só publica da pasta do próprio agente). A rotina de coleta dele republica da pasta dele, que
  tem as mesmas mudanças. Veredito do topo = clientes (recebido − pagantes − grátis); uso do dono à parte.
- Conferido no ar: pré-voo só libera o painel; sem chave 401; chave Pro 401; admin 200; painel público
  carregou os dados reais em 390 px. A chave do OpenRouter do site NÃO lê o saldo da conta (`/credits`
  falha; `/key` diz: sem limite, já gastou US$ 1,96) — não é a mesma chave do cofre (conta com US$ 4,18).
- Antigo, não meu: o openbot.site bloqueia o service worker do painel (CSP `worker-src 'none'`).

## 2026-11-21 (01h41) — OpenUncensored recarregada: chave nova em produção

- O dono comprou US$ 25 numa chave nova (a antiga, final …f802, estava com US$ 0). Chave salva no
  cofre do OpenBot como `OU_API_KEY` (final …f6f3) e trocada na Vercel em Production e Preview.
- Republicado o mesmo deploy (sem código novo): `dpl_4BaD3NoebFnN4GNE6AtAyvmCTUZT` →
  https://451sh-2bqjh2iua-dwadwdwas-projects.vercel.app, alias `451sh.com`; 215 arquivos iguais ao commit
  `6419515` (a troca de modelos local não foi junto).
- Conferido no ar: Hermes respondeu pela OpenUncensored sem cair na reserva; saldo US$ 25 → 24,9943.
- Undo do deploy: `npx vercel rollback https://451sh-cgr6ijgvx-dwadwdwas-projects.vercel.app --scope dwadwdwas-projects`
  (a chave antiga não tem saldo; voltar o deploy não volta a chave).

## 2026-11-21 (01h33) — PUBLICADO: todos os níveis começam pelo Claude

Pedido do dono: "todos começam com o Claude; use o Sonnet e, no melhor modelo, o Opus". Decisões dele
no chat: Sonnet no Rapid, no Titan e no grátis; Kimi e Hermes como estão; teto do Pro mantido.
- Cadeias: Rapid = Sonnet 5.5 > GLM 5.3 > DeepSeek 1017 > Dolphin · Titan/grátis = Sonnet 5.5 >
  DeepSeek 1017 > GLM 5.3 > Dolphin · Max = Opus 5.5 > GLM 5.3 > DeepSeek 1017 > Dolphin.
  OpenUncensored sem saldo → o sem censura cai na reserva Dolphin (OpenRouter). Claude sem saldo ou
  fora do ar → segue direto no sem censura do nível.
- Como: `CLAUDE_NA_FRENTE` (upstream.js) + `payload.claudeFirst` (app.js: bucket pro, ou grátis abaixo
  do freio; v1.js: bucket pro). Recusa/falha do Claude passa para o laço protegido (`entregaFora`),
  que confere recusa a cada passo — fechou a brecha do Max (antes a recusa do GLM ia crua para a tela).
- Sem Claude: uso justo (pro_rapid), Kimi/Hermes, modo qualidade, ajudantes internos.
- Freio do grátis: `FREE_CLAUDE_DAY_USD` (padrão US$ 3/dia, chave Redis `gratis:cost:AAAA-MM-DD`);
  passou, o grátis segue sem Claude até o dia virar (UTC).
- Cache do prompt de sistema no Claude (`blocosDoSistema`): medido no ar com o Sonnet, a entrada de
  ~7 mil tokens cai de US$ 0,018 (grava) para US$ 0,0007 (lê). Medidor cobra cache pelo preço oficial.
- Preço do Opus corrigido para o oficial (US$ 4/20; era 5/25 e o medidor cobrava 25% a mais).
  Sonnet 5.5: US$ 2/10, cache 2,50/0,10 (platform.claude.com/docs/en/about-claude/pricing).
- Reserva do Titan: Cydonia → Dolphin (3/3 no teste; Cydonia 2/3).
- Deploy `dpl_6WyBuEpbLvFSTGKcBvmzvkAGdfhS` → https://451sh-cgr6ijgvx-dwadwdwas-projects.vercel.app,
  alias `451sh.com`, 215 arquivos conferidos por sha1. No ar: API Rapid/Titan/Max com ~7.140 tokens de
  entrada (caminho do Claude), Kimi com 4.513 (sem Claude), grátis 200, `/.env` 404, logs sem erro.
- Testes sem rede: `scripts/teste-medidor.mjs` (16 cenários, medidor 100%) e
  `scripts/teste-claude-frente.mjs` (Pro, API, Kimi, modo qualidade, grátis, freio e uso justo).
- **Undo:** `npx vercel rollback https://451sh-ogwssxcjh-dwadwdwas-projects.vercel.app --scope dwadwdwas-projects`
  (deploy anterior `dpl_DeDyonyiUZbM47G9ZYkR6bbuJj6c`).

## 2026-11-21 (00h52) — PUBLICADO: medidor de custo completo + recusa nunca sobe para o Opus

Aprovado pelo dono no chat ("Publica o medidor" + "Nunca subir pro Opus"). Os modelos do ar NÃO mudaram.
- Deploy por CLI: `dpl_DeDyonyiUZbM47G9ZYkR6bbuJj6c` → https://451sh-ogwssxcjh-dwadwdwas-projects.vercel.app,
  READY, alias `451sh.com`. 215 arquivos; os 5 alterados (`src/app.js`, `plans.js`, `router451.js`,
  `upstream.js`, `v1.js`) conferidos por sha1 contra o computador. Antes dele, o ar era idêntico ao `7632ab6`.
- Trava: `alternateFor` só devolve sem censura (Rapid, Titan) e por último a reserva Dolphin; nunca o
  Claude. O laço principal lembra todos os modelos já usados (`jaFoi`), sem voltar para quem recusou.
- Conferido no ar: chat Max/Titan/Rapid 200 (Titan e Rapid pela reserva: OU zerada), API v1 200,
  `/`, `/app/`, `/api/me`, `/api/v1/models` 200, `/.env` 404, logs sem erro.
- Provas: `scripts/teste-medidor.mjs` (9 cenários: ar 0–100%, novo 100%; recusa do Titan US$ 0,035 → 0,003)
  e `scripts/teste-teto-assinante.mjs` (ponta a ponta pelo app: 3 mensagens de US$ 0,043 levavam o teto
  5h do assinante a 1% no ar e levam a 29% na versão nova).
- **Undo:** `npx vercel rollback https://451sh-cv2czghmo-dwadwdwas-projects.vercel.app --scope dwadwdwas-projects`
  (deploy anterior `dpl_HCuHYY3Jh5z2tFRb2rFTRfgBVscX`).
- Hoje a reserva do Titan é o Cydonia 24B (recusou violência no teste de 20/11); a do Rapid é o Dolphin.

## 2026-11-21 (madrugada) — revisão de custo: medidor consertado e sem censura mais baratos

A troca de modelos abaixo continua LOCAL (não publicada): `backups/troca-modelos-2111/troca.patch`.
Backup antes da revisão: `backups/antes-revisao-2111/`.

### Decisão do dono
O Max continua sendo o Claude Opus 5.5 (1º modelo, normal, com censura). O que importa são os
SEM CENSURA por baixo dele, e eles devem ser os mais baratos. Kimi e Hermes ficam à parte (créditos).

### No ar, medido em 21/11
- Saldos: OpenUncensored US$ 0,00; OpenRouter US$ 4,28 (10 − 5,72); Venice US$ 0,004; Anthropic do
  cofre sem saldo, a `ANTHROPIC_API_KEY_VAGAS` responde.
- Max responde pelo Opus. Titan e Rapid levam 402 da OU e quem responde é o Dolphin 24B (OpenRouter).
- Mensagem padrão: Max 7.156 de entrada + 1.095 de saída (US$ 0,063); Rapid 4.524 de entrada.

### Medidor (era o furo de dinheiro)
Antes, o custo da mensagem que vai para o teto do assinante e o teto do mês perdia:
- tudo que a reserva (Dolphin) respondia → US$ 0 (o app marcava "quem respondeu" = `openrouter`);
- o Opus que recusava e passava para o Rapid → ficava só o custo do Rapid (2% do real);
- o juiz de recusa, o classificador de busca, o detector de pessoa e a busca web (até US$ 0,02).
Agora cada chamada paga soma o próprio custo (`abreConta`/`fechaConta`/`contaAvulsa`/`custoTurno`),
a chamada cortada na recusa estima pelo tamanho, e o custo do OpenRouter (`usage.cost`) é lido.
Prova: `scripts/teste-medidor.mjs` (provedores falsos, sem rede): 8 cenários, antes 0–100%, agora 100%.

### Sem censura por baixo (catálogo)
- Rapid = `olafangensan-glm-4.7-flash-heretic` (US$ 0,07/0,40) — antes GLM 5.3 Flash UC.
- Titan = `deepseek-v4.1-flash-uncensored` (US$ 0,12/0,45) — antes DeepSeek 1017 UC (0,33/1,32).
- Reserva dos dois no OpenRouter: Dolphin 24B.
- NÃO TESTADOS sem censura nem em qualidade: a OU está zerada. Testar antes de publicar, inclusive o
  `enhancePrompt` (max_tokens 300) com o GLM 4.7, que pensa antes de responder. Depois do teste,
  atualizar os textos `style`/`tested` do Rapid e do Titan em `src/plans.js`.

### Recusa subindo para o Opus — resolvido (publicado às 00h52, ver acima)
Antes, a recusa de modelo sem censura subia para o Opus (`alternateFor`: Titan → Max), inclusive no
grátis: ~US$ 0,03–0,06 por vez em vez de ~US$ 0,001. O dono escolheu "nunca subir pro Opus".

## 2026-11-20 (19h) — roteador revisado, corrigido e publicado

Branch: `homo-451-v2` (push feito na conta `ryanoliveiragit`, commit `a11e74d`).

### Base alinhada primeiro
`src/` e `api/` locais estavam ATRÁS do que roda em produção (faltavam `api/v1`, `api/admin`,
`api/image`, `api/pay`, `src/v1.js`, `src/credits.js`, `src/pay.js`; `src/app.js` 17 KB contra
56 KB no ar). Baixei o snapshot real do deploy de produção (`dpl_G9aDomUH2q6C7...`) e trabalhei
sobre ele. Backup do estado anterior: `backups/antes-roteador-prod-1901/`.

### O que a revisão do roteador apontou
1. **Premissa caduca.** A 1ª versão foi escrita supondo que o Max era Claude e recusava. Hoje o
   Max é `deepseek-v4.1-flash-1017-uncensored-thinking` — sem censura. O roteador só se justifica
   por LATÊNCIA (raciocínio de 20–40 s em pedido que não pede raciocínio), não por censura.
2. **Repetia o mesmo modelo** na recusa (3×), quando repetir quem não entrega queima rodada e
   às vezes volta vazia.
3. **Podia cair em modelo de créditos** sem crédito.
4. **Aviso nunca chegava à tela**: `rerouted_pre` não era tratado no app.

### Causa da resposta vazia (o print do dono)
`thinking.budget_tokens` divide o `max_tokens`. Com teto de 300 o modelo pensava os 236 tokens e
não sobrava texto: `message_start`, `ping`, `message_delta`, `message_stop`, zero `text_delta`.
Medido na API real, com a persona real: 100% de vazio com teto baixo. Corrigido em
`anthropicTurnStream`: teto = orçamento de raciocínio + `FOLGA_TEXTO` (1800).

### Detector anti-recusa
Padrões fracos ("como uma IA", "não é apropriado", "posição minha") disparam no meio de resposta
boa e derrubavam a resposta inteira. Agora contam só na abertura (220 chars) e só em resposta
curta (<700). Juiz de LLM ganhou regra de desempate: se a resposta já entrega o conteúdo, é
CONTEUDO mesmo com ressalva no meio.

### Testado
- Unitário do roteador: 8/8 casos.
- Fluxo real do `streamChat` com upstream mockado: 13/13 (desvio, inércia em modelo aberto,
  escalada trocando modelo + caminho de API + credencial).
- Detector: 7/7.
- No ar (produção e homo): SQLi/XSS desviam e entregam em 20 s; Max com esforço alto entrega
  comparação em 29 s, sem vazio; cena erótica entrega em 19 s; arena Pro conclui em 36 s.
- App: abas, grátis, Pro, agente, celular (390 px), sem estouro de largura.

### Produção e homologação
- Produção: https://451sh-ovky1mlvl-dwadwdwas-projects.vercel.app (+ alias 451sh.com).
- Homologação: https://451sh-8j9opp2hd-dwadwdwas-projects.vercel.app → `homo-451.vercel.app`.
- **Corrigida a causa do incidente anterior**: as 23 variáveis de ambiente existiam SÓ em
  `production`, então todo deploy de preview nascia sem `ADMIN_CODES`/`CLAUDE_KEY` e a chave
  aparecia como Grátis. Agora valem em `production` e `preview`.
- `ssoProtection` do projeto desligada para o homo abrir sem login da Vercel. Só afeta preview.

### Rollback de domínio
`npx vercel alias set https://<deploy-anterior> 451sh.com --scope dwadwdwas-projects`

### Pendente / não verificado
- Não testei pagamento real.
- O teste visual automático (`scripts/teste-app451.mjs`) marca falha em agente/arena no Pro porque
  procura o seletor `.h-gasto`, que é do plano grátis. Os dois caminhos foram conferidos à mão por
  curl e Playwright.
