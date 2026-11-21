
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
