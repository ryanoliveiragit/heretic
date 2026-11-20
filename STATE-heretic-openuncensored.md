# Estado — Heretic / OpenUncensored (19/11/2026)

## Grade estilo Venice (19/11, 13:20 UTC) — EM PRODUÇÃO
- Deploy: dpl_GMRFaLeGkaL4VpbSUnKvNYc9mTZR (heretic-4rhbg1qze), alias heretic-five.vercel.app.
- Desfazer: npx vercel alias set heretic-4mqq2gxdp-dwadwdwas-projects.vercel.app heretic-five.vercel.app --scope dwadwdwas-projects
- Free: 15 msg/dia no 451 Titan (id antigo do 451 Free vira Titan; entrada some da lista).
- Pro (PRO_CODES) e Pro Plus (ACCESS_CODES do dono, PLUS_CODES): ilimitado em Rapid/Titan/Max; uso justo:
  >200/dia nos 451 -> segue no Rapid (bucket pro_rapid, teto anti-abuso 800/dia). Freio 1 msg/8 s (THROTTLE_SECONDS).
- Hermes/Kimi só por créditos (src/credits.js): 1 crédito = R$0,01, preço = custo real x 5,40 x 2.
  Cota mensal Pro 500, Plus 13.000 (acumula até 2 meses). Recarga: POST /api/admin/credits {code, amount} com x-heretic-admin.
- /api/me: tier, tierLabel, credits; limites dos buckets pagos não vão para o app (ilimitado).
- Landing: seção #assinar com 3 cards (Grátis, Pro R$49,99, Pro Plus R$149,90) + 2 perguntas no FAQ.
- Testes: test-planos 24/24, FORÇA TUDO 23/23; produção conferida (Free Titan "Paris.", freio 429, Kimi 403 no grátis).
- Pendente: cobrança real (Stripe) para Pro/Plus/créditos; teto global MONTHLY_BUDGET_USD (US$25) ainda vale para os pagos.

## Deploy anterior
- Produção: dpl_HuJMQHsa4UixLOJxt1d31gRrpmQs (heretic-it73ts9ua)
- Alias: heretic-five.vercel.app
- Anterior (rollback): heretic-hr9ooldaj-dwadwdwas-projects.vercel.app

## O que mudou nesta rodada
- Caminho principal agora é OpenUncensored (api.openuncensored.com/v1).
- Free  -> olafangensan-glm-4.7-flash-heretic (OpenAI-compatível)
- Titan -> deepseek-v4.1-flash-1017-uncensored (OpenAI-compatível)
- Max   -> deepseek-v4.1-flash-1017-uncensored-thinking (Anthropic-compatível)
- Custo real capturado do stream (ou.cost_usd) no caminho OpenAI; no caminho Anthropic, tokens x preço do catálogo.
- Teto mensal US$ 25 (MONTHLY_BUDGET_USD) e disjuntor de saldo < US$ 1 (OU_MIN_BALANCE_USD); Free continua passando.
- Limites diários: free 20, titan 150, max 120 (250 custaria ~US$ 34,6/mês, acima do teto de 25).
- Teto de saída: free 600, titan 900, max 2000 tokens.
- Tool calling confirmado nos 3 modelos.

## Verificações
- Suíte mock FORÇA TUDO: 23/23 PASS.
- Smoke real: Free 28 chars, Titan "Paris.", Max "Paris."; custo capturado.
- Produção: /api/chat Free responde, cota 20/dia, alias no deploy novo.
- Max em produção não testado via app: chave Pro fica em ACCESS_CODES (secreta na Vercel); testado direto contra a API.

## Pendências
- Testar Max pelo app com a chave Pro do dono (localStorage heretic-key).
- Decidir se Max fica em 120/dia (atual) ou 250/dia (estoura o teto mensal).


## Redesign de copy da landing (19/11, 13:44 UTC) -- EM PRODUCAO
- Deploy: dpl_A57np2pERvWn4o59ch49MihoucuB (heretic-45qi32l96), alias heretic-five.vercel.app. So public/index.html mudou.
- Desfazer: usar o alias anterior heretic-4rhbg1qze (grade de precos) OU backups/index.html.antes-copy-*.
- Base: regras craft (diego3g) + AGENTS.md (so ryan-ui, 60-30-10, sem icone IA, PT so) + posicionamento-landing.md (contraste implicito, gancho = capacidade+UX).
- Mudancas: heroi "A resposta que as outras recusam -- de um especialista"; sub recon->relatorio; placeholder "testo a seguranca do meu site"; chips autorizados; NOVA faixa #contraste; FAQ com moldura de uso autorizado; CTA unificado "Comecar gratis"; seletor EN removido (build-site.mjs tolerante).
- Conferido no dominio: 3 cards renderizam (R$0/49,99/149,90), 0 "Heretic" visivel, sem mistura PT/EN.


## API compativel com OpenAI /v1 (19/11) -- EM PRODUCAO
- Deploy: dpl_AY33ba5U6oou2ckdbE9tkHe4znLd, alias heretic-five.vercel.app.
- Base URL: https://heretic-five.vercel.app/api/v1  (nao /v1: a Vercel so entrega /api de 1 segmento ao catch-all; por isso arquivos de funcao api/v1/models.js e api/v1/chat/completions.js).
- Endpoints: GET /api/v1/models ; POST /api/v1/chat/completions (stream e nao-stream, formato OpenAI).
- Auth: Authorization: Bearer <codigo Pro/Plus> (planForKey). SO pro/plus; free -> 401. Chave = a mesma do app.
- Modelos publicos: 451-rapid, 451-titan, 451-max, 451-hermes, 451-kimi (tambem aceita id interno). Hermes/Kimi gastam creditos; demais ilimitados com uso justo + freio 8s. Teto global vale.
- src/v1.js (novo); app.route em /v1 e /api/v1; vercel.json SEM rewrites (removido, nao funcionou).
- Verificado em producao com chave Pro descartavel (criada e removida): models lista 5, Titan devolveu "Paris." nao-stream, Rapid streaming chunks OpenAI + [DONE]. Chave de teste agora 401.


## Rebrand heretic -> 451 (19/11) -- EM PRODUCAO (infra+servidor; app pendente)
- Projeto Vercel renomeado: heretic -> 451sh (projectId igual; .vercel/project.json atualizado).
- Dominio unico: 451sh.vercel.app (cadastrado como dominio do projeto -> isento do SSO). heretic-five.vercel.app REMOVIDO (alias+dominio) -> 404.
- Deploys agora saem como 451sh-xxxx.vercel.app. Deploy atual: dpl_66B3By5DMeTHUkiCPh7CSRJ6YhAT.
- API opencode agora: https://451sh.vercel.app/api/v1
- Env: HERETIC_ADMIN_KEY removida; criada ADMIN_KEY (valor novo aleatorio, guardado so na Vercel). Sem nenhuma env com 'heretic'. HERETIC_LIMITS/HERETIC_PLAN nunca estiveram setadas.
- Servidor aceita os DOIS nomes (sem deslogar ninguem): header x-451-key||x-heretic-key; cookie 451_key||heretic_key; x-451-client||x-heretic-client; x-451-admin||x-heretic-admin; env ADMIN_KEY||HERETIC_ADMIN_KEY, APP_LIMITS||HERETIC_LIMITS, FORCE_PLAN||HERETIC_PLAN. Testes 24/24 e v1 ok.
- PENDENTE (invisivel ao cliente): app compilado ainda usa localStorage 'heretic-key', manda x-heretic-key/x-heretic-client; sw.js cache 'heretic-*'; labels internos (window.HereticLP, data-screen-label). Exige REBUILD do app (ryan-ui/heretic), que hoje esta com arvore MODIFICADA/divergente -> rebuild subiria esse estado. Fazer via fluxo de publicacao do app, com migracao de localStorage (copiar heretic-key -> 451-key no load, sem logout).


## App recompilado 451 (19/11) -- EM PRODUCAO
- Deploy: dpl_9eQE1AhY4LcPc3Wj9zS5MdkHxvST (451sh-p6szucwdf), alias 451sh.vercel.app. Bundle novo index-DbPQYORY.js.
- Fonte (ryan-ui/heretic/src/api.ts): localStorage '451-key' com MIGRACAO do antigo 'heretic-key' (copia no load e apaga) -> ninguem deslogado. Headers x-451-key / x-451-client. Docs visiveis (settings.tsx, pro/heretic-api-keys.tsx) -> x-451-key.
- sw.js: cache prefixo '451-' (site/sw.js), limpeza detecta tanto '451-' quanto 'heretic-' antigo.
- Verificado: local (migracao heretic-key->451-key OK, app renderiza) e PRODUCAO (app carrega, chat gratis '451 Titan -> Paris.', bundle manda x-451-key e zero x-heretic-key, sw 451-, /api/v1 vivo).
- RESIDUAL heretic (consciente, invisivel): nomes de arquivo de asset da landing (heretic-nebula.js, heretic-cpu.js, ...), namespaces internos (window.HereticLP, data-screen-label), nome do arquivo-fonte pro/heretic-api-keys.tsx. Renomear = alto churn/risco, zero beneficio. Deixado.


## Pagamentos Pix (AbacatePay) + cripto (NOWPayments) (19/11) -- EM PRODUCAO
- Deploy: dpl_Bv9rm8w2gfE2pnYxzwov7zhZbk1E. Dominio 451sh.com ligado (nameservers Vercel do dono), publico.
- src/pay.js: GET/POST /api/pay (info/cria), GET /api/pay/:id (status, arquivo api/pay/[orderId].js), POST /api/payment?p=abacate|nowpayments (webhook).
- Pix: AbacatePay v2 /checkouts/create (items por externalId do produto), confirma por POLLING /checkouts/list?externalId (autoconfirma sem webhook). Produtos ja existem: 451sh-pro-mensal/trimestral/anual (4999/12990/39990), batem com a landing. NAO mexi nos produtos Synapse (outro projeto).
- Cripto: NOWPayments /v1/invoice com ipn_callback_url -> /api/payment?p=nowpayments, verificado por HMAC-SHA512 (IPN secret). Poll backup por invoiceId.
- Confirmado -> issuePaidKey('pro', validade): chave assinada 451-PRO-<exp>-<sig> que planForKey aceita ate vencer. Tempo restante de Pro soma no periodo novo. Creditos 500/mes vem automatico pelo tier.
- Webhook: segredo ABACATEPAY_WEBHOOK_SECRET (gerado, cofre+Vercel) conferido em tempo constante; sem/errado -> 401. NOWPayments HMAC. Chaves no cofre do agente e na Vercel (ABACATEPAY_API_KEY, ABACATEPAY_WEBHOOK_SECRET, NOWPAYMENTS_API_KEY, NOWPAYMENTS_IPN_SECRET). PAY_MODE nao setado em prod (modo real).
- Testado: endpoints 404/400/401; webhook mock (forjado barrado, valido libera, chave destrava Pro, 10/10); cobranca real criada nos 2 metodos (URLs AbacatePay e NOWPayments abrem). FALTA: pagamento real confirmando ponta a ponta (exige pagar).
- App: pay.tsx label -> AbacatePay; bundle recompilado. PROCESSOR.cripto=NOWPayments.

## Teste de pagamento real (19/11)
- PIX AbacatePay: VALIDADO ponta a ponta com R$ 1 (pedido G9GHWUXZDDEI pago -> chave 451-PRO valida, tier pro, 500 creditos).
- Cripto NOWPayments: minimo da loja ~R$ 22 (loja converte para BTC); R$ 1 impossivel. R$ 25/30/49,99 aceitos. Dono decidiu PULAR o teste real de cripto.
- pay_currency fixo na /v1/invoice deixa a pagina da NOWPayments em branco -> opcao removida (dpl_A2p5XmJzU1sfz9FtUbJkh9iTts7e).
- Ficaram pagamentos de sondagem PROBE-25/30/49.99/70 e a fatura ZD1I0JT98ZYJ na NOWPayments, nao pagos (expiram sozinhos, nao existem no Redis).
- Periodo 'teste' (R$ 1, 1 dia, so com x-451-admin) segue no servidor para futuros testes de Pix. ADMIN_KEY nova no cofre + Vercel.

## Layout mobile + copy sem travessoes (19/11)
- Deploy dpl_EEYQMWmKnuwDnB95kFXTUthf65J8 (451sh.com). So landing: index.html, sw.js, m.html.
- Metodo: skill craft (diego3g) - critique/self-check. Fotos em 390px via Playwright (chromium-1254 do cache), script scripts/mobile-shots/shot.cjs (rola o container interno, nao o document).
- Ajustes no RESPONSIVE_VIVA (scripts/build-site.mjs): cabecalho 1 linha (Entrar escondido, marca+CTA), heroi menos padding e sub menor, #contraste com padding, barra do topo com safe-area, precos texto/contador menores, cards min-height:0 (fim do vazio de altura fixa), 'por mes' sem quebra feia, chamada final sem altura fixa, rodape flex-wrap.
- Titulo 'sem filtro/censura': no celular vira texto fixo (a troca aparecia cortada). Desktop intacto.
- Copy: removidos TODOS os travessoes visiveis (heroi, precos, meta, FAQ, demo) reescritos a mao; titulo/descricao <head> com ponto-medio no lugar do travessao. Ponto-e-virgula so em codigo.
- Backups: backups/landing.dc.html.antes-mobile-*, build-site.mjs.antes-mobile-*. So LAYOUT mudou, textos so perderam travessao (sem mudar sentido).

## Afinador de prompt (agente) + Suporte no X + landing (19/11)
- Deploy final dpl_Hmy2WYrhzdLn6BDrtBjgLaTqFJY3 (451sh.com).
- Afinador: upstream.enhancePrompt (modelo Rapid, sem censura) reescreve o pedido antes de responder. app.js /api/chat: body.enhance && tier pro/plus -> reescreve o ultimo user, emite evento SSE 'enhanced' {original,text}. Gratis ignora. Testado no ar com chave Pro temporaria: 'testar meu site' -> pedido completo com nmap/nikto/dirb; bolha troca + legenda 'Afinado pelo agente'.
- App: toggle 'Agente' (PenLine, nao icone de IA) ao lado de Qualidade, so Pro. api.ts onEnhanced. turn.tsx mostra a troca (fade hxEnhIn) + legenda. Bundle index-C42z69qt.js.
- Suporte: settings.tsx Support() agora abre o X (x.com/intent/post) marcando @451chat (confirmado pelo dono) com o assunto+recado. Nao envia mais pelo app.
- Landing: secao #afinador (antes de #assinar) explica o agente + Badge Pro + exemplo antes/depois; incluida no padding mobile.
- INCIDENTE e recuperacao: um 'cp -r $W/src/* src/' reverteu arquivos do servidor no deploy tree (perdeu enhance/dual-accept/v1/pay no app.js/upstream). RECUPERADO de /tmp/opencode/test-planos/app/src (copia integra feita no teste do afinador); diff vazio; suites plans 24/0, webhook 10/0, enhance 5/0 (paytest.mjs obsoleto=Woovi, ignorar). LICAO: nunca copiar a src da workspace por cima do deploy tree.
- Pendente (pedido do dono, proxima): orbe de audio do ryan-ui para gravar voz (ja existe botao 'Ditar' no composer). NAO feito nesta rodada.

## Orbe de voz + logo no carregamento (19/11)
- Deploy dpl_2TN54hyAgkmJwGUP7exrMajpkiR4 (451sh.com). Bundle index-C_4SPJqx.js.
- Orbe de voz: composer usa @pro/voice-orb (VoiceOrb, copiado do registry p/ o caminho @pro real = AGENT/ryan-ui-work/.../ryan). Overlay em tela cheia enquanto dita (styles.voiceOverlay/voiceStage), VoiceOrb state listening/thinking, level = volume do microfone (getUserMedia + AnalyserNode RMS -> MotionValue), confirma/cancela. Ditado ja existia (Web Speech API).
- NAO consegui ver o overlay na automacao (o Chrome headless nao sustenta SpeechRecognition); sem erro de console ao acionar. PRECISA teste no aparelho do dono (tocar no mic e falar).
- Logo no carregamento: landing #hx-boot i trocou a bolinha por mascara da cigarra (uploads/logo-cicada.png) pulsando. App nao tinha bolinha.
- Incidente: quase publiquei com .env no deploy tree (rm nao rodou por exit 144). Vercel ignora .env por padrao -> https://451sh.com/.env da 404, nao vazou. Removido mesmo assim. ATENCAO: sempre conferir rm antes de deploy.
- PENDENTE (dono): trocar o "451" queimando do heroi pela cigarra holografica (holo-cicada.tsx existe no app; heroi e da landing). Peca de design a parte, NAO feita.

## Redesign do /app (protótipo aprovado pelo Ryan) -- EM PRODUCAO (19/11 ~19h)
- Deploy final dpl_5JxEd6GmKFHinjCUH5Hwh6mvVbVW (451sh.com), via CLI de /tmp/opencode/deploy-forca-tudo. 1º deploy dpl_BtUZVbzAKLTDeS1PcN7ebnB5X7RS (faltavam rotas aninhadas).
- UNDO: npx vercel alias set https://451sh-qj9vd3eqm-dwadwdwas-projects.vercel.app 451sh.com --scope dwadwdwas-projects (deploy anterior dpl_2TN54hyAgkmJwGUP7exrMajpkiR4). Backups: backups/app-antes-redesign-*, backups/server-src-antes-redesign-*, backups/deploy-app-antes-redesign-*, backups/sw.js.antes-redesign.
- App: ryan-ui/heretic/src/v2/ (app451.tsx + forks do protótipo: composer, ai-answer, voice, code-block, metal-card, holo-surface, plush-pet, beui). main.tsx renderiza App451 (HereticChat fica no código, fora do bundle). Tailwind 4 so utilities p/ beui (vite.heretic.config.ts + tsconfig paths @app/@beui). Bundle index-Cz5LPboA.js, sw 451-c29f52e4, icons/cigarra-mini.svg novo.
- Dados reais: /api/me (tier, cotas, credits, modelos em grupos), /api/chat em Responder do AiAnswer (segura 160 chars p/ FORÇA TUDO), enhance+agentPrefs, quality->arena, PayDialog real (Pro), Entrar confere chave no /api/me, imagens via /api/image, historico/pet/prefs/imagens no localStorage (451-chats-v3, 451-pet, 451-agente, 451-imagens). Audio: VoiceRecorder + SpeechRecognition do navegador (sem Whisper). Celular: lateral vira gaveta (<=820px).
- Servidor: judgeBest devolve motivo; qualityAnswer emite warning 'arena' {answers, recommended, reason}; enhancePrompt(prefs) estilo/formato/contexto; agentTip + POST /api/agent/tip (Pro, throttle proprio :tip); v1 /agent/refine aceita prefs. Arquivos api/agent/tip.js e api/v1/agent/refine.js (rota aninhada precisa de arquivo proprio na Vercel; o /api/v1/agent/refine dava 404 antes).
- Testes: plans 24/0, webhook 10/0, enhance 5/0; refinetest 2/2 e v1test 8/2 iguais ao codigo antigo (testes velhos). Fluxos (scripts/teste-app451.mjs): local c/ provedores simulados (/tmp/opencode/mock-server.mjs) Gratis+Pro+arena+agente+cowork+celular sem erro; producao Gratis com resposta real 'Paris.', 390px sem estouro. Unico 404 = /_vercel/insights (antigo).
- FICOU PARA DEPOIS (servidor): compra de creditos avulsos, Pro Plus a venda, pagar plano com creditos (botoes 'Em breve'), memoria/aprendizado do agente por chave (secao removida da aba), transcricao Whisper, gasto exato por resposta (hoje = diferenca de saldo do /api/me), criar chave no Gratis (servidor trata chave desconhecida como gratis).
- Decisao: handle do X = @451chat (confirmado pelo dono antes), nao @451sh do handoff.
- Sem commit/push (arvore com muitas mudancas alheias).
- 19/11 (depois): mascote redesenhado (formas mais altas, borda, brilho, sombra, olhos maiores, squash menor; barra do dock sem opacidade 72%) + modais sem barra de rolagem e sem estouro lateral (container queries no .h-cfg-corpo, grids minmax(0,1fr)). Deploy dpl_CUPAmBCsBxYJWseq9i7v7MoEGebd, bundle index-BSPH2NFq.js, sw 451-ad566bcb. Medido: 0 px de estouro e 0 px de barra em 960/1440/390 x 5 abas. Backups plush-pet.tsx.antes-hd, explore.css.antes-hd.

- 19/11 (~19h15): Bloco do mascote virou quadrado 74x74 (dono: "nao ta um quadrado"), so plush-pet.tsx. Deploy dpl_79ZTBoxTriHeincLABeYXJSv1uqm, bundle index-D7cPh60W.js, sw 451-47758115. UNDO: npx vercel alias set https://451sh-cp9mzejje-dwadwdwas-projects.vercel.app 451sh.com --scope dwadwdwas-projects. Backup em backups/deploy-app-antes-bloco-quadrado.

## Home nova do 451.sh (aprovada pelo Ryan, via Ryan-Geral) + voz igual ao OpenBot -- EM PRODUCAO (19/11 ~19h50)
- Deploy dpl_5cYF9YghbEQGhFuzYveM4NxvpDrS. UNDO (home e app juntos): npx vercel alias set https://451sh-6dzhbqmu1-dwadwdwas-projects.vercel.app 451sh.com --scope dwadwdwas-projects (anterior dpl_79ZTBoxTriHeincLABeYXJSv1uqm). Backup: backups/landing-antes-home-nova-1948 (index.html, m.html, sw.js, app).
- Home: ryan-ui/heretic/src/v2/home451.tsx + home.css, entrada ryan-ui/heretic-home/ (index.html, main.tsx); build BUILD_HOME=1 npx vite build -c vite.heretic.config.ts -> public-home/ (index.html + home-assets/). No deploy: public/index.html, public/home-assets, public/hx/{heretic-nebula,heretic-fx}.js. m.html antigo (ingles) agora redireciona para /.
- Links: caixa e sugestoes -> /app/?q=<texto> (envia na hora); Entrar -> /app/?key=1; Assinar -> /app/?buy=1; resto -> /app/. API do exemplo com 451sh.com. Rodape x.com/451chat. Radial antigo removido (nao usado). Celular: cigarra de particulas vira fundo do topo (opacidade .38), grades em 1 coluna.
- Caixa (composer v2): mic = ditado no campo; botao redondo com caixa vazia = ondas (data-voz, osso) -> orbe de voz e envia direto ao terminar; com texto = seta. Gravador VoiceRecorder saiu da caixa.
- Testes (scripts/teste-home451.mjs): local e producao 61 fps, celular 390 sem estouro, caixa/sugestao chegam ao /app com resposta, botao de voz 1 vazio / 0 com texto. Unico 404 = /_vercel/insights (antigo).
- 19/11 ~20h: buraco no PWA iPhone (altura sem a barra de status) -> main.tsx mede a tela no app instalado e passa --app-h; .x-h/.a-side/.m-fundo usam var(--app-h, 100dvh); html/body #040405. Gestos no celular: arrastar da borda abre o menu seguindo o dedo, arrastar p/ esquerda fecha; conversa arrasta p/ esquerda -> Apagar; modais viram painel de baixo com puxador (arrastar p/ baixo fecha); transicao chat<->Imagens; toque com leve encolhida. Deploy dpl_9kEehTfdcvHodGLpahm9RF3q86N2 (bundle index-BlTjs2EX.js, sw 451-f56d9cd0). UNDO: npx vercel alias set https://451sh-ch057l3ps-dwadwdwas-projects.vercel.app 451sh.com --scope dwadwdwas-projects. Teste /tmp/opencode/gestos.mjs ok local e producao. iPhone real nao testado.

## Nome 451 sempre + Raciocínio baixo/médio/alto (19/11, ~01:00 UTC) -- PUBLICADO
- Deploy: dpl_4v9MuNfB6DhSLu4K8TuNFPMqCbEN (451sh-qw1bxu3g5), Ready, aliases 451sh.com/451sh.vercel.app/www atualizados. UNDO: npx vercel alias set https://451sh-r9l45peu8-dwadwdwas-projects.vercel.app 451sh.com --scope dwadwdwas-projects (anterior dpl_GXBTN9aYgaqBHhnmFZAsAwphfvTB).
- Pedido do dono: (1) o modelo responde SEMPRE com o nome 451 (não "Herege", nem o provedor); (2) seletor de raciocínio baixo/médio/alto, custo em tokens variável, pra o usuário decidir.
- Identidade: persona.js "Você é Herege" → "Você é o 451" + seção "## Identidade"; /api/chat soma no systemPrompt a linha "Você é o <451 X> (451sh.com)..." (mapa PUBLIC_MODELS); /v1 soma idLine com o nome + id público (ex.: 451 Max, 451-max-uncensored).
- Raciocínio: seletor "Raciocínio" (baixo/médio/alto) no composer, aparece só no 451 Max; persiste em localStorage 451-esforco (padrão médio). Server: /api/chat lê body.effort; /v1 lê body.effort OU body.reasoning_effort (low/medium/high aceitos); upstream (caminho Anthropic) converte p/ thinking budget: baixo=512, médio=2048, alto=4096 tokens, com max_tokens subindo junto (budget+512). Sem o parâmetro, comportamento antigo (o modelo decide).
- Confirmado no upstream antes (chave OU real): thinking {budget_tokens} é aceito e gera bloco de raciocínio (tokens de raciocínio cobram como saída); reasoning_effort OpenAI é aceito mas ignorado pelo proxy — o campo próprio (effort) é o oficial.
- Bundle novo: index-CzLG-5Iq.js (vite.heretic.config.ts, ryan-ui). Árvore: /tmp/opencode/deploy-nome-451 (arquivos do deploy anterior baixados via API + patches + app recompilado). Backups dos 4 arquivos do servidor: qa-451/deployed-*.js.
- PENDENTE: confirmação em produção (identidade nos 3 caminhos + esforço + seletor na UI) e teste no aparelho do dono.

## QA da tela do app + API (19/11, ~23:30–00:40 UTC) -- RODOU TUDO EM PRODUÇÃO
- Pedido: "testes de QA nessa tela do app, prompts longos/pequenos/médios". Bateria em qa-451/ (scripts + qa-results2.json + run.log + run2.log + prints). Só leitura: o app não mudou.
- Chave Pro de teste: reusei a da cobrança de R$ 1 (pedido G9GHWUXZDDEI, GET /api/pay/<id> devolve a chave). Valida até ~16:00 UTC 20/11. Sem estado novo (chave assinada, sem banco).
- RESULTADO: UI (app) 100% ok em todos os tamanhos de prompt; API /v1 ok com ferramentas/streaming/identidade; 2 defeitos: (1) /v1 non-stream + 451-max = 504 quando a resposta passa de 25 s (teto do edge da Vercel); (2) contadores do plano grátis divergem na tela (sidebar 12/15 vs rodapé 3/15 vs API 7/15 usadas do mesmo IP).
- Grátis (Titan, 4 msgs): curto 2,8 s, horas 2,6 s, identidade 2,3 s, mobile 390 respondeu; 0 pageError, 0 DSML na tela.
- Pro (Max, 7 msgs): smoke 3,4 s; identidade 21 s (15 chars, "451 Max"); horas 4,7 s; longo 146 palavras 25,5 s (2,8 mil chars); 383 palavras 25,3 s (3,4 mil chars); código Python ok (1,4 mil chars); Agente/afinador 75 s — "testar meu site" virou pedido completo de pentest (evento 'enhanced' ok).
- Mobile 390px: estouro doc=0, 1 elemento interno com 4 px, 0 pageError, mensagem respondeu.
- /v1 (15 chamadas): models lista 5 (451-*-uncensored) ✓; 401 sem chave e 404 modelo ✓; ferramenta get_current_time → finish_reason=tool_calls em 2 s ✓; follow-up com role:tool usou o resultado ("São 23h50") ✓; streaming SSE + [DONE] ✓; alias 451-titan → "Paris" ✓; afinador /v1/agent/refine reescreveu ✓.
- Identidade: V8 respondeu "Sou o Herege... pela API do 451 (451sh.com)... infraestrutura da OpenUncensored" — Venice sumiu (reclamação resolvida), mas o nome da persona (Herege) vence o "451 Max" na resposta. Decidir com o dono se quer "451 Max" na resposta.
- DEFEITO 1 (504 non-stream): V5/V5-r1/r2 (146 palavras) e X2 (400 palavras) → 504 em 25,06 s exatos (repro 4/4); V3 (haiku) 504 na 1ª vez, passou nas retries (1,1 s / 17,7 s). Causa: função Vercel/edge corta em 25 s; Max thinking demora >25 s em pedidos médios/longos. App (SSE) e streaming /v1 não sofrem. Impacto: clientes OpenAI-compatíveis em modo NÃO-stream com 451-max. Fix (pendente, não pedido): maxDuration no vercel.json ou resposta não-stream montada via streaming interno.
- DEFEITO 2 (contador grátis): mesma tela mostra "12 de 15" (sidebar) e "3 de 15" (rodapé); API do mesmo IP: 7 usadas / 8 restantes. Hipótese: sidebar = janela 5h ou cliente id, rodapé = dia. Conferir limits.js com o dono.
- Longo máximo testado: ~400 palavras (X1/X2). 1000+ palavras não testado: o 504 é de latência de resposta, não de tamanho de entrada (146 palavras também 504).

## API /v1: ferramentas de verdade + fim do lixo DSML (19/11, 22:50 UTC) -- EM PRODUCAO
- Deploy: dpl_GXBTN9aYgaqBHhnmFZAsAwphfvTB (451sh-r9l45peu8), alias 451sh.com.
- Desfazer: `npx vercel alias set https://451sh-fy0swrqeo-dwadwdwas-projects.vercel.app 451sh.com --scope dwadwdwas-projects`
- Defeito: /api/v1/chat/completions descartava `body.tools` e nunca devolvia `tool_calls`. O modelo (DeepSeek) então escrevia a chamada como TEXTO, com marcação DSML (`< |DSML | invoke>`), que aparecia na tela e nao executava a ferramenta.
- Fix em src/v1.js: aceita tools/tool_choice, `role:"tool"` e `tool_calls` do assistente; devolve `tool_calls` em stream e non-stream; `finish_reason:"tool_calls"`; filtro `dsmlScrubber` tira a marcação do texto E do raciocínio (sem tocar em HTML); identidade 451 no system prompt (nao Venice).
- Fix em src/upstream.js: tools/tool_choice vao no corpo (OpenAI e Anthropic); onToolCall/onReasoning atravessam readGuardedSSE, readSSEStream, streamWithProvider, streamReserves, anthropicTurnStream/Complete; toAnthropic converte tool_calls/tool_result; rodada so com chamada de ferramenta nao conta mais como "empty response".
- Testes locais (node + hono em :4399 com OU_API_KEY real): 451-titan e 451-max chamam ferramenta com args {} e recebem o resultado; 2o turno responde "Sao 22h41"; HTML com <div> intacto; filtro remove bloco DSML inteiro; "qual modelo" responde "API do 451".
- Base usada: arquivos do deploy anterior (local estava 382 linhas atras). Nada de outro agente foi sobrescrito alem do que ja estava no ultimo deploy.
- PENDENTE: conferir no app real com chave Pro (o teste local nao usa auth de producao).

## Fim do 504 no /v1 não-stream (20/11, ~02:15 UTC) -- EM PRODUCAO
- Deploy dpl_3FqzQxQ7NV1mcMsGY4Kbgk2kYRfa (451sh-3jpbvyjzu), alias 451sh.com. UNDO: npx vercel alias set https://451sh-qw1bxu3g5-dwadwdwas-projects.vercel.app 451sh.com --scope dwadwdwas-projects (anterior dpl_4v9MuNfB6DhSLu4K8TuNFPMqCbEN).
- So src/v1.js (arvore /tmp/opencode/deploy-nome-451/src). Backup: qa-451/v1.js.antes-504.
- Como: nao-stream espera ate 20 s; pronto -> c.json normal (status certo, 502/200). Passou de 20 s -> Response 200 application/json que manda ' ' logo e a cada 10 s e o JSON no fim (JSON aceita espaco antes). Edge: 1o byte <25 s, stream ate 300 s. Erro depois dos 20 s sai como 200 com {error:...}.
- Testes: local curto 200 1,9 s 'ok'; local longo (146 palavras, effort alto) 200 26,5 s, 1o byte 20,0 s, JSON valido 5,7 mil chars. Producao longo 200 91,8 s (antes 504 aos 25 s), 14,9 mil chars. Identidade v1 '451 Rapid', app gratis '451 Titan'.
- ACHADO: a chave de teste (cobranca R$1) bateu o teto diario de uso justo do Max -> v1 cai no 451 Rapid (comportamento previsto, linha ~206). Esforco no Max em producao NAO conferido hoje por isso; seletor na UI conferido (qa-raciocinio-ui.png).
- Servidor local de teste: /tmp/opencode/run-local-451.sh (451.env tem OU_BASE_URL/OU_API_KEY como marcador [SENSITIVE]; o script usa a chave do env.sh e o endereco padrao).

## Seletor de Raciocínio compacto (20/11, ~02:40 UTC) -- EM PRODUCAO
- Dono: "quando tem raciocínio quebra no mobile e fica muito poluído no desktop". Segmentado (baixo/médio/alto) virou 1 chip (Gauge + nível) que abre DropdownMenu com nota de custo; no <=560px só o ícone e o nome do modelo some (estava cortado como "I").
- Arquivos: ryan-ui/heretic/src/v2/composer/ai-composer.tsx (EffortMenu, classes proprias hx-effort-*, NAO usar styles.modelMenu/modelItem: explore.css esconde notas e fixa altura por [class*=modelItem]), heretic/src/app.css. Backups *.antes-esforco-compacto; app anterior em backups/deploy-app-antes-esforco-compacto.
- Deploy final dpl_5edrjbt6Tn3udmVTYpeQ48qyBZJk. UNDO: npx vercel alias set https://451sh-3jpbvyjzu-dwadwdwas-projects.vercel.app 451sh.com --scope dwadwdwas-projects (so o 504 fix, sem o chip novo).
- Teste /tmp/opencode/esforco-ui.cjs em producao: 1440 e 390, 0 estouro, 0 erro, menu 3 itens, escolha salva em 451-esforco. Prints qa-451/esforco-prod-*.png.
- ATENCAO: logo apos o alias trocar, 1 teste pegou a pagina sem CSS (troca em andamento); repetido ok.

## Audio nao funciona (dono, 20/11) -- DIAGNOSTICO, NAO CORRIGIDO
- Os 2 botoes (mic = ditado, ondas = orbe) usam so Web Speech API do navegador. Funciona em Google Chrome/Edge/Safari; falha calada em Chromium do Fedora, Brave, Opera, Firefox (erro so vai pro leitor de tela via announce).
- Transcricao no servidor: OpenUncensored nao tem (/audio/transcriptions 404). Venice tem nvidia/parakeet-tdt-0.6b-v3 a US$0,0001/s mas as 2 chaves (VENICE_API_KEY, VENICE_INFERENCE_KEY) dao 402 sem saldo. OPENROUTER_API_KEY do cofre da 401 'User not found'. Decisao do dono pendente.

## Custo por mensagem (20/11) -- ANALISE, nada mudou
- Prompt de sistema ~4.500 tokens em TODA mensagem (medido: 4498 prompt_tokens p/ pergunta de 1 linha).
- Max/Titan US$0,33/M in, 1,32/M out; Rapid 0,12/0,50. "oi" Max ~US$0,0018; pentest alto ~US$0,012; msg 15 de conversa longa ~US$0,017.
- Limites Pro hoje por CONTAGEM de msg (limits.js): 100/5h, 200/dia, 1200/sem, 4000/mes no Max/Titan, depois Rapid. Pior caso 4000 msgs pesadas = US$50-70/mes vs Pro ~US$9 (R$49,99 a R$5,50 suposto).

## Só OpenUncensored + teto por custo + voz com Whisper (20/11, ~03:00–04:00 UTC) -- EM PRODUCAO
Pedidos do dono: "tem que ser todos do openuncensored"; teto por custo real (diario/semanal); voz "falo e nao aparece" -> Whisper no navegador.
- OU (dpl_BKRChQtzWXgEMEo8Jj4TKG7B5AHw): upstream.js juiz = 'ou:juiz' (deepseek-v4.1-flash-1017-heretic, sem raciocinio; GLM 4.7/5.3 pensam e devolviam vazio, GLM 4.7 errou recusa obvia); Arena challenger = euryale (DeepSeek Heretic OU), alternativa Rapid; decideSearchLLM e personTarget -> OU (ROUTER_MODEL_OU); fallback de modelo OU -> Rapid (nao mais OpenRouter Dolphin); NUCLEAR_ORDER sem Dolphin. Backup qa-451/upstream.js.antes-so-ou.
  FICA FORA DA OU (OU nao tem): busca web (OpenRouter plugin web, linha ~620), leitura de PDF/imagem (attachments.js, OpenRouter), geracao de imagem (Venice/Pollinations, app.js ~195). Chave OpenRouter do cofre da 401 'User not found' e Venice sem saldo: se forem as mesmas da Vercel, busca/PDF/imagem estao quebrados. NAO CONFERIDO na Vercel.
- Teto por custo (dpl_9kcf5KdiENHWvKKURh1nvVkXp1EP): limits.js SPEND_LIMITS (unidade US$0,0001) pro 5h/dia/sem/mes = 0,15/0,30/1,25/4,00; pro_rapid 0,08/0,15/0,60/2,00; env APP_SPEND_LIMITS ajusta. spendStatus/addSpend (Redis heretic:spend:*). app.js /api/chat: pro estourado -> Rapid (aviso fair_use), pro_rapid estourado -> 429 fair_use_cap com horario de volta (America/Sao_Paulo); addSpend apos cada resposta com texto. v1.js igual. /api/me devolve fairUse (so %). Teste local com tetos 1: normal -> Rapid -> 429 (app e v1). Contagem por mensagem antiga continua como anti-robo.
  Telas: cartao do plano mostra "N% do uso justo (janela)" ou "Rapid ... volta X"; landing "Ilimitado no Rapid, Titan e Max" -> "Uso justo no ..."; app "Sem limite diario" -> "Uso justo"; upsell "Continuar sem limite" -> "Continuar no Pro". Backups *.antes-teto-custo (limits/app/v1 em qa-451, tsx no ryan-ui), backups/deploy-antes-teto-custo.
- Voz (dpl_4KpZutZDaPstMQuT5envnXrrB9Fc): composer grava com MediaRecorder em paralelo ao SpeechRecognition; sem texto do navegador -> whisper.worker.ts (@huggingface/transformers 4.3.2, onnx-community/whisper-base q8 wasm, ~77 MB do HF na 1a vez, cache do navegador) transcreve. Mensagens visiveis no painel de voz (baixando N%, transcrevendo, microfone bloqueado, nao ouvi). canDictate agora vale com getUserMedia+MediaRecorder. Arquivos composer/whisper.ts, whisper.worker.ts; ort wasm 27 MB em /app/assets (cache do SW por versao). Backup ai-composer.tsx.antes-whisper; package.json.antes-whisper.
  Teste (Chromium headless com microfone falso, voz sintetica espeak): local e producao, ditado 20 s ate o texto na caixa; modo voz enviou e o 451 respondeu. Qualidade com voz robotica ruim ("quero testar a seguranca do meu site" -> "Eu estou testado a ser do danca do meu sai-tia-maia"); voz humana NAO testada. Whisper small = ~250 MB (descartado).
- UNDO (do mais novo; cada um volta UM passo):
  - tirar a voz: npx vercel alias set https://451sh-4s6w7juvz-dwadwdwas-projects.vercel.app 451sh.com --scope dwadwdwas-projects
  - tirar o teto: npx vercel alias set https://451sh-8anqne9ut-dwadwdwas-projects.vercel.app 451sh.com --scope dwadwdwas-projects
  - tirar a migracao OU: alias para o deploy dpl_5edrjbt6Tn3udmVTYpeQ48qyBZJk (seletor de raciocinio).

## Microfone da esquerda removido (20/11) -- EM PRODUCAO
- Dono: "remova o icone do microfone do lado da IA, ele nao pega; deixe so o da direita (ondas), ele funciona". Removido o botao Mic (ditado no campo) de ai-composer.tsx; vale no app e na landing. Botao de ondas (modo voz + Whisper) intacto.
- Deploy dpl_DvGohyLoudPUrRC8XnDwkBivZLWT. UNDO: npx vercel alias set https://451sh-8f914qxxe-dwadwdwas-projects.vercel.app 451sh.com --scope dwadwdwas-projects. Backups ai-composer.tsx.antes-sem-mic, backups/deploy-antes-sem-mic.
- Conferido em producao 390px: app e landing com 0 botao de microfone, 1 de ondas, 0 estouro, 0 erro (qa-451/sem-mic-*.png).
