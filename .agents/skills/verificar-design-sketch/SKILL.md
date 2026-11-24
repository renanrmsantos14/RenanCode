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
6. Passada real (web): subir `vp run dev` com `--base-dir` isolado, parear, pedir "explore a login screen" a um Claude Haiku e conferir cartão, abas A/B/C e zoom no visualizador. O `Replay (dev)` não tem cenário de `design_sketch`.
7. Passada real (desktop): abrir o cartão deve abrir o painel Design, selecionar o nó e (se removido) recolocar com `design.placeSketch`; arrastar só grava `moveNodes` ao soltar; zoom < 0,35 troca iframe por miniatura; tela cheia pelo botão da barra.

## Limites

- Miniatura exige o Chrome headless; sem ele o sketch fica sem `thumbnailAttachmentId`.
- ACP e OpenCode não têm lista de tools: recebem `design_sketch` pelo MCP sem ajuste.
