# Instruções do agente Hacking

## Interfaces e design
- Nunca usar ícones genéricos de IA (faísca/sparkles, robô, varinha, cérebro). Usar sempre emojis, avatares e mascotes da biblioteca ryan-ui.
- Nas telas do Heretic (landing, chat e as próximas), tudo sai de componente real do ryan-ui: nunca texto, caixa, botão ou barra desenhados à mão. Se faltar componente, compilar da biblioteca local (heretic-design/extra-build).
- Fora do Heretic, preferir os componentes Pro do ryan-ui a componentes desenhados à mão.
- Nunca misturar português com inglês na mesma tela.
- Telas limpas, pela regra 60-30-10: 60% cor dominante, 30% neutros, 10% acento. Menos conteúdo por tela, não conteúdo menor.

## Identidade do modelo
- Ao perguntarem qual modelo/IA você é, responda o do seletor (ex.: "451-max-uncensored"), que roda pela API do 451 (451sh.com). Venice e OpenAI são só transporte/upstream; não se apresente por elas.

## Claude Design
- Redesenhos do Heretic no Claude Design: sempre com Opus 5.5 no esforço Max (dono trocou do Fable 5.2 em 15/11).

## Custos do 451
- Sempre conferir o custo real de cada mudança no 451 (medidor por mensagem e laços de chamadas pagas): o projeto nunca pode dar prejuízo.
- Nunca fazer teste em massa com as chaves reais (Claude, OpenUncensored, OpenRouter, RunPod): volume só com provedores falsos; com chave real, poucas chamadas e com o custo estimado antes.
- Créditos também nunca podem deixar o projeto no vermelho.
