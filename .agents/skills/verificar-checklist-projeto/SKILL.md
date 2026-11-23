---
name: verificar-checklist-projeto
description: "Verifica a aba Checklist do painel direito: módulos e itens por projeto, checkbox com cascata, prazos, filtros Todos/Mês atual/Intervalo, atrasados em vermelho, edição inline e reordenação. Use após mudar apps/server/src/projectChecklist/**, packages/contracts/src/projectChecklist.ts, packages/client-runtime/src/projectChecklist*.ts ou apps/web/src/components/checklist/**."
---

# Verificar checklist do projeto

## Cobre

- Servidor: `apps/server/src/projectChecklist/ProjectChecklistService.ts` (tabela `project_checklist_items`, migração 112), handlers `projectChecklist.*` em `apps/server/src/ws.ts`, limpeza em `ProjectService.deleteProject`.
- Contrato e lógica pura: `packages/contracts/src/projectChecklist.ts`, `packages/client-runtime/src/projectChecklist.ts` (árvore, filtro, atraso).
- Web: `apps/web/src/components/checklist/ProjectChecklistPanel.tsx`, aba `checklist` em `rightPanelStore.ts`, menu "+", estado vazio do painel e comando "Abrir checklist" na paleta.
- Regras: dois níveis (módulo e item); marcar o módulo marca os itens; desmarcar um item desmarca o módulo; item aberto com prazo anterior a hoje aparece sempre, em vermelho, mesmo fora do filtro; concluído nunca é vermelho; sem otimismo no checkbox.

## Testes rápidos

- `apps/server`: `vp test run src/projectChecklist src/persistence/Migrations/112_ProjectChecklist.test.ts src/auth/RpcAuthorization.test.ts`.
- `packages/client-runtime`: `vp test run src/projectChecklist.test.ts`.
- `apps/web`: `vp test run --project browser src/components/checklist` (marcar item sem marcar localmente; atrasado visível e vermelho em "Mês atual").
- Tipos: `vp run typecheck` em `packages/contracts`, `packages/client-runtime`, `apps/server`, `apps/web`; `vp run i18n:check` na raiz.

## Roteiro manual (app real, ambiente isolado)

1. Abrir uma thread de um projeto, "+" > Checklist (atalho C), ou a paleta > "Abrir checklist". Esperado: estado vazio com "Adicionar módulo".
2. Criar um módulo, adicionar itens com Enter (cada Enter cria o próximo item). Título vazio não salva.
3. Definir prazos: um em outubro (atrasado), um neste mês, um sem prazo. O atrasado aparece em vermelho.
4. Filtros: "Mês atual" mostra o do mês e o atrasado, esconde o sem prazo. "Intervalo" com De/Até numa linha própria, sem cortar nada no card estreito (~278px). Trocar de projeto e voltar mantém o filtro de cada um; recarregar mantém.
5. Marcar o módulo: todos os itens ficam riscados. Desmarcar um item: o módulo desmarca. "Ocultar concluídos" esconde os riscados.
6. Arrastar pela alça (ou teclado) reordena dentro do mesmo módulo e persiste após recarregar. Módulos sobem e descem (o bloco inteiro é o nó arrastável; subir já quebrou). Em filtro ativo, a ordem real é preservada.
7. Excluir módulo com itens pede confirmação; sem itens exclui direto. Excluir o projeto apaga o checklist.
8. Com outro cliente conectado ao mesmo servidor, uma mudança aparece nos dois sem recarregar. Sem permissão de operar, a aba é só leitura.
9. Derrubar o servidor e marcar um item: toast de erro padrão e o checkbox não fica marcado.

## Casos de borda

- Item dentro de item: erro "Items cannot hold other items.".
- Pai de outro projeto: "The module belongs to another project.".
- Prazo no dia de hoje não é atrasado; o dia vira à meia-noite do fuso do aparelho.
- Módulo some do filtro só se nem ele nem os filhos passarem; filho atrasado mantém o módulo visível.
- Servidor sem a versão nova: a aba mostra "Não foi possível carregar o checklist.".
