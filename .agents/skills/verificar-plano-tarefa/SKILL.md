---
name: verificar-plano-tarefa
description: "Verifica o plano da tarefa: a tool update_plan do MCP t3-code (items, advance, done/start), a projeção em todo_list pelo ClaudeAdapterV2 e o TaskPlanCard abaixo da última mensagem do turno. Use após mudar packages/shared/src/taskPlan.ts, toolkits/message (update_plan), emitClaudePlanProjection, session-logic.ts (task-plan), MessagesTimeline.logic.ts ou TaskPlanCard.tsx."
---

# Verificar o plano da tarefa

## Cobre

- `applyTaskPlanUpdate`: três formas exclusivas, 1 a 12 etapas, no máximo uma `in_progress`; `advance` nunca volta a uma pendente anterior.
- O handler guarda o último plano por thread em memória; após reiniciar o servidor o modelo reenvia `items`.
- Só o Claude projeta o `todo_list` (`t3-plan:<providerTurnId>`, um por turno). Nos outros providers a chamada continua como linha de tool.
- Web: o plano do turno vira uma entrada `task-plan` depois da última entrada do mesmo run; as chamadas `update_plan` somem só quando o run tem `todo_list`. Mobile mostra a chamada como "Updated the plan", sem card.
- Nada conclui etapas sozinho no fim do turno.

## Testes rápidos

- `packages/shared`: `vp test run src/taskPlan.test.ts`.
- `apps/server`: `vp test run src/mcp/toolkits/core.test.ts src/orchestration-v2/Adapters/ClaudeAdapterV2.test.ts src/provider/AgentContextBudget.test.ts`.
- `apps/web`: `vp test run src/session-logic.test.ts src/components/chat/MessagesTimeline.logic.test.ts src/components/chat/TaskPlanCard.browser.test.tsx`.

## Roteiro manual (web, dev, Claude Haiku)

1. `vp run dev`, nova thread com Claude (Haiku), pedir uma tarefa de 3+ etapas que edite arquivos.
2. Esperado: card com borda abaixo da última mensagem do assistente; etapa em andamento com spinner e texto em destaque; concluídas com check e riscado; pendentes com círculo tracejado.
3. A chamada `update_plan` não aparece na lista de tools do turno.
4. Recarregar a página e reabrir a thread: o último plano continua no mesmo lugar.
5. Turno seguinte: o card do turno anterior fica no turno anterior; o novo aparece no fim.
6. Com `prefers-reduced-motion: reduce`, o spinner fica parado.
7. Leitor de tela: lista "Plano da tarefa" e cada linha "Etapa X de N: <texto>, <estado>".

## Casos de borda

- Provider sem projeção (Codex, Grok...): a chamada aparece como tool normal.
- `advance` com todas concluídas devolve erro ao modelo; nada muda na UI.
