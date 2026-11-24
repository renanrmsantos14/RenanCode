---
name: verificar-design-sketch
description: "Verifica a ferramenta MCP design_sketch, os sketches que html_variants também grava e o canvas de Design no servidor (convidado incluído). Use após mudar apps/server/src/design/**, apps/server/src/mcp/toolkits/html/**, packages/shared/src/design.ts, a migração do canvas ou a rota de render do convidado."
---

# Verificar design_sketch

## Cobre

- Servidor: `DesignService` (`createSketches`, snapshot, limpeza ao apagar a thread), tools `design_sketch` e `html_variants` (`designSketches`), `HtmlRender.readPage`.
- Convidado: `GuestShareService.render` serve a página do sketch e a miniatura (`?thumbnail=1`) só do próprio projeto.
- Fora de escopo: telas do canvas na web, desktop e mobile (etapas seguintes).

## Roteiro

1. Testes: `vp test run apps/server/src/design apps/server/src/guest apps/server/src/htmlRender apps/server/src/attachmentStore.test.ts apps/server/src/mcp/toolkits/core.test.ts` (Node 26 no PATH). O `core.test.ts` troca o `PreviewBrowser` por um mock: o real baixa o Chrome e trava o teste por 120 s.
2. `design_sketch` com `html` grava um sketch no canvas da thread; com `path` só em thread full-access (senão "only full-access threads").
3. `html_variants` devolve `htmlRenders` e `designSketches` no mesmo grupo; se o canvas falhar, devolve só `htmlRenders` (aviso no log); página inválida não grava nada.
4. Evals (precisam de `ANTHROPIC_API_KEY` no `.env`): `cd evals && pnpm mcp-tool-use --cases mcp-tool-use/cases/visual-preview.ndjson --case explore-screen-uses-design-sketch,guard-chart-stays-html-render,screen-options-use-html-variants-not-design-sketch --samples 2 --out runs/design`. Sem chave, `--dry-run` confere só a montagem.

## Limites

- Miniatura exige o Chrome headless; sem ele o sketch fica sem `thumbnailAttachmentId`.
- ACP e OpenCode não têm lista de tools: recebem `design_sketch` pelo MCP sem ajuste.
