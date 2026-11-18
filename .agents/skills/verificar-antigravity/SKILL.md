---
name: verificar-antigravity
description: "Verifica o adapter do Antigravity (agy): comando que passa do WaitMsBeforeAsync vira tarefa em segundo plano e acorda a thread num turno de continuação, e a instrução de espera no prompt de sessão. Use após mudar apps/server/src/orchestration-v2/Adapters/AntigravityAdapterV2.ts ou o enablePostSettleContinuation de packages/provider-acp."
---

# Verificar Antigravity

## Cobre

- `enablePostSettleContinuation: true` no flavor: `tool_call_update` e `agent_message_chunk` que chegam depois do `end_turn` abrem um turno de continuação (`continuationRequests.offer`) em vez de se perderem.
- `ANTIGRAVITY_COMMAND_WAIT_INSTRUCTIONS` em `sessionSystemPromptAppend`: orienta o modelo a usar `WaitMsBeforeAsync` e a não chamar `t3_background_wait` (só Claude/OpenCode).

## Roteiro

1. Testes: `vp test run apps/server/src/orchestration-v2/Adapters/AntigravityAdapterV2.test.ts` (caso "offers a continuation when a command outlives the turn and wakes the agent").
2. `vp run check:changed`.
3. App real (custa cota da conta Google; use só se a mudança depender do agy real):
   - Thread numa instância Antigravity, pedir: "rode `sleep 20 && echo pronto` e me diga o resultado".
   - Esperado: o turno termina, e ~20 s depois um turno novo mostra a saída e a resposta do modelo, sem mensagem do usuário.

## Limites

- Sem `extractBackgroundTaskId` para o agy: a linha do `run_command` aparece "completed" sem saída no fim do 1º turno; o resultado real chega no turno de continuação.
- A instrução de espera só chega quando o agy aceita `_meta.antigravity.systemPrompt.append`.
- `git push` parado em "Username for github.com" não é do adapter: o `DBUS_SESSION_BUS_ADDRESS` falso da instância impede o `gh` de ler o chaveiro. Use `GH_TOKEN` (Sensitive) no `environment` da instância.
