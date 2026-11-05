---
name: verificar-sidebar-subsessoes
description: "Verifica as subsessões aninhadas sob a thread pai na barra lateral (web/desktop) e na lista de threads do mobile. Use após mudar nestSidebarSubsessions em Sidebar.logic.ts, sidebar/useSidebarNativeSubagents.ts, state/nativeSubagents.ts do client-runtime, sidebar/SubsessionToggle.tsx, SidebarThreadRow.tsx, renderThreadRow em Sidebar.tsx state/subsessions.ts do client-runtime, ou no mobile threadListSubsessions.ts, threadListV2.ts, thread-list-v2-items.tsx (ThreadListV2SubsessionFrame) e use-thread-list-v2-shelf-preferences.ts."
---

# Verificar subsessões na barra lateral

## Cobre

- `nestSidebarSubsessions` (Sidebar.logic.ts): thread com `subsessionParentRef` apontando para um pai visível no mesmo projeto vira linha aninhada, mais antigas primeiro, recursivo. Pai arquivado, de outro projeto ou ausente deixa a filha no topo. Filha de `delegate_task` fica oculta no topo só enquanto o pai aparece. Subagentes nativos (`creationSource: "provider"`) aparecem só sob a thread aberta (ou a mãe do subagente aberto), aninhados pelos registros `subagents` dela (`nativeSubagentRows` no client-runtime, `useSidebarNativeSubagents` na web), com ícone de robô e o status do registro; a família da thread é montada para trazer as filhas paradas.
- `SubsessionToggle`: chevron no pai, só quando há subsessões; `aria-expanded`, rótulos "Collapse subsessions" / "Expand subsessions"; recolhido mostra contagem e ponto de status (trabalhando/atenção/falha).
- Estado recolhido persistido em `projectExpandedById` com a chave `subsessions:<threadKey>` (padrão: aberto). Recuo máximo de 3 níveis, com linha-guia à esquerda.
- Paginação, arrastar, seleção múltipla e navegação por teclado contam só as linhas de topo mais as subsessões abertas.
- Mobile (`apps/mobile/src/features/threads/`): `nestThreadListSubsessions` aninha só no mesmo ambiente e projeto, com raiz listada (ciclos ficam planos). `buildThreadListV2Items` lista filhas logo após o pai, na prateleira do pai, com `depth` (máx. 3) e `subsessions` (contagem, recolhido, pior status oculto). Filha subagent de `delegate_task` só aparece sob pai listado. Busca lista os resultados planos. Pai recolhido mostra "N subsessions" e o status (aprovação, falha, trabalhando) no botão sob a linha; `accessibilityRole="button"`, `accessibilityState.expanded`, rótulos iguais aos da web. Estado recolhido persistido em `threadListCollapsedSubsessions` (preferências do mobile, chave `environmentId:threadId`).

## Roteiro

1. Testes: `node_modules/.bin/vp test run apps/web/src/components/Sidebar.logic.test.ts packages/client-runtime/src/state/subsessions.test.ts packages/client-runtime/src/state/nativeSubagents.test.ts apps/mobile/src/features/threads/threadListV2.test.ts`.
2. Tipos: `cd apps/web && ../../node_modules/.bin/vp run typecheck` e `cd apps/mobile && ../../node_modules/.bin/vp run typecheck`.
3. App real: `vp run dev` em segundo plano; abra uma thread que lançou outras (use `vp run migrate-dev-db` se o banco estiver vazio).
4. Conferir: filhas recuadas sob o pai, com linha-guia; chevron recolhe e expande; recarregar a página mantém o estado; filha não aparece também no topo; ponto de status no pai recolhido.

## Limites

- Mobile: só lógica pura testada (sem teste de renderização RN); o recuo, a linha-guia e o botão precisam de conferência manual no app com simulador.
- Sem teste de navegador para o chevron: o recolhimento é um alternador de estado persistido, coberto pela lógica e pelo roteiro manual.
