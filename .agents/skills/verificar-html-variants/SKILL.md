---
name: verificar-html-variants
description: "Verifica a ferramenta MCP html_variants e as variações lado a lado (web, convidado). Use após mudar packages/shared/src/htmlRender.ts, apps/server/src/htmlRender/**, apps/server/src/mcp/toolkits/html/**, apps/web/src/components/chat/HtmlVariantsTimelineRow.tsx ou a linha html-variants da timeline."
---

# Verificar html_variants

## Cobre

- Servidor: `HtmlRender.publishVariants`, `mcp/toolkits/html/{tools,handlers}.ts`, rota do convidado com `?variant=`.
- Web: `HtmlVariantsTimelineRow.tsx` (grade/carrossel, botão "Use X"), `ChatView.tsx` (`followHtmlVariant`).

## Roteiro

1. Testes: `node_modules/.bin/vp test run packages/shared/src/htmlRender.test.ts apps/server/src/htmlRender apps/server/src/guest apps/web/src/components/chat/HtmlVariantsTimelineRow.browser.test.tsx`.
2. App real: `vp run dev --no-seed` em segundo plano; copie `~/.t3/userdata/settings.json` para `.t3/userdata/` (senão só aparece Codex). Abra a URL de pareamento do log.
3. Nova thread, modelo Claude Haiku 5.5 (digite "haiku" na busca do seletor). Peça "3 options for a login screen mockup".
4. Conferir: 3 iframes, botões "Use A/B/C", rótulos sem letra duplicada.
5. Clicar "Use B": o composer fica com `Continue with variant B (<rótulo>): `, com foco e sem envio.
6. Convidado: compartilhar a thread; variações visíveis, sem botões "Use".

## Dicas

- `preview_snapshot` é enorme; prefira `preview_evaluate` com `innerText` e `getBoundingClientRect`.
- Cliques via `preview_act` expiram com a aba oculta; use `element.click()` no `preview_evaluate`.
- Largura do painel < ~976 px força carrossel (3 × 320 mínimo); a grade só aparece em painel largo.

## Limites

- Mobile e Antigravity/ACP (recuperação só reconstrói `html_render`) não cobertos.
