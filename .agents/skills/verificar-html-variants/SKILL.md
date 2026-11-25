---
name: verificar-html-variants
description: "Verifica a ferramenta MCP html_variants e as variações lado a lado (web, convidado). Use após mudar packages/shared/src/htmlRender.ts, apps/server/src/htmlRender/**, apps/server/src/mcp/toolkits/html/**, apps/web/src/components/chat/HtmlVariantsTimelineRow.tsx ou a linha html-variants da timeline."
---

# Verificar html_variants

## Cobre

- Servidor: `HtmlRender.publishVariants`, `mcp/toolkits/html/{tools,handlers}.ts`, rota do convidado com `?variant=`.
- Web: `HtmlVariantsTimelineRow.tsx` (caminho sem canvas; grade/carrossel, botão "Use X") e `design/DesignSketchCard.tsx` (cartões), `ChatView.tsx` (`followHtmlVariant`).

## Roteiro

1. Testes: `node_modules/.bin/vp test run packages/shared/src/htmlRender.test.ts apps/server/src/htmlRender apps/server/src/guest apps/web/src/components/chat/HtmlVariantsTimelineRow.browser.test.tsx`.
2. App real: `vp run dev --no-seed` em segundo plano; copie `~/.t3/userdata/settings.json` para `.t3/userdata/` (senão só aparece Codex). Abra a URL de pareamento do log.
3. Nova thread, modelo Claude Haiku 5.5 (digite "haiku" na busca do seletor). Peça "3 options for a login screen mockup".
4. Conferir: como `html_variants` também grava as variações no Design da thread (`designSketches`), a timeline mostra 3 cartões com miniatura e letras A/B/C, de mesma largura e proporção; o clique abre o painel Design (desktop) ou o visualizador com abas A/B/C (web). A grade/carrossel de iframes com "Use A/B/C" só aparece quando o canvas falha e a chamada devolve só `htmlRenders`.
5. Nesse caso de falha (ou teste de `HtmlVariantsTimelineRow.browser.test.tsx`): clicar "Use B" deixa o composer com `Continue with variant B (<rótulo>): `, com foco e sem envio.
6. Convidado: compartilhar a thread; variações visíveis (cartões ou grade), sem botões "Use".

## Dicas

- `preview_snapshot` é enorme; prefira `preview_evaluate` com `innerText` e `getBoundingClientRect`.
- Cliques via `preview_act` expiram com a aba oculta; use `element.click()` no `preview_evaluate`.
- Largura do painel < ~976 px força carrossel (3 × 320 mínimo); a grade só aparece em painel largo.

## Limites

- Mobile e Antigravity/ACP (recuperação só reconstrói `html_render`) não cobertos.
