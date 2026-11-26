---
name: verificar-design-controles
description: "Verifica os controles do canvas de Design iguais aos do RenanDesign: barra inferior (Selecionar, Mão, Adicionar Frame), chave Design/Preview, atalhos de teclado e lista de atalhos, desfazer/refazer, menus de contexto, botão de voltar aos designs e navegação (roda = pan, ⌘+roda/pinça = zoom, Ctrl ou Espaço = mão, Shift = multisseleção). Use após mudar DesignCanvas.tsx, DesignCanvasChrome.tsx, designCanvasControls.ts, designCanvasHistory.ts, designCanvasNavigation.ts, AddFrameMenu.tsx ou o RPC design.setNodeZ."
---

# Verificar controles do canvas de Design

## Cobre

- Barra inferior central: Selecionar (V), Mão (H; Espaço ou Ctrl seguram), separador e Adicionar Frame (B, só desktop e só em Design).
- Chave Design (D) / Preview (P) no topo: Preview trava edição, limpa a seleção e esconde Adicionar Frame.
- Teclas no canvas focado (`resolveDesignCanvasKey`): ⌘/Ctrl+Z e ⌘/Ctrl+Shift+Z, ⌘/Ctrl+D (só Frames), ⌘/Ctrl+A, `]`/`[` (um nó), setas 1 px / Shift 10 px (salva uma vez), Delete/Backspace, zoom (⌘=, ⌘−, ⌘0, Shift+1, Shift+2, Shift+0), ⌘/Ctrl+. tela cheia, ⌘/Ctrl+/ lista de atalhos, Esc.
- Navegação (`useDesignCanvasNavigation`): roda faz pan; ⌘ segurado transforma a roda em zoom; pinça/Ctrl+roda sempre dá zoom; Ctrl sozinho mostra a mão e Ctrl+arrastar move a vista (sem mover o nó, sem abrir menu, salva o viewport ao soltar); Shift/⌘ somam à seleção; com a Mão, Shift+arrastar faz marquee.
- Menus de contexto: nó (Duplicar Frame, Trazer para frente, Enviar para trás, Remover) agem sobre o nó clicado; painel (Selecionar tudo, Ajustar à tela).
- Servidor: `design.setNodeZ` (escopo operate) e `placeSketch` devolvendo o nó.

## Roteiro

1. Testes: `cd apps/web && vp test run src/components/design` (inclui `DesignCanvas.browser.test.tsx`: Delete, desfazer remoção, setas, Preview, Ctrl-pan) e `vp test run apps/server/src/design`.
2. Passada real no web (`test-t3-app`, provider `Replay (dev)`): abrir Design numa thread com 2+ sketches e conferir cada item de "Cobre" com mouse e teclado; desktop para Adicionar Frame.
3. Conferir que teclas digitadas no composer ou em campos do Add Frame não disparam atalhos do canvas, e que o atalho global da paleta continua funcionando com o canvas focado.

## Armadilhas

- `draggable` por nó sobrepõe `nodesDraggable`: com a mão ativa o nó precisa vir `draggable: false`, senão o `.nopan` do React Flow bloqueia o Ctrl+arrastar.
- `multiSelectionKeyCode` não pode incluir Control (Ctrl é a mão).
- Prints em teste de navegador: `page.viewport(1100, 760)` antes do `page.screenshot`, e o arquivo precisa ficar dentro do projeto (o `server.fs` do Vite bloqueia o scratchpad).
