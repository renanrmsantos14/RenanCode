---
name: verificar-claude-cloud-link
description: 'Verifica o controle "Claude cloud" de threads de nuvem no popup de detalhes e no strip do composer (web/desktop), que abre a sessão no navegador. Use após mudar claudeCloudSessionUrl em orchestrationV2.ts, ClaudeCloudSessionLink em BranchToolbar.tsx, shouldShowEnvironmentIndicator em BranchToolbar.logic.ts ou CLAUDE_CLOUD_LABEL.'
---

# Verificar link da sessão Claude cloud

## Cobre

- `claudeCloudSessionUrl` (packages/contracts/src/orchestrationV2.ts): `claude-cloud:<id>` vira `https://claude.ai/code/<id>`, com `cse_` convertido em `session_`; thread local devolve `null`.
- `ClaudeCloudSessionLink` (BranchToolbar.tsx): no lugar do seletor de ambiente, mostra "Claude cloud" e abre a URL por `useOpenLink`. No strip precisa de `data-composer-context-control`; falha vira toast "Unable to open Claude cloud session".
- `shouldShowEnvironmentIndicator` (BranchToolbar.logic.ts): thread cloud sempre mostra o indicador, mesmo sem ambiente selecionável.
- Branch, "Open in VS Code" e "Actions" continuam como em qualquer thread.

## Roteiro

1. Testes: `node_modules/.bin/vp test run packages/contracts/src/orchestrationV2.test.ts apps/web/src/components/BranchToolbar.logic.test.ts`.
2. Tipos: `cd apps/web && ../../node_modules/.bin/effect-tsgo tsrs --noEmit` e o mesmo em `packages/contracts`.
3. App real com sessão cloud (precisa de conta Claude logada): abra uma thread de nuvem; popup de detalhes e composer mostram "Claude cloud", sem nome de dispositivo; o clique abre `https://claude.ai/code/session_…` no navegador do sistema.
4. Sem sessão cloud: harness temporário em `apps/web` (`cap.html`, `src/cap.tsx`) que renderiza o componente exportado de forma temporária, com `threadRef` fictício, em `vp dev --port 36473 --strictPort`. Com `playwright-core`, substitua `window.open` em `addInitScript`, clique nas duas variantes e confira a URL recebida. Reverta o export e apague o harness.

## Limites

- O passo 4 prova rótulo e clique, não a sessão real nem a conta aberta em claude.ai.
- Mobile não trata threads cloud.
