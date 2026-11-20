---
name: Publicar site em produção
description: Publica em produção um site Vite hospedado na Vercel, por push no
  main ou por deploy direto pela CLI, inclusive quando só uma parte do site
  (como a pasta /app/ com service worker) muda, com conferência local,
  comparação de sha e verificação no endereço público. Usar quando o usuário
  pedir para subir, publicar ou colocar no ar mudanças do site.
---

# Publicar site em produção

Vale para site Vite hospedado na Vercel, publicado por push no `main` ou por deploy direto pela CLI. Faça os passos nesta ordem e não pule a conferência local nem a pública.

## Antes de começar

- Se o usuário pediu para aprovar algo antes (cor, layout, design), só publique depois da aprovação explícita. Se você interpretou ou combinou opções por conta própria, mostre o resultado antes do push.
- Confirme que está na cópia de trabalho certa e no branch certo: `git branch --show-current`, `git status --short`, `git log --oneline | head -2`.
- Confira nas suas anotações se o repositório tem regra sobre a linha de coautoria no commit. Na dúvida, pergunte antes de fazer o commit.
- Confira o escopo da Vercel do projeto (`.vercel/project.json` e a equipe em `npx vercel teams ls`). Sem o escopo certo, a CLI usa a conta errada.
- Se o pedido for publicar só uma parte do site, liste exatamente quais pastas e arquivos mudam (ex.: `public/app` e `sw.js`). Tudo o que não está nessa lista deve ficar igual ao último deploy.

## Procedimento

1. **Typecheck e build.**
   - Rode o typecheck do projeto e `npm run build > ../build.log 2>&1; echo "build: $?"`.
   - Só siga com código de saída 0. Se falhar, leia o fim do log.

2. **Subir o preview local do build.**
   - `(nohup npx vite preview --port N --strictPort > ../preview.log 2>&1 &); sleep 4`
   - Use `--strictPort`, para o Vite não trocar de porta em silêncio e você acabar conferindo outra coisa.
   - Use uma porta nova a cada rodada, para não conferir um preview antigo.

3. **Conferir as telas no preview.**
   - Rode o script de verificação (Playwright) contra `http://localhost:N`.
   - Telas de sempre: home, página de componente, página de bloco, docs, Pro, celular e tema claro.
   - Inclua as telas tocadas pela mudança e os redirecionamentos, se a mudança mexeu em rotas.
   - Exija: nenhum erro de console, nenhuma resposta com erro, vídeos tocando.
   - Abra a folha de capturas e olhe de verdade. O script passar não prova que o visual está certo.
   - Se mexeu em cor de texto ou de botão, calcule o contraste (WCAG) antes de publicar.
   - Se o navegador travar ou der timeout ao abrir a página, trate como falha e não publique: pode ser um ciclo infinito no JavaScript, que derruba o Safari do iPhone. Só siga depois de achar a causa e provar que a página responde, contando quadros com `requestAnimationFrame` durante alguns segundos.

4. **Encerrar o preview.**
   - `pkill -f "[v]ite preview --port N"`
   - Use sempre os colchetes. Sem eles o padrão casa com a linha do próprio shell, o comando inteiro morre com código 144 e o commit não acontece.
   - Separe do resto com `;` e nunca com `&&`. O `pkill` devolve 1 quando não acha processo, e isso cancelaria o que vem depois.
   - Se um comando composto morrer no meio, veja o estado real antes de repetir: `pgrep -af "[v]ite preview"`, `git status --short`, `git log --oneline | head -2`.

5. **Comparar o sha remoto do `main` com o local.**
   - `remote=$(gh api repos/<dono>/<repo>/commits/main --jq '.sha[0:7]')`
   - `local=$(git rev-parse --short HEAD)`, tirado antes do commit novo.
   - Iguais: siga.
   - Diferentes: pare, porque outro agente ou pessoa publicou. Faça `git fetch`, integre as mudanças e repita build e preview.
   - Nunca faça push forçado; ele apaga a publicação de outra pessoa.

6. **Conferir os assets antes de versionar.**
   - Liste os assets do site (logo, ícones, imagens, SVG, PNG) e confirme que nenhum está ignorado: `git check-ignore -v <caminho>` para cada um, e `git ls-files <pasta-de-assets>` para ver o que já é versionado.
   - Se um padrão do `.gitignore` (como `*.png`) pegar um asset, libere-o com uma negação (`!<caminho>`) e confira de novo.
   - Faça isso antes do `git add -A`, porque o build passa sem o arquivo e o deploy sai com imagem quebrada.

7. **Publicar.** Escolha um dos dois caminhos.
   - **Por push (deploy automático do `main`):** `git add -A && git status --short | wc -l && git commit -q -m "<mensagem>" && git push origin main`
     - Faça um commit por mudança pedida, com mensagem que diga o que mudou, para a reversão ser simples.
     - Anote o sha curto para o relatório.
   - **Por deploy direto pela CLI:** `npx vercel deploy --prod --yes --scope <escopo-da-equipe>`
     - Passe sempre `--scope`. Sem ele a CLI publica na conta errada, mesmo com o projeto linkado.
     - A CLI publica a pasta inteira, inclusive o que ainda não foi commitado. Logo antes do deploy, rode `git status --short` num comando separado (nunca na mesma linha do deploy) e confira se todo arquivo alterado é seu.
     - Se houver arquivo alterado por outro agente ou pessoa, não publique a pasta de trabalho: monte uma cópia limpa numa pasta nova (só os caminhos que vão ao ar e o `.vercel/project.json`), troque nela os arquivos alheios pela versão do último commit (`git show HEAD:<arquivo> > <cópia>/<arquivo>`), rode o deploy de dentro da cópia e apague a cópia depois.
     - **Publicação parcial (só uma pasta, como `/app/` de um site com service worker):** monte a cópia a partir da pasta do último deploy, não da árvore de trabalho, porque ela pode ter partes antigas ou alheias. Troque só o que mudou (ex.: `public/app` e `sw.js`) e mantenha o restante idêntico ao deploy anterior. Sem isso, a parte que você não mexeu volta a uma versão antiga.
     - **Ao levar o build da árvore de trabalho para a cópia, copie só a pasta de saída (`public/` ou `dist/`), nunca o código-fonte (`src/`).** O `src/` da árvore de trabalho pode estar mais velho que o da cópia, e copiá-lo por cima apaga código do servidor sem nenhum erro de build. Se aconteceu, restaure o `src/` de uma cópia íntegra e compare com `diff -rq` antes de seguir.
     - **Antes do deploy, tire da cópia os arquivos de teste local:** `rm -f .env .env.local node_modules` (este último costuma ser um symlink criado para subir o servidor local). A CLI envia a pasta inteira. Confira num comando separado, `ls -a | grep -E '^\.env|^node_modules$'` sem saída, porque um comando composto que morre no meio pula o `rm` sem avisar.
     - **Ao trocar o bundle de uma pasta, troque também a versão do `sw.js`.** Os ícones em cache-first costumam manter o mesmo nome de arquivo, então quem já visitou continua vendo os antigos enquanto a versão do service worker não muda.
     - Confira o final da saída: status READY, a linha do alias e a URL do deploy novo (`https://...vercel.app` específica daquele deploy). Se não ficar READY, não diga que está no ar.
     - Se a saída vier sem `readyState` ou sem alias (o comando foi cortado, por exemplo com código 144), rode o deploy de novo sozinho, num comando próprio, antes de concluir qualquer coisa.
     - Guarde essa URL e o id do deploy (`dpl_...`) para os passos 8 e 11.
     - Commite e faça push depois, para o repositório refletir o que está no ar.

8. **Garantir que o domínio público aponta para o deploy novo.**
   - Quando o deploy foi por CLI com `--force`, o domínio público pode continuar servindo o deploy antigo, e os testes rodariam no código velho e pareceriam mostrar que a correção falhou.
   - Se o marcador do passo 9 não aparecer ou o nome do bundle for diferente, aponte o domínio para o deploy novo: `npx vercel alias set <url-do-deploy-novo> <dominio-publico> --scope <escopo>`.
   - Use a URL que saiu na saída deste deploy, não uma antiga nem a do painel. Depois de apontar, espere alguns segundos e confira de novo.

9. **Esperar a Vercel servir a versão nova.**
   - Não confira o endereço público logo após o push ou o deploy, porque ele ainda serve a versão antiga.
   - Escolha um marcador que só existe no build novo (uma variável CSS com o valor novo, por exemplo) e consulte o asset da home:
   ```bash
   sleep 20
   for i in 1 2 3 4; do
     css=$(curl -s "https://<site>/?nocache=$RANDOM" | grep -o 'assets/index-[^"]*\.css' | head -1)
     val=$(curl -s "https://<site>/$css" | grep -o "<marcador>" | head -1)
     echo "$i: $css $val"
     [ -n "$val" ] && break
     sleep 15
   done
   ```
   - Se o marcador não aparecer depois das tentativas, confira o alias (passo 8) e o estado do deploy antes de dizer que está no ar.

10. **Conferir no endereço público.**
   - **Primeiro, pelo HTML publicado (obrigatório).** Baixe a home e as páginas tocadas com `curl -s` e procure com `grep` a marcação esperada: o `href` de cada CTA alterado, o `meta viewport`, o nome do bundle. Isso prova o que foi publicado sem depender do navegador, que dá timeout em páginas pesadas e não prova o deploy.
   - Compare o bundle JS servido com o do build local: o nome `assets/index-*.js` na home publicada deve ser igual ao gerado em `dist/` pelo build desta rodada. Se for diferente, a produção não é esta versão.
   - Numa publicação de subpasta (como `/app/`), leia o nome do bundle no HTML dessa subpasta: `curl -s https://<site>/app/ | grep -oE 'src="[^"]*assets/[^"]*"'`. O HTML da home não referencia o bundle da subpasta.
   - Confirme que nenhum arquivo de segredo ficou exposto: `curl -s -o /dev/null -w "%{http_code}" https://<site>/.env` deve dar 404.
   - **Compare o md5 dos assets publicados com os de origem.** Para ícones e imagens, `curl -s https://<site>/<caminho> | md5sum` deve bater com `md5sum <arquivo-de-origem>`. Se não bater, o asset antigo ainda está em cache ou no deploy errado.
   - Confirme que o `sw.js` publicado tem a versão nova (a que você trocou no passo 7).
   - Teste a URL de cada asset (logo, ícones, imagens) com `curl -s -o /dev/null -w "%{http_code}" https://<site>/<caminho>`. Todos devem dar 200, porque um asset ausente só aparece como imagem quebrada.
   - **Depois, se o navegador de teste responder,** rode a verificação do passo 3 contra a URL de produção, com os mesmos critérios: sem erro de console, sem resposta com erro, vídeos tocando. Se der timeout, não insista: diga no relatório que a checagem visual pública não rodou.
   - Guarde as capturas na pasta de trabalho.

11. **Registrar.** Acrescente ao arquivo de estado do trabalho o que foi publicado, o caminho usado (push ou CLI), o sha, o id e a URL do deploy, o que ficou pendente e o **comando de undo**. O undo de uma publicação por CLI é apontar o alias para o deploy anterior: `npx vercel alias set <url-do-deploy-anterior> <dominio-publico> --scope <escopo>`. Descubra a URL anterior antes de publicar, com `npx vercel inspect <dominio> --scope <escopo>` ou pela saída do deploy anterior.

## Como o usuário quer o resultado

- Resposta em português, curta, começando pelo fato: está no ar, com o link do site.
- Depois, em listas curtas:
  - o que mudou e onde;
  - o que foi conferido em produção (quantas telas, sem erro de console, assets respondendo 200, md5 dos assets iguais aos de origem, marcação presente no HTML público);
  - o que ficou de fora ou não foi testado (Safari e iPhone, por exemplo, ou checagem visual que deu timeout);
  - decisões que você tomou sozinho (um tom de cor, por exemplo), com a oferta de ajustar;
  - o sha do commit no `main` (se houve push) e o comando de undo: reverter o commit, ou apontar o alias para o deploy anterior.
- Separe problemas antigos, anteriores à mudança, dos causados por ela.
- Anexe uma captura quando a mudança for visual.

## Verificação final

- Typecheck e build com saída 0.
- Assets do site versionados (nenhum ignorado pelo `.gitignore`) e respondendo 200 na URL pública, com md5 igual ao da origem.
- `sw.js` com versão nova sempre que algum asset cacheado mudou.
- Preview local conferido e encerrado: `pgrep -af "[v]ite preview"` não lista nada.
- Sha remoto igual ao local antes do push; `git status --short` vazio depois.
- Deploy por CLI, se usado, com status READY, alias na saída, `--scope` informado e id do deploy registrado.
- Cópia de deploy sem `.env`, `.env.local` nem `node_modules`; só a pasta de saída do build foi sincronizada para ela, nunca o `src/`.
- `/.env` no endereço público responde 404.
- Publicação parcial: as partes não alteradas estão idênticas ao deploy anterior.
- Domínio público servindo o deploy desta rodada (alias conferido pelo marcador e pelo nome do bundle JS).
- Asset público contém o marcador novo e o nome do bundle JS é o do build local.
- Marcação alterada (hrefs de CTA, meta viewport) presente no HTML público baixado com curl.
- Telas de produção sem erro de console nem resposta com erro, quando o navegador conseguiu rodar; se não conseguiu, isso está dito no relatório.
- Comando de undo registrado no arquivo de estado.
