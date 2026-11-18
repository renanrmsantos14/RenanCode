---
name: verificar-antigravity
description: "Verifica o adapter do Antigravity (agy): turno de continuação para comando em segundo plano, instruções do prompt de sessão (espera e mensagens de progresso), ferramentas MCP do T3 reconhecidas, imagem lida virando print e falha clara quando o agy é parado. Use após mudar apps/server/src/orchestration-v2/Adapters/AntigravityAdapterV2.ts, apps/server/src/provider/ProviderInstanceRegistry.ts, ProviderTurnLeases.ts, packages/provider-acp/src/server/adapter.ts ou runtimeModel.ts."
---

# Verificar Antigravity

## Cobre

- `enablePostSettleContinuation: true` no flavor: `tool_call_update` e `agent_message_chunk` que chegam depois do `end_turn` abrem um turno de continuação (`continuationRequests.offer`) em vez de se perderem.
- `sessionSystemPromptAppend`:
  - `ANTIGRAVITY_COMMAND_WAIT_INSTRUCTIONS` orienta o uso de `WaitMsBeforeAsync` e proíbe `t3_background_wait`, que é só de Claude/OpenCode.
  - `ANTIGRAVITY_PROGRESS_INSTRUCTIONS` pede uma frase antes da 1ª ferramenta e atualizações curtas durante o trabalho. Sem ela, o Gemini roda dezenas de ferramentas calado.
- `T3_MCP_TITLE_CALL` em `runtimeModel.ts` reconhece o título `Run mcp_t3-code_<tool>` do agy como ferramenta do T3.
- Leitura ACP (`kind: "read"`) de imagem do workspace preenche `viewedImagePath`, e o web mostra o print.
- Salvar as configurações da instância (inclusive `environment`) não derruba turno em andamento: a instância antiga segue viva até o último turno dela acabar (`ProviderTurnLeases`), e só turnos novos usam a config nova. Sessões ociosas da instância antiga fecham na hora; as com turno fecham quando ele acaba, então a sessão seguinte já abre na config nova. Remover a instância continua parando tudo na hora.
- Prompt interrompido sem Stop do usuário, por exemplo na remoção da instância, termina com a mensagem "<harness> was stopped before it finished this turn…" em vez de "Provider turn failed.".

## Roteiro

1. Testes, a partir de `apps/server` com Node 26:
   - `vp test run src/orchestration-v2/Adapters/AntigravityAdapterV2.test.ts`
   - `vp test run src/orchestration-v2/Adapters/AcpAdapterV2.test.ts`, com os casos "explains a prompt interrupted by T3 stopping the agent process" e a fidelidade, que inclui `shots/home.png`.
   - `vp test run src/provider/ProviderInstanceRegistry.test.ts`, bloco "turns in flight": config salva com turno rodando, instância ociosa, remoção, duas edições seguidas, segredo trocado, Stop da sessão, `startTurn` que falha e fechamento das sessões da instância antiga.
   - De `packages/provider-acp`: `vp test run src/server/runtimeModel.test.ts`
2. `vp run check:changed`.
3. Eval de progresso. Custa cota da conta Google; rode só se mudar o texto do prompt.
   - Fale `agy acp` direto: `initialize`, depois `session/new` com `_meta.antigravity.systemPrompt.append` montado a partir do texto da fonte, `session/set_model gemini-4-argon-medium`, e `session/prompt`. Aprove os `session/request_permission`.
   - Use um projeto de teste com bug de várias etapas. Conte os segmentos de `agent_message_chunk` antes da última `tool_call`.
   - Referência de 18/11/2026: com o texto antigo, 0 atualizações em 3 de 3 amostras; com o novo, 4 a 5 atualizações em 3 de 3. No controle (pergunta de 1 ferramenta), no máximo 2 textos.
4. App real. Custa cota; use só se a mudança depender do agy real.
   - Pedir "rode `sleep 20 && echo pronto` e me diga o resultado". Esperado: o turno termina e, cerca de 20 s depois, um turno novo mostra a saída e a resposta, sem mensagem do usuário.
   - Pedir uma tarefa de várias etapas. Esperado: mensagens curtas de progresso entre as ferramentas.

## Limites

- Sem `extractBackgroundTaskId` para o agy: a linha do `run_command` aparece "completed" sem saída no fim do 1º turno; o resultado real chega no turno de continuação.
- As instruções de sessão só chegam quando o agy aceita `_meta.antigravity.systemPrompt.append`.
- `git push` parado em "Username for github.com" não é problema do adapter. O `DBUS_SESSION_BUS_ADDRESS` falso da instância impede o `gh` de ler o chaveiro. A correção é pôr `GH_TOKEN` (Sensitive) no `environment` da instância.
- Mudar as configurações de uma instância (inclusive `environment`) não interrompe tarefa em andamento, mas a config nova só vale para turnos novos. Para aplicar já, use o Stop. Turno de continuação ou comando em segundo plano que só começa depois do `turn.terminal` não segura a instância antiga: ela fecha e leva o processo junto.
- Sem limite de tempo: um turno que nunca termina mantém a instância antiga viva até o Stop.
