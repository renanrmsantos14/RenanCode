---
name: verificar-mobile-fluidez
description: "Verifica a fluidez do app mobile no Android: esqueleto ao abrir thread, 'Retry now' em thread sem cache, retry pelo status de conexão da Home, ripple nas linhas, háptico no envio e loaders de Settings. Use após mudar apps/mobile/src/features/threads/{ThreadFeed,ThreadFeedSkeleton,threadContentPresentation,ThreadComposer,ThreadRouteScreen}*, apps/mobile/src/components/ui/{RowPressable,ListRow,ListActionRow,ListChoiceRow}*, apps/mobile/src/features/home/WorkspaceConnectionTitle* ou telas de apps/mobile/src/features/settings."
---

# Verificar fluidez do app mobile

## Cobre

- Código: `apps/mobile/src/features/threads/ThreadFeed.tsx` (assentamento, `ThreadFeedSkeleton`, placeholder com ação), `threadContentPresentation.ts`, `ThreadComposer.tsx` (háptico, retomar fila), `ThreadRouteScreen.tsx` (`connectionStalled`, Git status adiado), `components/ui/RowPressable.tsx`, `features/home/WorkspaceConnectionTitle.tsx`, telas de `features/settings`.
- Telas: Home (lista de threads), thread, Settings.

## Preparar ambiente

- Checks: Node 26 no PATH (`export PATH=$HOME/.nvm/versions/node/v26.12.1/bin:$PWD/node_modules/.bin:$PATH`), da raiz do repo.
- Aparelho: seguir `test-t3-mobile` (`vp run mobile:install android`, depois Metro). Precisa de `adb` e de um aparelho ou emulador; sem isso, só a parte automática roda.

## Roteiro automático

1. `vp run check:changed` → todas as linhas `pass`, inclusive `react compiler` (o compilador não aceita `try/finally`; use `.finally`).
2. `vp test run apps/mobile/src/features/threads/threadContentPresentation.test.ts` → `reconnecting` dá `loading`; `reconnecting` com `connectionStalled` dá `unavailable` com `reconnectable`.

## Roteiro em aparelho (ainda não executado; promover quando rodar)

1. Home → tocar numa thread longa: aparece o esqueleto (blocos cinza, sem pulsar) e ele some em fade com a conversa já no fim, sem tela em branco e sem salto de rolagem.
2. Thread nova e vazia → enviar a primeira mensagem: o esqueleto não aparece por cima; o aparelho vibra de leve no envio.
3. Trocar de thread em menos de 1 s (tablet em tela dividida): a segunda thread não volta a ficar coberta.
4. Modo avião com thread sem cache aberta: após ~5 s de reconexão sem sucesso aparece "Messages not cached" com "Retry now"; ao religar a rede e tocar, a conversa carrega.
5. Home com "Reconnecting…" no título: tocar tenta reconectar na hora os ambientes que falharam e abre a lista de ambientes; uma primeira conexão em andamento não é reiniciada.
6. Linhas (lista de threads, Settings, command palette): ripple ao tocar, sem piscar ao rolar a lista; swipe das linhas da Home segue funcionando.
7. Settings → Scheduled tasks sem dados: indicador de atividade com "Loading tasks…"; voz na nuvem: linha com indicador enquanto os modelos carregam.
8. Com "Remover animações" ligado no Android: o esqueleto some sem fade.
9. iOS: nenhuma mudança de aparência nas linhas; esqueleto e "Retry now" iguais ao Android.

## Evidência obrigatória

- Saída do `vp run check:changed` e do teste focado.
- Em aparelho: gravação curta de abrir e sair de uma thread, e prints dos passos 4 e 7.

## Limites

- Nada de animação em loop: o esqueleto é estático por regra do projeto (`docs/internals/performance-regressions.md`, "Mobile looping animations").
- Em 22/11/2026 o roteiro em aparelho não rodou: o desktop não tem `adb` nem aparelho pareado.
