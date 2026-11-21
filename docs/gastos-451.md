# Gastos do 451: chaves, modelos e planos

Atualizado em 21/11/2026, às 02h (horário de Brasília). Os preços vêm das tabelas oficiais de cada provedor, e os tokens foram medidos no próprio site. O que é suposição está marcado como **suposição**. Câmbio usado: US$ 1 = R$ 5,94 (cotação de 20/11).

## 1. Resumo

- **Os planos pagos não dão prejuízo, nem no pior caso.** Um assinante que usa tudo custa no máximo ~R$ 33,09 por mês. Num caso de abuso (mensagens gigantes de propósito), chega a ~R$ 60,59. O plano anual, o mais barato, rende R$ 74,10 por mês.
- **O grátis sempre custa**, porque não tem receita. O gasto com Claude é limitado a US$ 3 por dia somando todos os usuários. Os modelos baratos que entram depois do freio e as imagens não têm teto total.
- **Os créditos (Kimi e Hermes) são vendidos acima do custo** (1,95× o custo com o dólar de hoje), **mas o saldo pode ficar negativo**: quem tem 3 créditos pode mandar uma mensagem que custa milhares.
- **O saldo que acaba primeiro é o do OpenRouter** (US$ 4,18), que paga a busca na web. Com 200 mensagens por dia, dura ~29 dias.
- **O Claude é onde vai a maior parte do dinheiro**: ~US$ 12,33 a cada mil mensagens no uso típico.

## 2. As chaves e o que cada uma paga

| Chave | Saldo agora | O que ela paga |
|---|---|---|
| **Claude** (Anthropic, chave final …kAAA) | A API não mostra o saldo: veja no Console da Anthropic | O 1º modelo de todos os níveis: Sonnet 5.5 no Rapid, no Titan e no grátis; Opus 5.5 no Max |
| **OpenUncensored** (chave final …f6f3) | US$ 24,99 | As respostas sem censura quando o Claude recusa; Kimi e Hermes; o grátis depois do freio; o uso justo; os ajudantes (classificador de busca, detector de pessoa, juiz de recusa, afinador de pedido) |
| **OpenRouter** (conta de US$ 10) | US$ 4,18 | A busca na web; a reserva Dolphin quando a OpenUncensored cai; o leitor de anexos |
| **RunPod** (imagens) | US$ 14,55 | Cada imagem (US$ 0,0031 a 0,0086) e o armazenamento fixo do modelo de imagem (US$ 0,002 por hora, ~US$ 1,44 por mês) |

## 3. Quem responde primeiro

Leia `>` como "se recusar ou falhar, passa para o próximo". O Dolphin também entra quando o provedor do modelo anterior fica sem saldo.

| Nível | Ordem |
|---|---|
| **Max** | Claude Opus 5.5 > GLM 5.3 > DeepSeek 1017 > Dolphin |
| **Rapid** | Claude Sonnet 5.5 > GLM 5.3 > DeepSeek 1017 > Dolphin |
| **Titan e grátis** | Claude Sonnet 5.5 > DeepSeek 1017 > GLM 5.3 > Dolphin |
| **Kimi** (créditos) | Kimi K3.1 Pro > GLM 5.3 > DeepSeek 1017 > Dolphin |
| **Hermes** (créditos) | Hermes 4 405B > GLM 5.3 > DeepSeek 1017 > Dolphin |
| **Uso justo** (assinante passou do teto) | GLM 5.3 > DeepSeek 1017 > Dolphin, sem Claude |
| **Grátis depois do freio do dia** | DeepSeek 1017 > GLM 5.3 > Dolphin, sem Claude |

Fora da conversa:
- **Busca na web:** DeepSeek V4.1 Flash no OpenRouter, com o buscador Exa.
- **Ajudantes:** o classificador "precisa buscar?" e o afinador de pedido usam o GLM 5.3. O detector de pessoa e o juiz de recusa usam o DeepSeek 1017 Heretic.
- **Imagens:** RunPod, com Z-Image Turbo e Chroma.

## 4. Quanto custa cada mensagem

Mensagem padrão medida no site: ~7.150 tokens de entrada no caminho do Claude, ~4.524 nos sem censura e 600 de saída. Os 600 tokens de saída são uma **suposição**; nas medições, a saída variou de 16 a 1.096 tokens. O "cache" é o prompt fixo do site já guardado pela Anthropic: a 1ª mensagem depois de 5 minutos parado grava o cache, e as seguintes leem dele.

| Situação | US$ por mensagem |
|---|---|
| Sonnet responde, lendo o cache | US$ 0,0068 |
| Sonnet responde, gravando o cache | US$ 0,0238 |
| Opus (Max) responde, lendo o cache | US$ 0,0136 |
| Opus (Max) responde, gravando o cache | US$ 0,0477 |
| Rapid: Sonnet recusa e o GLM entrega (cache lido) | US$ 0,0022 |
| Titan: Sonnet recusa e o DeepSeek entrega (cache lido) | US$ 0,0036 |
| Max: Opus recusa e o GLM entrega (cache lido) | US$ 0,0035 |
| Mesma recusa, gravando o cache (Rapid / Max) | US$ 0,0192 / US$ 0,0376 |
| Kimi / Hermes | US$ 0,0143 / US$ 0,0063 |
| Grátis depois do freio (DeepSeek direto) | US$ 0,0023 |
| Uso justo (GLM direto) | US$ 0,0008 |
| Reserva Dolphin (OpenUncensored fora) | US$ 0,0015 |
| **A mais, por busca na web** | US$ 0,0072 |
| A mais, classificador de busca (quase toda mensagem) | US$ 0,00006 |
| A mais, juiz de recusa (respostas curtas dos sem censura; **estimativa**) | US$ 0,00048 |

## 5. Quanto tempo cada saldo dura

**Suposição de uso típico:** 80% das mensagens no Sonnet e 20% no Opus (Max); cache lido em 70% delas; o Claude recusa 30%; 10% fazem busca na web. Não incluí Kimi e Hermes, que se pagam com créditos.

Nesse uso, cada mil mensagens gastam:
- **Claude:** US$ 12,33
- **OpenUncensored:** US$ 0,56
- **OpenRouter:** US$ 0,72

| Saldo | 50 mensagens por dia | 200 por dia | 1.000 por dia |
|---|---|---|---|
| Claude, a cada US$ 100 de crédito | ~162 dias | ~41 dias | ~8 dias |
| OpenUncensored (US$ 24,99) | ~886 dias | ~221 dias | ~44 dias |
| OpenRouter (US$ 4,18) | ~116 dias | ~29 dias | ~6 dias |

**RunPod (US$ 14,55):** dura ~303 dias sem nenhuma imagem (só o custo fixo), ~66 dias com 20 imagens Chroma por dia e ~16 dias com 100 por dia.

**Por que em cenários:** não consegui medir o uso real por dia. O site grava o gasto diário no Redis, mas o endereço do Redis está protegido na Vercel. Os registros da Vercel guardam só os últimos ~50 acessos. A atividade do OpenRouter mistura usuários com os meus testes: o dia 18/11 teve 1.151 pedidos, quase todos de teste. Para ter o número real, dá para criar uma rota de administrador que mostre o gasto gravado por dia.

## 6. Os planos dão prejuízo?

Receita líquida por mês: o preço menos a taxa do Pix, de R$ 0,80 por cobrança (**não confirmada**: é o valor citado em fórum; o AbacatePay não publica a tabela). No cripto, o NOWPayments cobra 0,5%.

**Gasto máximo de um assinante por mês:**
- **Uso normal, mesmo batendo em tudo:** teto do Pro (US$ 3,60), teto do uso justo (US$ 1,54) e os 500 créditos inclusos (até US$ 0,43 de custo). Total: **US$ 5,57** (R$ 33,09).
- **Abuso:** soma uma mensagem gigante que passa de cada teto e um saldo de créditos negativo (detalhes nos itens 7.1 e 7.3). Total: **US$ 10,20** (R$ 60,59).

| Plano | Receita líquida por mês | Sobra no uso normal máximo | Sobra no abuso |
|---|---|---|---|
| Mensal (R$ 99) | R$ 98,20 | R$ 65,11 | R$ 37,61 |
| Trimestral (R$ 252,45) | R$ 83,88 | R$ 50,79 | R$ 23,29 |
| Anual (R$ 890) | R$ 74,10 | R$ 41,01 | R$ 13,51 |

**Veredito por plano:**
- **Pro (mensal, trimestral, anual): não dá prejuízo.** No pior caso, o anual ainda sobra R$ 13,51 por mês. Ficam de fora os custos fixos do projeto (Vercel, domínio, RunPod parado), que não dependem do número de assinantes.
- **Grátis: dá prejuízo por definição**, porque não tem receita.
  - Um usuário que usa as 15 mensagens do dia com Sonnet custa ~US$ 0,10 por dia (~US$ 2,45 por mês). No pior caso, com mensagens no tamanho máximo do grátis, ~US$ 0,81 por dia.
  - O gasto com Claude no grátis tem freio de **US$ 3 por dia** no total (~US$ 90 por mês).
  - Depois do freio, cada usuário segue no DeepSeek, a ~US$ 0,82 por mês. As imagens do grátis custam até ~US$ 0,17 por usuário por mês. **Essas duas partes não têm teto total.**
- **Créditos (Kimi e Hermes):** cada crédito sai a 1,95× o custo com o dólar de hoje. O código usa R$ 5,80; hoje o dólar está em R$ 5,94. Gastar créditos nunca dá prejuízo, **mas o saldo pode ficar negativo** (item 7.1). Hoje só é possível ganhar créditos pelo plano: a recarga avulsa só existe para o administrador.
- **Chaves do dono** (administrador e Pro Plus): não têm teto e não são vendidas. O seu próprio uso e os testes saem do seu bolso.

## 7. Onde o projeto pode ficar no vermelho e como fechar

1. **Créditos negativos.**
   - O problema: para começar uma resposta do Kimi ou do Hermes, basta ter 3 créditos, e o desconto só acontece no fim. Uma mensagem com ~1 milhão de tokens no Kimi custa ~2.904 créditos.
   - Como fechar: estimar o custo máximo antes e só começar se o saldo cobre, e limitar o tamanho do histórico nesses modelos.
2. **Grátis sem teto total.**
   - O problema: o freio de US$ 3 por dia vale só para o Claude. O DeepSeek do grátis e as imagens crescem com o número de usuários, ou com abuso por troca de IP.
   - Como fechar: um teto diário total do grátis. Passou, o grátis pausa até o dia seguinte.
3. **Mensagem gigante no Pro passa do teto uma vez.**
   - O problema: no Pro, a entrada só é cortada no limite do modelo (até ~1 milhão de tokens no Sonnet, ~US$ 2 por mensagem). O teto confere o gasto antes de cada mensagem, mas não o tamanho dela.
   - Como fechar: limitar a entrada do Pro (por exemplo, a 200 mil caracteres), como o grátis já faz com 48 mil.
4. **OpenRouter perto do fim.**
   - O problema: US$ 4,18 pagam a busca na web e a reserva. Se zerar, a busca para sem avisar e a reserva deixa de existir.
   - Como fechar: recarregar e ter um alerta de saldo baixo.
5. **Câmbio dos créditos.**
   - O problema: o código usa R$ 5,80 e o dólar está em R$ 5,94.
   - Como fechar: ajustar a variável `CREDIT_FX_BRL` para 5,95.
6. **Testes em massa nas chaves reais: proibido a partir de agora.** Testes de volume só com provedores falsos.

## 8. Fontes

- Preços do Claude: [platform.claude.com/docs/en/about-claude/pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- Busca na web do OpenRouter: [openrouter.ai/docs/guides/features/plugins/web-search](https://openrouter.ai/docs/guides/features/plugins/web-search)
- Preços da OpenUncensored e do OpenRouter: lidos nas APIs deles (`/v1/models`) em 21/11.
- Saldos: APIs da OpenUncensored (`/v1/credits`), do OpenRouter (`/api/v1/credits`) e do RunPod, consultadas em 21/11.
- Taxa do NOWPayments: [nowpayments.io/help/about-nowpayments/about/what-are-your-fees](https://nowpayments.io/help/about-nowpayments/about/what-are-your-fees)
- Taxa do AbacatePay (**não oficial**): [github.com/bacen/pix-api/discussions/266](https://github.com/bacen/pix-api/discussions/266)
- Câmbio: [api.frankfurter.dev](https://api.frankfurter.dev/v1/latest?base=USD&symbols=BRL) e [AwesomeAPI](https://economia.awesomeapi.com.br/json/last/USD-BRL)
- Tetos, limites e créditos: código do 451, commit `5c5d231` (`src/limits.js`, `src/credits.js`, `src/pay.js`, `src/cost.js`).
