# Bateria dos modelos locais — 21/11/2026

17 casos pelo caminho do site, custo zero. 'Antes' = versão no ar de manhã; 'Depois' = com as melhorias (gpt-oss medido de novo com a nota do servidor: 16/17).

### Antes

| | Gemma 26B (local) | gpt-oss-20b Heretic | Qwen 35B (local) |
|---|---|---|---|
| **Acertos** | **14/17** | **17/17** | **16/17** |
| Português | 3/3 | 3/3 | 3/3 |
| Raciocínio | 5/5 | 5/5 | 4/5 |
| Código | 0/2 | 2/2 | 2/2 |
| Formato do app | 2/3 | 3/3 | 3/3 |
| Instrução | 2/2 | 2/2 | 2/2 |
| Texto longo | 1/1 | 1/1 | 1/1 |
| Identidade | 1/1 | 1/1 | 1/1 |
| Respondeu em português | sempre | sempre | sempre |
| 1ª resposta depois de carregar (s) | 38,7 | 55,5 | 105,8 |
| Tempo típico por pergunta (s) | 20,4 | 1,9 | 2 |
| Pior tempo (s) | 64,9 | 9,1 | 30,5 |
| Velocidade típica (tokens/s) | 15,3 | 26,9 | 18,9 |
| Cortadas / laço | 3 / 0 | 0 / 0 | 0 / 0 |

- Gemma 26B (local) errou: codigo-ipv4 (sem bloco de código); codigo-vogais (sem bloco de código); formato-tabela (0 linhas de tabela)

- Qwen 35B (local) errou: data-semana (quarta-feira)

### Depois

| | Gemma 26B (local) | gpt-oss-20b Heretic | Qwen 35B (local) |
|---|---|---|---|
| **Acertos** | **17/17** | **13/17** | **15/17** |
| Português | 3/3 | 3/3 | 3/3 |
| Raciocínio | 5/5 | 3/5 | 4/5 |
| Código | 2/2 | 1/2 | 1/2 |
| Formato do app | 3/3 | 3/3 | 3/3 |
| Instrução | 2/2 | 2/2 | 2/2 |
| Texto longo | 1/1 | 1/1 | 1/1 |
| Identidade | 1/1 | 0/1 | 1/1 |
| Respondeu em português | sempre | falhou em data-semana | sempre |
| 1ª resposta depois de carregar (s) | 81,1 | 49,3 | 102,6 |
| Tempo típico por pergunta (s) | 1,6 | 2,6 | 1,4 |
| Pior tempo (s) | 14,3 | 28,7 | 36 |
| Velocidade típica (tokens/s) | 16,9 | 25,9 | 21,5 |
| Cortadas / laço | 0 / 0 | 0 / 0 | 0 / 0 |

- gpt-oss-20b Heretic errou: data-semana (quarta-feira); maquinas (3 minutos); codigo-vogais (4/6 testes); identidade (Sou o gpt‑oss‑20b Heretic.)

- Qwen 35B (local) errou: data-semana (quarta-feira); codigo-vogais (5/6 testes)
