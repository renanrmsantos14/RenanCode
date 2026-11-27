---
name: verificar-html-variants
description: "Verifica a ferramenta MCP html_variants, o bloco Comparar e decidir (escolher, recolher) e a tela cheia de render HTML com o chat ao lado (web, mobile, convidado). Use após mudar packages/shared/src/htmlRender.ts, apps/server/src/htmlRender/**, apps/server/src/mcp/toolkits/html/**, apps/web/src/components/chat/HtmlVariantsTimelineRow.tsx, review/useHtmlFullscreenChat.ts, review/MockupViewer.tsx, review/useMockupViewer.ts, review/HtmlVariantStage.tsx, guest/GuestHtmlRender.tsx, chat/ReadOnlyThreadTimeline.tsx, a linha html-variants da timeline ou apps/mobile/src/lib/htmlVariantChoice.ts."
---

# Verificar html_variants

## Cobre

- Servidor: `HtmlRender.publishVariants`, `mcp/toolkits/html/{tools,handlers}.ts`, rota do convidado com `?variant=`.
- Shared: `findHtmlVariantChoice` / `htmlVariantChoiceTag` (escolha reconhecida no histórico, em qualquer idioma e na forma antiga `Continue with variant`).
- Web: `HtmlVariantsTimelineRow.tsx` (rádios, "Choose X", linha recolhida, "Show all", "Open in Design"), `MessagesTimeline.logic.ts` (`choice`), `chat/review/useHtmlFullscreenChat.ts` + `ChatView.tsx` (tela cheia com chat), `FullscreenChatToggleControl` na `WorkspaceTitlebarControls`.
- Visualizador ao vivo: `chat/review/{MockupViewer,useMockupViewer,HtmlVariantStage}` (web/desktop), ligado em `ChatView.tsx` e, para o convidado, em `ReadOnlyThreadTimeline.tsx` (`renderHtmlVariantStage`) com `GuestHtmlRender fill`.
- Limite: de 2 a 26 opções (`HTML_VARIANTS_MAX`, letras A–Z).
- Mobile: `lib/htmlVariantChoice.ts`, `threadActivity.ts`, `ThreadHtmlVariants` em `HtmlRenderWebView.tsx`, botão Chat em `features/files/AttachmentFileScreen.tsx`.

## Roteiro

1. Testes: `node_modules/.bin/vp test run packages/shared/src/htmlRender.test.ts apps/server/src/htmlRender apps/server/src/guest` e, dentro de `apps/web`, `vp test run src/components/chat/HtmlVariantsTimelineRow.browser.test.tsx src/components/chat/HtmlRenderFrame.browser.test.tsx src/components/chat/review/MockupViewer.browser.test.tsx src/components/guest/GuestPage.browser.test.tsx src/session-logic.test.ts`; dentro de `apps/mobile`, `vp test run src/lib/htmlVariantChoice.test.ts src/lib/threadActivity.test.ts`.
2. App real: `vp run dev --no-seed` em segundo plano; copie `~/.t3/userdata/settings.json` para `.t3/userdata/` (senão só aparece Codex). Abra a URL de pareamento do log.
3. Thread com Claude Haiku 5.5 (ou Replay): "Use the html_variants tool to show me 3 options for a login screen mockup. Make one a fixed 440px-wide mobile mockup. Then stop and wait for my choice." (ou `node apps/server/src/bin.ts thread start --base-dir .t3 --provider claudeAgent --model claude-haiku-5-5 <projeto> "<msg>"`).
4. Bloco: 3 células lado a lado (coluna ≥ 600 px), mockup de 440 px reduzido sem corte, "Choose" desativado até marcar um rádio, "Open in Design" presente. "Choose B" → composer com `I chose B (<rótulo>): ` (pt-BR: `Escolhi B …`), foco no fim, nada enviado.
5. Enviar → o bloco vira uma linha: miniatura, "You chose B · rótulo", nota, "Show all"; "Show all" reabre e mostra "Collapse". Recarregar mantém recolhido.
6. Tela cheia (botão no canto da célula ou de um `html_render`): painel maximizado com coluna de chat (~26 rem) e composer utilizável. No topo à direita, "Hide chat"/"Show chat": esconder zera a coluna e grava `t3code:html-fullscreen-chat-hidden=true` no localStorage; mostrar volta. Esc ou "Restore panel size" sai.
7. Largura < 768 px (`preview_resize` pixel-7): render ocupa a tela, chat numa folha inferior com alça "Chat"; tocar abre a folha com o composer.
8. Mobile (precisa de Device hub ligado, test-t3-mobile): bloco com chips A/B/C, "Escolher X", recolher depois de enviar; tela cheia de um render → botão "Chat" no cabeçalho abre o feed com composer, Voltar retorna ao render.
9. Visualizador (web/desktop): com 6 opções, a faixa de letras do bloco rola. Clicar numa célula só marca o rádio; o botão "Open X" do cabeçalho da célula (ou a tela cheia do quadro) abre o visualizador na opção. Topo: seletor A…F, título, "Choose X", esconder chat, "Close". Só um iframe no DOM (`document.querySelectorAll('iframe')` dentro do visualizador). ←/→ e o seletor trocam; com foco no composer ou dentro do mockup as setas não trocam. "Choose B" preenche o composer com `I chose B (<rótulo>): ` sem enviar; enviar recolhe o bloco. Rodapé com miniaturas (letra + rótulo, sem iframe). Esc fecha; trocar de thread fecha; o painel direito volta como estava. Em < 768 px o chat vira folha inferior e "Choose X" abre a folha em meia altura.
10. Convidado: compartilhar a thread; variações visíveis, sem "Choose"; o mesmo visualizador abre pelo botão "Open X" e pelas setas, sem "Choose X".

## Dicas

- `preview_snapshot` é enorme; prefira `preview_evaluate` com `innerText` e `getBoundingClientRect`.
- Cliques via `preview_act` expiram com a aba oculta; use `element.click()` no `preview_evaluate`.
- Lado a lado exige `variantes × 200 px` de largura (`MIN_CELL_WIDTH`); abaixo disso vira faixa com rolagem e botões A/B/C.
- Os controles do topo com o painel maximizado vêm de `WorkspaceTitlebarControls`, não do `layoutControls` do painel.

## Limites

- Mobile não tem o visualizador ao vivo (só os chips rolando com 5+ opções).
- Antigravity/ACP (recuperação só reconstrói `html_render`) não coberto.
