---
name: verificar-plano-tarefa
description: "Verifica o plano da tarefa: a tool update_plan do MCP t3-code (items, advance, done/start), a projeção em todo_list pelo ClaudeAdapterV2 e a faixa ComposerTaskPlan presa acima do composer. Use após mudar packages/shared/src/taskPlan.ts, toolkits/message (update_plan), emitClaudePlanProjection, session-logic.ts (task-plan, deriveComposerTaskPlan), ChatComposer.tsx (taskPlan) ou ComposerTaskPlan.tsx."
---

# Verificar o plano da tarefa

## Cobre

- `applyTaskPlanUpdate`: três formas exclusivas, 1 a 12 etapas, no máximo uma `in_progress`; `advance` nunca volta a uma pendente anterior.
- O handler guarda o último plano por thread em memória; após reiniciar o servidor o modelo reenvia `items`.
- Só o Claude projeta o `todo_list` (`t3-plan:<providerTurnId>`, um por turno). Nos outros providers a chamada continua como linha de tool.
- Web: a timeline ignora todo `todo_list` e `deriveComposerTaskPlan` o prende acima do composer enquanto nenhum run mais novo começar sem plano. As chamadas `update_plan` somem só quando o run tem `todo_list`. Mobile e a visualização somente leitura (convidado) não mostram o plano; mobile mostra a chamada como "Updated the plan".
- Nada conclui etapas sozinho no fim do turno.

## Testes rápidos

- `packages/shared`: `vp test run src/taskPlan.test.ts`.
- `apps/server`: `vp test run src/mcp/toolkits/core.test.ts src/orchestration-v2/Adapters/ClaudeAdapterV2.test.ts src/provider/AgentContextBudget.test.ts`.
- `apps/web`: `vp test run src/session-logic.test.ts src/components/chat/MessagesTimeline.logic.test.ts src/components/chat/ComposerTaskPlan.browser.test.tsx`.

## Roteiro manual (web, dev, Claude Haiku)

1. `vp run dev`, nova thread com Claude (Haiku), pedir uma tarefa de 3+ etapas que edite arquivos.
2. Esperado: faixa colada no topo do composer com a etapa atual, `X/N` e um segmento por etapa; clique (ou Enter) expande a lista: concluídas com check, em andamento com spinner, pendentes com círculo tracejado.
3. A chamada `update_plan` não aparece na lista de tools do turno.
4. Recarregar a página e reabrir a thread: a faixa continua.
5. Turno terminado com etapa ainda `in_progress`: o ícone vira círculo com ponto, sem girar.
6. Tudo concluído: "Plano concluído" com `N/N`. Mandar nova mensagem (turno sem `update_plan`): a faixa some.
7. Com `prefers-reduced-motion: reduce`, o spinner fica parado.
8. Leitor de tela: botão com a etapa atual e `aria-expanded`; lista "Plano da tarefa" e cada linha "Etapa X de N: <texto>, <estado>".

## Casos de borda

- Provider sem projeção (Codex, Grok...): a chamada aparece como tool normal.
- `advance` com todas concluídas devolve erro ao modelo; nada muda na UI.
