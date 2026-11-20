
## 2026-11-20 — branch homo-451: roteador pré-chamada Claude → sem censura
- Branch `homo-451` criada a partir de `main` (commit e8b8873 = estado em produção de 20/11).
- `src/router451.js` (novo): `looksRefusable()` com gatilhos locais de recusa da Anthropic
  (adulto, gore, exploit/payload, drogas/armas, política sensível) + `routeFor()`.
- Ligado em `src/upstream.js` (`streamChat`): se o usuário pediu o Max (`claude-sonnet-5-5`)
  e a mensagem parece recusável, desvia ANTES da chamada pro Titan (`nousresearch/hermes-4-405b`).
  Aviso `warning{type:'rerouted_pre'}`. Sem censura: é corte de custo/latência.
- Deploy: https://451sh-kfzo7jkdj-dwadwdwas-projects.vercel.app → alias `homo-451.vercel.app`.
- Rollback do domínio: `npx vercel alias set <deploy-anterior> 451sh.com --scope dwadwdwas-projects`
- Verificado (local, sem chave Pro): `routeFor` 6/6 casos; `streamChat` emite `rerouted_pre`
  e desvia `claude-sonnet-5-5` -> `nousresearch/hermes-4-405b` ANTES da chamada.
- Push BLOQUEADO: `nevusdigital` só tem `pull` no `ryanoliveiragit/heretic` (403 no push).
  Precisa de acesso de escrita nessa conta, ou publicar a branch num repo do próprio dono.
