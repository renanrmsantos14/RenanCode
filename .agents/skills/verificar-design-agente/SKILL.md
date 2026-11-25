---
name: verificar-design-agente
description: 'Verifica as ferramentas MCP do agente para o Design (design_canvas_read, design_frame_add, design_frame_screenshot, design_selection_read, design_canvas_arrange) e a biblioteca desktop "Esboços do projeto". Use após mudar apps/server/src/mcp/toolkits/design/*, DesignService (Frame ao vivo, seleção, arrange, listProjectSketches), migração 123, DesignSketchLibrary, projectSketchLibrary, designSelection, useDesignFrameLive ou packages/contracts/src/design.ts.'
---

# Verificar Design: agente e biblioteca

## Cobre

- Servidor: toolkit `design` (`tools.ts`, `handlers.ts`), `DesignService` (Frame ao vivo reportado por `design.reportLiveFrame`, seleção por `design.setSelection`, `arrangeNodes` com grupos em `group_id/group_label`, migração 123, `listProjectSketches` paginada com threads apagadas).
- Cliente desktop: painel "Project sketches" (busca por título, miniaturas lazy, agrupado por thread de origem, "Thread apagada"), arrastar para o canvas (MIME `application/x-t3-design-sketch`, reusa `design.placeSketch`), nó `group` tracejado, `useDesignFrameLive`, `designSelection`.
- Web comum, mobile e convidado só ignoram o que não entendem.

## Roteiro

1. Testes: `vp test run apps/server/src/design apps/server/src/mcp/toolkits/core.test.ts apps/server/src/persistence/Migrations/123_DesignNodeGroups.test.ts`; `cd apps/web && vp test run src/components/design` (inclui `DesignSurface.library.browser.test.tsx`).
2. Evals: `evals/mcp-tool-use/cases/design-canvas.ndjson` só com `--dry-run` (ver `evals/README.md`).
3. Passada real (desktop), como em `verificar-design-frames`: `T3CODE_DESKTOP_REMOTE_DEBUGGING_PORT=9333 vp run dev:desktop` com `.t3` da worktree, stub do `t3-browser-secret`, Haiku (`claude-haiku-5-5`), site de teste numa porta livre. Crie projeto e threads pela CLI (`thread start/send --wait`).
4. Conferir:
   - `design_canvas_read` lista nós (id, tipo, posição, grupo) só da thread do chamador; id de outra thread/projeto é negado; sem desktop conectado a resposta explica;
   - `design_frame_add` cria Frame (porta/rota/tamanho) e devolve o id;
   - `design_frame_screenshot` imprime o Frame ao vivo (desktop responde) ou cai no último print salvo; nó inexistente dá erro claro;
   - `design_selection_read` devolve a seleção feita pelo picker no Frame da thread (vazia sem seleção);
   - `design_canvas_arrange` move nós e cria grupo; conferir posições em `design_canvas_nodes` (cópia do `statev2.sqlite`, nunca o real);
   - biblioteca: botão "Project sketches" abre o painel, mostra esboços de outras threads agrupados, busca filtra, arrastar para o canvas cria o nó, "Try again" recarrega;
   - esboço de thread apagada aparece em "Thread apagada" (só coberto por teste se a passada não apagar a thread).

## Armadilhas desta passada

- `locator.dragTo` do Playwright não dispara o DnD HTML5 no Electron: use `dispatchEvent` de `DragEvent` com `DataTransfer` no item `[data-design-library-item]` e no `.react-flow`.
- O drop usa o auto-posicionamento de `placeSketch`; a posição solta não é honrada.
- Thumbnails vêm vazias no dev sem Chrome (placeholder, igual ao canvas).
- Primeira chamada de `design_canvas_arrange` que cria grupo e move na mesma chamada pode deslocar nós para a 2ª linha; uma segunda chamada só com posições corrige.
- Dev recém-reconstruído responde 503 por alguns segundos: espere a porta do servidor.
- Parar por PID capturado (`$S/desktop.pid`) ou dono da porta com `/proc/<pid>/cwd` na worktree; nunca `pkill -f`.

## Limites

- Só desktop. Apagar esboço pela biblioteca não existe nesta fase.
- Seleção real via picker no webview não foi exercitada na passada (só `design_selection_read` sem seleção); coberta por testes.
