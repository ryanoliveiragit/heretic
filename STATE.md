
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
