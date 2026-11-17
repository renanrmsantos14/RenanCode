---
name: verificar-sugestao-tab
description: "Verifica a sugestão de próxima mensagem no composer (Tab preenche), gerada no servidor ao fim do turno. Use após mudar NextActionSuggestionService, wantsNextActionSuggestion, nextActionSuggestion em client-runtime, useNextActionSuggestion (web/mobile), composerCommandKey ou nextActionSuggestionsEnabled."
---

# Verificar sugestão do Tab

## Cobre

- Servidor: `NextActionSuggestionService`, elegibilidade em `CheckpointCaptureService`, projeção do run.
- Cliente: `resolveNextActionDisplay`, `useNextActionSuggestion` (web e mobile), `composerCommandKey`, toggle em Settings > Chat.

## Roteiro

1. Testes: `vp test run packages/client-runtime/src/state/nextActionSuggestion.test.ts apps/web/src/components/chat/composerCommandKey.test.ts apps/server/src/orchestration-v2/NextActionSuggestionService.test.ts`.
2. App real: `vp run dev --no-seed`. Em `.t3/userdata/settings.json`: `nextActionSuggestionsEnabled: true` e `textGenerationModelSelection` com Haiku.
3. `window.t3dev.replay("todo-list")` via `preview_evaluate`. Acompanhar `aria-placeholder` de `[data-testid="composer-editor"]`: padrão, depois `Sugerindo…`, depois o texto com `<kbd>Tab</kbd>` (ou padrão, se o run gravou `none`).
4. Conferir no banco do worktree: `orchestration_v2_projection_runs`, `json_extract(payload_json,'$.nextActionSuggestion')`.
5. Tab: preenche sem enviar. Digitar esconde, apagar traz de volta, Esc descarta até recarregar.
6. Voltar à thread (recarregar): a sugestão continua lá.
7. Thread criada pela CLI (`mcp:`) não gera sugestão.

## Dicas

- A sugestão só existe no detalhe da thread. O `latestRun` do shell não a carrega: leia de `deriveLatestThreadRun(structure.projection)`.
- Com a aba oculta, `click` de `preview_act` expira e `press` não apaga texto. Para limpar: `execCommand('selectAll')` e `execCommand('delete')`. Para Esc: `dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true, cancelable:true}))`. Toggle: `element.click()` no switch "Suggest next message".
- O rascunho sobrevive ao recarregamento; limpe antes de testar o placeholder.

## Limites

- Mobile precisa de `test-t3-mobile`; sem cliente nativo, fica sem verificação em tela.
