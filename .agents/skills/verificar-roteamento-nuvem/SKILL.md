---
name: verificar-roteamento-nuvem
description: 'Verifica o roteamento automático de tarefas para Claude cloud: classificação com Haiku, regras que mantêm a tarefa na máquina e o seletor "Run on" em Auto. Use após mudar buildTaskPlacementPrompt, localOnlyReason em ClaudeCloudSessions.ts, taskRouting.ts, useTaskCloudPlacement.ts, useDraftEnvironmentRouting.ts ou evals/task-placement.'
---

# Verificar roteamento para Claude cloud

## Cobre

- `buildTaskPlacementPrompt` (packages/provider-core): só responde `local` quando o texto nomeia uma necessidade real da máquina.
- `localOnlyReason` (ClaudeCloudSessions.ts): raiz suja bloqueia, exceto worktree nova baseada na branch da raiz (`worktreeBaseBranch`).
- `isAutoRoutedDraft` e `draftWorktreeBaseBranch` (taskRouting.ts); `useTaskCloudPlacement`; `useDraftEnvironmentRouting`.
- Seletor "Run on": aparece com uma máquina só, mostra "Auto" (ou "Auto balance" com mais de uma) e "Auto: Claude cloud" quando a tarefa pode ir.

## Preparar ambiente

- `vp run dev` no worktree, com banco semeado. Em Settings > Labs: Claude cloud sessions e roteamento automático ligados, conta Claude logada.
- Porta real: `ss -H -ltnp` com `/proc/<pid>/cwd` no worktree. Token: em `apps/server`, `node src/bin.ts pair --base-dir ../../.t3 --ttl 5m`.
- Navegador: `playwright-core` de `~/.npm/_npx/*/node_modules/playwright-core` com `executablePath` do `chrome-headless-shell` em `~/.cache/ms-playwright`. O painel Browser pode não entregar cliques com a aba oculta.

## Roteiro

1. Testes: `vp test run apps/server/src/claudeCloud/ClaudeCloudSessions.test.ts apps/web/src/components/chat/taskRouting.test.ts`.
2. Eval com custo baixo: `evals/task-placement` (ver README); todos os casos devem bater. Mudou o prompt: rode.
3. Abra `/pair#token=...`, "New thread", Enter no projeto, modelo Haiku. `[aria-label="Run on"]` deve listar `Auto | <máquina> | Claude cloud`.
4. Worktree nova e tarefa só de repositório ("Corrija os erros de digitação em docs/setup.md"): em até 15 s, rótulo "Auto: Claude cloud".
5. Abra o menu nesse estado e escolha a máquina: rótulo vira o nome dela, texto e rascunho continuam.
6. Volte ao Auto: rótulo "Auto" e `environmentSelection: "auto"` em `t3code:composer-drafts:v1`.
7. Tarefa com "Dataverse" e "pnpm push": "Auto: Claude cloud" some.

## Casos de borda

- "Current checkout" com raiz suja: fica "Auto" sem chamar Haiku.
- Volta ao Auto zera a base para `main`; com raiz suja em outra branch a tarefa fica local, de propósito.
- Anexo, referência de thread, Plan mode e vários modelos desligam o roteamento.

## Evidência obrigatória

- Prints de "Run on" aberto, "Auto: Claude cloud" e máquina escolhida; console sem erros além da falha de WebSocket antes de parear e do aviso `[legend-list]`, que já existem.

## Limites

- Não envia a tarefa: o início real da sessão na nuvem consome a conta.
- Mobile não classifica. Raiz limpa em outra branch ainda clona a branch da raiz.
