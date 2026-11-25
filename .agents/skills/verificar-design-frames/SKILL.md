---
name: verificar-design-frames
description: "Verifica os Frames do canvas de Design (desktop): criação automática e pelo menu, Frame ao vivo só no foco, print ao perder o foco, seleção de elemento enviada ao composer e remoção. Use após mudar apps/web/src/components/design/*Frame*, useAutoDesignFrame, designFrameStore, commitPickedElement, focusPreviewWebview, openPreviewSession, previewStateStore (marca de Frame), captureSnapshot (desktop preview/Manager e ipc), DesignService (Frames) ou o contrato de design."
---

# Verificar Frames do Design

## Cobre

- Servidor: nó `kind: "frame"` (migração 122), `addFrame` (com `auto: true` idempotente: um Frame automático por thread, mesmo apagado), `updateFrame`, `setFrameSnapshot` (só PNG, apaga o print antigo e o novo se o nó sumiu), `removeNode`.
- Cliente desktop: menu "Adicionar Frame" (barra do Design e paleta `action:add-design-frame`), Frame ao vivo só no foco e com o Frame inteiro à vista, print salvo (`captureSnapshot`, ≤ 900×1600) ao perder o foco, seleção de elemento para o composer (`commitPickedElement`).
- Web, mobile e convidado ignoram nós de Frame (`previewBridge === null`).
- A página do Frame é uma sessão de preview marcada (`markDesignFrameTab`): não vira aba do painel, não fica como aba ativa, não entra no histórico do navegador.

## Roteiro

1. Testes: `vp test run apps/server/src/design` (Frames), `cd apps/web && vp test run src/components/design src/previewStateStore.test.ts src/components/preview` (inclui `DesignFrame.browser.test.tsx`: criação, foco, menu, seleção) e `cd apps/desktop && vp test run src/preview/Manager.test.ts`.
2. Passada real (desktop): `T3CODE_DESKTOP_REMOTE_DEBUGGING_PORT=9333 vp run dev:desktop` com `.t3` da worktree e `playwright-core` `connectOverCDP("http://127.0.0.1:9333")`; stub do `native/browser-secret/build/x64/t3-browser-secret` como no `verificar-design-sketch`. Banco do dev vazio: crie projeto e thread pela CLI. Não há `Replay (dev)` no `dev:desktop` (servidor compilado): use Haiku (`claude-haiku-5-5`). Suba um servidor de teste numa porta livre para o PortScanner achar.
3. Conferir:
   - abrir Design com servidor detectado cria UM Frame desktop 1440×900 na rota `/`, ao vivo; apagar o Frame e reabrir não recria;
   - menu "Adicionar Frame": porta (lista descoberta + digitação livre), rota, tamanho (presets e personalizado); o popover não é cortado;
   - dois Frames: só o focado é ao vivo; ao trocar, o que perdeu o foco mostra o print (`snapshot_attachment_id` preenchido) e recarregar mantém o print;
   - botão de seleção no Frame ao vivo: clicar no elemento coloca no composer a anotação (seletor, HTML limitado, estilos) e a imagem recortada; Esc ou segundo clique cancela;
   - o chip se chama pelo seletor (`#cta`) ou pela tag, e clicar nele mostra o recorte; escolher o mesmo elemento da mesma página de novo substitui o chip em vez de empilhar;
   - prova no provider: enviar o chip e ler `payload_json` da última mensagem `user` em `orchestration_v2_projection_messages` (cópia do `statev2.sqlite` do dev): `context.records` com `selector`, `htmlPreview`, `styles` e `screenshotContextId`, e `attachments` com o PNG (a resposta do agente deve descrever o recorte);
   - remover o Frame (nó selecionado + "Remover do canvas") apaga o nó e fecha a sessão;
   - nenhuma aba extra aparece no painel de navegador durante o foco (o Frame é só do canvas).
4. Entradas: barra do Design, paleta ("Adicionar Frame ao Design") e foco por clique no nó.

## Armadilhas desta passada

- `wc.capturePage()` não termina num `<webview>` escalado; use `captureStillImage` (já é o fallback da anotação, ~3 s a mais) e `captureSnapshot`.
- Print do webview para evidência: `import -window <id>` (captura do SO). Screenshot por CDP sai errado nele.
- `xdotool` não entrega clique ao webview; use CDP `Input.dispatchMouseEvent` no alvo do webview. O modo de anotação abre um popup dentro da página (shadow root fechado) com o botão "Add".
- Se `capturePage` passar a estourar o tempo em todo Frame (anotação e `captureSnapshot`), recarregar a janela (não só o Frame) restaura a captura; o estado ruim apareceu depois de várias aberturas/fechamentos do Frame com o DevTools aberto e não foi reproduzido em sessão limpa.
- Recarga forçada da janela deixa a sessão do Frame viva no servidor sem marca (a marca é em memória): ela aparece como aba normal e pode ser fechada à mão.

## Limites

- Só desktop (Electron). Mobile e web não mostram Frames; só os testes cobrem isso.
- Atualizar URL/tamanho de um Frame ao vivo (`updateFrame`) não tem tela nesta fase: o RPC existe, mas o print gravado durante a troca pode ser da página antiga.
