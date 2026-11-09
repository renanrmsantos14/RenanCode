---
name: verificar-quadro-trabalho
description: "Verifica as ferramentas MCP do quadro de Trabalho (t3_work_module_read e t3_work_module_suggest): criar módulo, sugerir vínculo, nota, mudar status só com aprovação do usuário e acesso a ambientes vinculados por environmentId. Use após mudar apps/server/src/mcp/toolkits/workModules/**, apps/server/src/workModules/**, packages/contracts/src/workModule.ts ou evals/mcp-tool-use/cases/work-modules.ndjson."
---

# Verificar quadro de Trabalho (MCP)

## Cobre

- Código: `apps/server/src/mcp/toolkits/workModules/` (tools, handlers, format), `apps/server/src/workModules/WorkModuleService.ts`, `packages/contracts/src/workModule.ts`, rótulos em `packages/shared/src/t3McpToolPresentation.ts` e `packages/client-runtime/src/t3ToolSummary.ts`.
- Regra de produto: o agente sugere mudança de status e só chama a ação `status` depois que o usuário aprova aquela mudança. Cada ambiente tem o próprio quadro; `environmentId` leva a chamada a um ambiente vinculado.

## Testes rápidos

- Em `apps/server`: `vp test run src/mcp/toolkits/workModules src/workModules src/provider/AgentContextBudget.test.ts`.
- Se o texto ou o schema das ferramentas mudar, o `AgentContextBudget.test.ts` falha com o valor medido: atualize `apps/server/src/provider/agentContextBudget.json` e rode os evals abaixo.

## Evals (pagos, precisam de `ANTHROPIC_API_KEY` no `.env` da raiz)

- Em `evals/`: `pnpm mcp-tool-use --out runs/<nome> --case work-module-status-asks-first,work-module-status-on-approval,work-module-read-for-context,work-module-linked-environment`.
- Esperado: 100% nos 4 casos. `status-asks-first` garante que o agente não muda status sozinho; `status-on-approval` que ele muda quando o usuário pede; `linked-environment` que ele passa `environmentId`.
- Custo estimado: menos de US$ 1 por rodada (Sonnet, 2 amostras por caso).

## Roteiro manual (thread real, opcional)

1. Numa thread, pedir para ler o quadro do projeto (`t3_work_module_read` com `projectId`). Esperado: árvore com status e a linha "Change status only after the user approves it." na leitura de um módulo.
2. Dizer que o trabalho de um módulo terminou, sem pedir mudança. Esperado: o agente propõe o status e pergunta; o quadro não muda.
3. Aprovar. Esperado: chamada `action: "status"` e o card muda de coluna no quadro. `waiting` exige `waitingReason`.
4. Com um ambiente vinculado (`t3_environment_links`), ler o quadro dele com `environmentId` e `projectId`. Sem `projectId`/`moduleId`, a leitura remota falha porque não há thread chamadora lá.

## Casos de borda

- `status` sem `moduleId` ou `status`: erro "status needs moduleId and status.".
- Módulo inexistente: "The module was not found.".
- `waiting` sem motivo e sem motivo anterior: erro do serviço "A waiting module needs a reason.".
- O ambiente de destino precisa rodar a versão com estas ações; versão antiga recusa o parâmetro.
