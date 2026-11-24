---
name: verificar-modo-revisao
description: "Verifica o modo revisão de imagens: clicar numa imagem do chat abre a imagem grande com o chat ao lado (drawer no desktop, folha de baixo no celular), ←/→ navegam pelas imagens da thread e dá para responder sem sair. Use após mudar apps/web/src/components/chat/review/**, ChatMarkdownMedia.tsx (data-review-image), TimelineUserMessageRow.tsx, MessagesTimeline.tsx (revealRow), ThreadTimeline.tsx, ReadOnlyThreadTimeline.tsx, GuestPage.tsx ou chatMarkdownImageSources em packages/shared."
---

# Verificar o modo revisão

## Cobre

- `useReviewMode`: estado por thread (`scope`), galeria congelada no clique no dono, seguindo as entries no convidado; chat escondido lembrado em `t3code:review-chat-hidden`.
- `reviewGallery`: só entram as imagens que o chat mostra (variante do tema atual de `<picture>`, sem chip de arquivo nem fonte bloqueada).
- O chat centraliza a imagem atual pelo atributo `data-review-image`; cada imagem que a galeria conta precisa dele, na mesma ordem.
- O painel direito some durante a revisão sem mudar o store (`rightPanelShown`) e volta ao fechar.

## Testes rápidos

- Em `apps/web`: `vp test run src/components/chat/review/reviewGallery.test.ts src/components/guest/GuestPage.browser.test.tsx`.
- Em `packages/shared`: `vp test run src/markdownPipeline.test.ts`.

## Roteiro manual (web, dev)

1. `vp run dev`, abrir uma thread com várias imagens (resposta do agente, `send_to_user` e imagem enviada pelo usuário).
2. Clicar numa imagem. Esperado: imagem grande à esquerda, contador `n / total`, miniaturas embaixo e o chat inteiro (timeline, pergunta pendente e composer) à direita. O painel direito, se aberto, some.
3. → e ←: a imagem troca e o chat rola até ela. Com o foco no composer, as setas movem o cursor e não trocam a imagem.
4. Botão de esconder o chat: a imagem ocupa tudo. Recarregar e reabrir mantém a escolha.
5. Responder pelo composer sem sair da revisão.
6. Trocar de thread na sidebar: a revisão fecha. Voltar: continua fechada.
7. Esc ou Close: sai, e o painel direito volta como estava. Com a paleta de comandos ou um dialog aberto, Esc fecha só ele.
8. Celular (≤ 768 px): o chat vira folha de baixo com peek, metade e cheia. A alça funciona com toque, arrasto e teclado (Enter).
9. Link de convidado: o mesmo fluxo na página do convidado.

## Casos de borda

- Imagem que entrou durante a revisão no dono: só aparece ao reabrir, porque a galeria é congelada no clique.
- Anexo de usuário já salvo no servidor pode não abrir a revisão e cair no visualizador antigo; fica para outro PR.
