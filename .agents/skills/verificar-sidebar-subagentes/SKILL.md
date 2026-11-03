---
name: verificar-sidebar-subagentes
description: "Verifica os subagentes aninhados sob a thread pai na barra lateral (web/desktop). Use após mudar groupSidebarSubagents em Sidebar.logic.ts, sidebar/SidebarSubagentList.tsx, SidebarThreadRow.tsx ou a passagem de subagentsByParent em Sidebar.tsx."
---

# Verificar subagentes na barra lateral

## Cobre

- `groupSidebarSubagents` (agrupa por pai; ignora arquivadas e side chat; mais antigas primeiro; tarefas delegadas via `delegatedFrom`).
- `SidebarSubagentList`: recolhível, abre sozinha com subagente rodando ou pendente de aprovação/entrada; clique ativa a thread filha.

## Roteiro

1. Testes: `node_modules/.bin/vp test run apps/web/src/components/Sidebar.logic.test.ts apps/web/src/components/sidebar/SidebarSubagentList.browser.test.tsx`.
2. App real: `vp run dev` em segundo plano, abra uma thread que tenha rodado subagentes (use `vp run migrate-dev-db` se o banco estiver vazio).
3. Conferir: linha "N subagents" sob o pai, só com título; aberta enquanto roda, recolhida depois; clicar no título navega para a thread filha; subagentes não aparecem como threads soltas.

## Limites

- Mobile não coberto (lista ainda não existe lá).
