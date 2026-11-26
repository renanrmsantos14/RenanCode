---
name: verificar-design-modo
description: "Verifica o modo Design do composer: interactionMode 'design' salvo na thread, botão Design no rodapé do composer (web/desktop e mobile), instrução T3_CODE_DESIGN_MODE_INSTRUCTIONS em cada turno, ícone na lista de threads e t3_thread_configure com design. Use após mudar providerPolicy.ts (ProviderInteractionMode/nativeInteractionMode), ProviderTurnStartService.ts, RuntimePolicy.ts, thread/tools.ts ou handlers.ts, ComposerFooterControls.tsx, CompactComposerControlsMenu.tsx, useComposerSend.ts, SidebarThreadRow.tsx, ThreadComposer.tsx (mobile) ou thread-outbox-model.ts."
---

# Verificar o modo Design do composer

## Cobre

- Contrato: `ProviderInteractionMode` aceita `design`; adapters só recebem `ProviderNativeInteractionMode` (`nativeInteractionMode` em `RuntimePolicy.ts`), então Design roda no modo padrão do provider.
- Servidor: turno comum com a thread em `design` ganha `T3_CODE_DESIGN_MODE_INSTRUCTIONS` no fim do texto; comando de provider e `/goal` não ganham.
- MCP: `t3_thread_configure` com `design: true/false` despacha `thread.interaction-mode.set` (`design`/`default`) e exige escopo de escrita.
- Web/desktop: botão Design no rodapé (item marcável no menu compacto); ligar abre o painel Design, desligar não fecha; enviar mantém o modo; thread nova começa desligada; ícone na linha da sidebar.
- Mobile: botão Design ao lado do modelo (fora do rascunho), envio mantém `design` para todo provider, ícone na linha da lista.

## Roteiro

1. Servidor: `cd apps/server && vp test run src/orchestration-v2/ProviderTurnStartService.test.ts src/mcp/toolkits/core.test.ts src/orchestration-v2/RuntimePolicy.test.ts src/mcp/delegatedTaskModes.test.ts src/mcp/threadAccess.test.ts`.
2. Mobile: `vp test run apps/mobile/src/state/thread-outbox.test.ts`.
3. Web: testes de `apps/web/src/components/chat` tocados (`useComposerResume`, `useThreadLifecycle`) e typecheck.
4. Evals (precisa `ANTHROPIC_API_KEY` no `.env` da raiz): `cd evals && pnpm mcp-tool-use --case guard-design-mode-turn-sketches,guard-design-mode-configure --samples 1 --out runs/check`.
5. Passada real (`test-t3-app`, provider `Replay (dev)`): ligar Design no composer, conferir painel aberto e ícone na sidebar, enviar e ver que segue ligado, desligar e ver o painel ficar.

## Armadilhas

- Não passe `thread.interactionMode` direto para a política do adapter: use `nativeInteractionMode`, senão o typecheck acusa (ReplayHarness e AgentSessionImporter já caíram nisso).
- O composer web zerava o modo no envio e o mobile fixava `DEFAULT_PROVIDER_INTERACTION_MODE`; qualquer novo ponto de envio precisa preservar `design`.
- Checagens de acesso pleno (`threadAccess.ts`, `TaskFolders.ts`) comparam com `!== "plan"`: comparar com `=== "default"` nega acesso pleno às threads em Design.
- Design não se propaga: thread nova (`useHandleNewThread`) e filho delegado com `inherit` (`delegatedTaskModes.ts`) começam em `default`; mensagem na fila do mobile não sincroniza o modo quando um dos lados é `design`.
- Providers sem o botão Build/Plan (`showInteractionModeToggle: false`) não podem rebaixar `design` para `default`.
