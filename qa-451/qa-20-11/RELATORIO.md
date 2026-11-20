# QA do 451 — 20/11

Rodado em produção (451sh.com) com um código Pro de teste temporário (env `PRO_CODES`, já removido) para não gastar a chave do dono. Gasto: ~45 mensagens de chat (Rapid, 2 no Max), 1 imagem real, classificador ~20 chamadas.

Scripts: `scripts/qa/api.mjs` (fumaça, contrato, segurança, bloqueios, classificador, avaliação do chat, estresse), `scripts/qa/e2e.mjs` (navegador: chat, falhas simuladas, imagens, offline, layout), `scripts/qa/idioma.mjs` (inglês na tela). Resultados JSON e prints nesta pasta.

## Placar final (depois das correções)

| Área | Testes | Passam | Falham |
|---|---|---|---|
| Fumaça | 10 | 10 | 0 |
| Contrato da API (SSE, /v1) | 8 | 8 | 0 |
| Segurança | 10 | 4 | 6 |
| Bloqueios de imagem | 7 | 7 | 0 |
| Classificador de imagem | 10 | 10 | 0 |
| Avaliação do chat | 11 | 10 | 1 |
| Estresse leve | 5 | 5 | 0 |
| Navegador: chat | 9 | 9 | 0 |
| Navegador: falhas simuladas | 5 | 5 | 0 |
| Navegador: imagens | 5 | 5 | 0 |
| Sem internet | 2 | 2 | 0 |
| Layout (320 a 1440) | 6 | 6 | 0 |
| Inglês na tela | 1 | 1 | 0 |
| **Total** | **89** | **82** | **7** |

## Corrigido e publicado durante o QA
1. App 28 px mais largo que a tela em todas as larguras (arrastava de lado) — regressão da Imagens v3 (página escondida deslocada). `.h-paginas { overflow: clip }`.
2. Landing cortada em 320/360 px (seções "A mesma pergunta" e "Configure do seu jeito").
3. Resposta cortada no meio (conexão caiu sem "done") deixava a tela girando para sempre → aviso "A conexão caiu antes do fim da resposta".
4. Sem internet / sem /api/me: "Carregando os modelos" para sempre → aviso "Sem conexão com o 451" + Tentar de novo; volta sozinho quando a internet volta.
5. Textos em inglês: "The answer was cut off", "You stopped this answer…", "Failed to fetch", "Something went wrong", "Copied/Failed", 2 rótulos de leitor de tela.
6. Toda resposta recarregada mostrava "Relacionadas" com 3 perguntas de demonstração em inglês sobre passkeys.
7. Servidor: JSON quebrado no /api/chat dava 500 → 400; chat sem mensagem chamava o modelo (gastava e ele dizia "sou o DeepSeek V4.1 Flash") → 400.

## Pendentes (precisam de decisão)
- **CRÍTICO — chat sem trava para conteúdo sexual com menor de idade.** Nem o prompt de sistema (10.906 caracteres) nem o servidor têm a regra; só as imagens têm. Não testei mandando o pedido ao modelo, de propósito.
- **ALTO — dados internos públicos:** `GET /api/persona` entrega o prompt inteiro; `GET /api/models` mostra que 451 Max/Titan/Free são DeepSeek; `/api/routes` e `/api/health` públicos; `PUT /api/routes` sem senha troca o modelo padrão de uma instância (visto no código). O app atual não usa nenhuma delas.
- **MÉDIO — busca na web só no Max.** No Rapid a busca nunca roda (nem com link) e o modelo inventa cotação "de hoje" com links genéricos (R$ 5,36 e R$ 5,43 em duas respostas).
- **MÉDIO — freio de 8 s entre mensagens.** O Rapid responde em ~1 s; quem manda a próxima logo recebe "Calma". Como o prazo conta de quando o servidor começa, uma partida a frio barra mesmo quem esperou 8,8 s.
- **MÉDIO — lentidão do classificador de imagem:** 4 a 16 s (mediana 6,5 s; ~9 s com 4 juntas) na frente de mensagens com palavras de imagem. A decisão de busca tem prazo de 1,2 s e o modelo leva mais, então cai sempre na regra de palavras.
- **BAIXO — cabeçalhos de segurança ausentes** (nosniff, proteção contra iframe, Referrer-Policy; só HSTS existe) e `/api/redeem` sem limite de tentativas.

## Não testado
- iPhone/Safari de verdade e app instalado sendo fechado pelo sistema.
- Carga com muitos usuários diferentes (o freio é por chave/aparelho; de um computador só não dá para simular).
- Imagem adulta e edição nesta rodada (testadas antes no servidor local).
- Pagamento real.

## Deploys
- QA: dpl_GFsUz1Zb1Gw8SvcJXoNNUmN66QbR, dpl_rrQGekjKbYLhq4XoojLUoSNK42pQ, dpl_FB25VLX4q4RobZmuRQtgSpa3AXns, dpl_7d33vLTwwvugAiELCSAvSbubiegG; final sem PRO_CODES: dpl_6JhBzK93tfPmav2iLcW1D5AHr6hP (451sh-krub1062c).
- Desfazer as correções: `npx vercel alias set https://451sh-hhmne4zdp-dwadwdwas-projects.vercel.app 451sh.com --scope dwadwdwas-projects` (preços novos, antes do QA; atenção: esse deploy ainda não tinha a env PRO_CODES, então é seguro).


## Segunda rodada — correções de uso (dono: "corrija os erros, mas não censure nada")
Nenhuma restrição de conteúdo foi adicionada (a trava de menor no chat ficou de fora por decisão do dono; os bloqueios de imagem que já existiam continuam iguais).
- Busca na web no Rapid e no Titan (antes só no Max): o servidor busca e entrega as fontes. No ar: "cotação do dólar hoje" → R$ 5,949 com Trendou e PTAX (antes inventava R$ 5,36). Sem resultado, avisa que o dado pode estar desatualizado e não inventa link.
- Classificador de imagem e sugestões: chamada direta ao modelo rápido (antes passavam pelo chat inteiro). 4–16 s → 0,9–2,9 s. Decisão de busca: modelo de 0,5 s com prazo de 1,6 s (antes sempre estourava).
- Freio entre mensagens: Pro/Plus 3 s (era 8 s); Grátis segue 8 s. Na API /v1, 3 s.
- Rotas internas (/api/persona, /api/models, /api/routes, /api/agents, /api/projects, /api/conversations, /api/approve) só com chave de admin; /api/health público devolve só {ok}. /api/me sem fornecedor nem preço de custo, com descrições neutras.
- Cabeçalhos: nosniff, X-Frame-Options SAMEORIGIN, frame-ancestors 'self', Referrer-Policy, Permissions-Policy (microfone só no próprio site).
- /api/redeem: 1 tentativa a cada 3 s por visitante.
- Deploy dpl_377mKBNGQ99L1q8i7o2SUcfa6SAP (451sh-j3qzz36ua). Desfazer só esta rodada: alias para https://451sh-krub1062c-dwadwdwas-projects.vercel.app
- Não conferido no ar: freio de 3 s com chave Pro (conferido no servidor local) e busca no Rapid com chave Pro (conferida no Titan, mesmo caminho).
