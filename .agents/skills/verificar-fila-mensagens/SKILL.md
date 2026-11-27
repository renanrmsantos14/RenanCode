---
name: verificar-fila-mensagens
description: "Verifica a fila de mensagens e a reordenação (arrastar, subir/descer, teclado) no web e no mobile. Use após mudar QueuedRunsControl.tsx, ThreadQueueControl.tsx, moveQueuedRun (threadWorkflows.ts) ou o comando reorderQueuedRun."
---

# Verificar fila de mensagens

## Cobre

- Web: alça de arrastar (dnd-kit, também por teclado) e setas aparecem no hover (sempre visíveis em toque), antes do "Send now"; ordem otimista até o comando terminar, depois vale a do servidor.
- A mensagem em edição não se move, mas outras passam por ela. Fila recolhida (4+) abre ao mover uma linha para baixo da dobra.
- Mobile: "Move up"/"Move down" no menu da mensagem; falha mostra alerta.

## Testes rápidos

- `vp test run packages/client-runtime/src/state/threadWorkflows.test.ts`
- Em `apps/web`: `vp test run --project browser src/components/chat/QueuedRunsControl.browser.test.tsx`

## No app (web)

1. `vp run dev`; thread com `devReplay`/`bench-stream` (fica minutos rodando).
2. O padrão de envio é "steer": ligue "queue" em Configurações (follow-up) e envie 3 mensagens.
3. Passe o mouse, suba a 3ª pela seta, arraste a 1ª para o fim, faça Espaço, seta, Espaço na alça.
4. Recarregue: a ordem persiste; console sem erros.

## Não coberto

- Menu do mobile só em aparelho ou emulador.
