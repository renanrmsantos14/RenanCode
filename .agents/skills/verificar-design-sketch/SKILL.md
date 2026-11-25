---
name: verificar-design-sketch
description: "Verifica a ferramenta MCP design_sketch, os sketches de html_variants e o canvas de Design: servidor, convidado, cartões no chat (web, desktop, mobile) e canvas do desktop. Use após mudar apps/server/src/design/**, apps/server/src/mcp/toolkits/html/**, packages/shared/src/design.ts, apps/web/src/components/design/**, packages/client-runtime/src/state/design.ts ou os cartões de sketch na timeline."
---

# Verificar design_sketch

## Cobre

- Servidor: `DesignService` (`createSketches`, snapshot, limpeza ao apagar a thread), tools `design_sketch` e `html_variants` (`designSketches`), `HtmlRender.readPage`.
- Convidado: `GuestShareService.render` serve a página do sketch e a miniatura (`?thumbnail=1`) só do próprio projeto.
- Clientes: cartão com miniatura na timeline (`DesignSketchTimelineRow`), visualizador em tela cheia com abas A/B/C (web e convidado), superfície "Design" no painel direito com canvas `@xyflow/react` (só desktop, `isElectron`), cartão simples no feed do mobile (`DesignSketchCards`).
- Um Design por thread; o canvas não existe na web fora do Electron nem no mobile.

## Roteiro

1. Testes: `vp test run apps/server/src/design apps/server/src/guest apps/server/src/htmlRender apps/server/src/attachmentStore.test.ts apps/server/src/mcp/toolkits/core.test.ts` (Node 26 no PATH). O `core.test.ts` troca o `PreviewBrowser` por um mock: o real baixa o Chrome e trava o teste por 120 s.
2. `design_sketch` com `html` grava um sketch no canvas da thread; com `path` só em thread full-access (senão "only full-access threads").
3. `html_variants` devolve `htmlRenders` e `designSketches` no mesmo grupo; se o canvas falhar, devolve só `htmlRenders` (aviso no log); página inválida não grava nada.
4. Evals (precisam de `ANTHROPIC_API_KEY` no `.env`): `cd evals && pnpm mcp-tool-use --cases mcp-tool-use/cases/visual-preview.ndjson --case explore-screen-uses-design-sketch,guard-chart-stays-html-render,screen-options-use-html-variants-not-design-sketch --samples 2 --out runs/design`. Sem chave, `--dry-run` confere só a montagem.

5. Clientes: `cd apps/web && vp test run src/components/design src/session-logic.test.ts` (browser tests: cartões web e desktop, canvas com arrasto real por CDP, remover, foco pedido pelo cartão) e `cd apps/mobile && vp test run src/lib/threadActivity.test.ts`.
6. Passada real (web): `vp run dev` com `.t3` da worktree, `node apps/server/src/bin.ts pair --base-dir .t3` para o link de pareamento (Chromium do playwright em `~/.cache/ms-playwright`). Copie `~/.t3/userdata/settings.json` para `.t3/userdata/`. Sem `Replay (dev)` para `design_sketch`: crie projeto e thread pela CLI (`project add --base-dir .t3 <pasta>`, `thread start --provider <instância Claude> --model claude-haiku-5-5 <projeto> "Use design_sketch ..."`, `thread send` para as seguintes). Conferir: cartão com miniatura, clique abre o visualizador em tela cheia com abas A/B/C (a aba C troca a página), Esc fecha, nenhuma superfície Design, sem erro de console.
7. Passada real (desktop): `T3CODE_DESKTOP_REMOTE_DEBUGGING_PORT=9333 vp run dev:desktop` e `playwright-core` `connectOverCDP("http://127.0.0.1:9333")`. No Linux sem `libsecret-1-dev`, falta o helper `native/browser-secret/build/x64/t3-browser-secret`: um stub (cópia de `/bin/true`, ignorado pelo git) basta. A tela inicial "Welcome" não tem botão de pular: vá à thread pelo clique na barra lateral. Conferir, com o banco (`node:sqlite` somente leitura em `.t3/userdata/statev2.sqlite`, tabelas `design_sketches`, `design_canvas_nodes`, `design_canvas_viewports`):
   - canvas sem viewport salvo abre com `fitView` de todos os nós (margem de 10%) e reenquadra ao redimensionar o painel/tela cheia enquanto o usuário não moveu a vista; "React Flow" não aparece no rodapé;
   - rótulo do nó (letras A/B/C + título) tem tamanho fixo na tela em qualquer zoom e as linhas de variações ficam separadas por `DESIGN_CANVAS_ROW_GAP` (200), sem sobrepor o quadro de cima;
   - miniatura do cartão sem faixa branca (proporção do sketch, `object-cover object-top`) e sem miniatura usa o fundo do tema;
   - cartão da thread → painel Design abre e o nó é enquadrado com folga (zoom ≤ 1,5, margem de 12%);
   - arrastar um nó (mouse real, passos pequenos) grava `x/y` ao soltar, o nó não volta, e persiste após recarregar;
   - roda do mouse, Zoom in/out e arrastar o fundo gravam o viewport e ele é restaurado após recarregar;
   - "Fit to screen" deixa 20% de margem; "Full screen" maximiza o painel (não é a tela cheia do navegador);
   - selecionar um nó + "Remover do canvas" apaga o nó; clicar no cartão da thread recoloca (nó novo abaixo do último) e enquadra.

## Limites

- Miniatura exige o Chrome headless; sem ele (ou enquanto o primeiro uso o baixa, `PreviewBrowserInstallingError`) o sketch fica sem `thumbnailAttachmentId`: o cartão mostra um quadro com ícone e o nó do canvas fica em branco. Não há regeração depois.
- Link de convidado de verdade exige T3 Connect; aqui só os testes de `apps/server/src/guest` e `GuestPage` cobrem a rota.
- No `fitView` do `@xyflow/react` 13, `padding` numérico é em pixels; use string com `%`.
- ACP e OpenCode não têm lista de tools: recebem `design_sketch` pelo MCP sem ajuste.
