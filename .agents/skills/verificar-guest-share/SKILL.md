---
name: verificar-guest-share
description: "Verifica links de convidado (Share with guest): criar link com ou sem aprovação, mensagem do convidado esperando Send/Dismiss ou indo direto ao agente, status do link na web e no mobile. Use após mudar apps/server/src/guest/**, apps/server/src/orchestration-v2/GuestShareDecider.ts, packages/contracts/src/guestShare.ts, apps/web/src/components/chat/GuestShareControls.tsx, apps/web/src/components/guest/** apps/mobile/src/features/threads/ThreadGuestShareBar.tsx ou ThreadGuestShareSheet.tsx."
---

# Verificar links de convidado

## Cobre

- Servidor: `GuestShareService` (create, submit, auto-send), `GuestShareDecider` (open, envio e texto que o agente recebe).
- Contrato: `ThreadGuestShare.autoSend` e `GuestShareCreateInput.autoSend` (opcionais; shares antigos não têm o campo e exigem aprovação).
- Regra de produto: **Require my approval** vem ligado e só se escolhe ao criar o link. Desligado, cada mensagem do convidado vai pelo mesmo `ThreadManagementService.dispatch` do botão Send; se o envio falhar, ela fica esperando o dono.

## Testes rápidos

- Em `apps/server`: `vp test run src/guest/GuestShareService.test.ts`. O caso "sends a guest's message without the owner when the link does not need approval" cobre o auto-send.
- Imagens do host: o caso "serves an image on the host only when an agent reply the guest sees shows it" cobre resposta comum, `send_to_user` concluído (libera) e `send_to_user` com falha (não libera). Manual: com o link aberto, peça ao agente um `send_to_user` com `![x](/caminho/absoluto.png)`; o convidado deve ver a imagem, não "Image unavailable".

## Roteiro manual (web, dev)

1. `vp run dev` na worktree; ligar Settings > Labs > Guest links (`guestSharingEnabled: true` no `.t3/userdata/settings.json` da worktree). Precisa de T3 Connect para o link funcionar de fora.
2. Numa thread, menu da thread > **Share with guest**. Esperado: diálogo com o switch **Require my approval** ligado e o texto "Each message the guest sends waits for you to send or dismiss it.".
3. Desligar o switch. Esperado: texto "The guest's messages go straight to the agent.". Criar o link.
4. Status acima do composer: "Guest link active · sends directly" (web e mobile). Com aprovação ligada, sem o sufixo.
5. Com o link aberto num navegador sem sessão, enviar uma mensagem. Com aprovação: aparece pendente com Send/Dismiss. Sem aprovação: vira mensagem de usuário com o nome do convidado e o agente recebe "not reviewed by the owner".

## Roteiro manual (mobile)

Mesmo servidor do roteiro web, com Guest links ligado. A opção só aparece com a permissão `createGuestShare`, Guest links ligado e Connect liberado pela política (`useCanShareWithGuest`, mesma regra da web). Não aparece em rascunho.

1. Abrir a folha **Share with guest** de três jeitos: toque longo na thread da lista, thread aberta > menu do header (Android: overflow; iOS: botão na toolbar), ou command palette.
2. Esperado: chave **Require my approval** ligada por padrão, com o texto mudando ao desligar.
3. Criar o link. Esperado: o link aparece com **Copy** e **Share** (iOS como `url`, Android como `message`), e o status acima do composer segue o passo 4 da web.

## Casos de borda

- Provider desabilitado com auto-send: o envio falha, a mensagem fica pendente e o servidor registra "Guest message auto-send failed".
- Link expirado: o mobile mostra "Guest link expired" sem o sufixo "sends directly".
- Fechar o compartilhar do sistema sem enviar mantém o link na folha, com **Copy** (o link só aparece uma vez).
- Não há como alternar o modo num link ativo: pare de compartilhar e crie outro.
