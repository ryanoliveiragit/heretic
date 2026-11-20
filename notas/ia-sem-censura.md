# IA sem censura — referências (salvo 2026-11-19)

## Links
- https://hft.md/uncensored-ai — ranking de 103 modelos abliterated/heretic (notas do UGI Leaderboard, não conferidas). Local via Ollama; hospedado pago (Featherless) ou por uso (OpenRouter). Site voltado a trading BTC.
- https://github.com/PurpleDoubleD/locally-uncensored — app desktop AGPL-3.0, chat + imagem + vídeo + agente de código. v3.1.2 em 19/11/2026. Win/Linux/Mac/Android. Releases com .sig e SHA256SUMS.
- https://github.com/p-e-w/heretic — ferramenta que gera os modelos "heretic" (abliteration automática, AGPL-3.0).

## Top do hft.md por memória (GB) — para escolher pelo hardware
- 5 GB: MuXodious/Qwen3.5-4B-SOMPOA-heresy-v2, MuXodious/Qwen3.5-4B-ARA-heresy-v2
- 8 GB: trohrbaugh/Qwen3.5-9B-heretic-v2, huihui-ai/Huihui-Qwen3.5-9B-abliterated
- 9 GB: llmfan46/gemma-3-12b-it-ultra-uncensored-heretic, grimjim/gemma-3-12b-it-* (abliterated)
- 16 GB: TheDrummer/Cydonia-24B-v4.3, coder3101/Cydonia-24B-v4.3-heretic, dphn/Dolphin-Mistral-24B-Venice-Edition
- 18-19 GB: coder3101/Qwen3.5-27B-heretic, llmfan46/gemma-4-26B-A4B-it-ultra-uncensored-heretic
- 21 GB (topo do ranking): coder3101/gemma-4-31B-it-heretic, llmfan46/gemma-4-31B-it-uncensored-heretic

Rodar: `ollama run hf.co/<quantizador>/<modelo>-GGUF` (a maioria dos GGUF é de mradermacher/bartowski, não do autor).
