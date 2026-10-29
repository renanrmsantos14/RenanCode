---
name: verificar-web-animacoes
description: "Verifica as transições e animações da UI web: command palette, dialog/sheet, botão de enviar do composer, spinners e tokens de easing. Use após mudar apps/web/src/index.css, apps/web/src/components/ui/{command,dialog-styles,sheet,spinner}.tsx ou classes transition-*/animate-* em apps/web/src/components/**."
---

# Verificar animações da UI web

## Cobre

- Código: `apps/web/src/index.css` (tokens `--ease-*`, `@keyframes`, utilitários `visible-animate-spin`), `apps/web/src/components/ui/command.tsx`, `ui/dialog-styles.ts`, `ui/sheet.tsx`, `ui/spinner.tsx`, `apps/web/src/lib/visibleAnimation.ts`, e classes `transition-*`/`animate-*` nos componentes de chat, sidebar e preview.
- Telas: command palette (Ctrl+K), composer de thread, dialogs e sheets.

## Preparar ambiente

- Da raiz do repo, com `node_modules/.bin` no PATH: `vp run dev --no-seed > .t3/dev.log 2>&1` em segundo plano. Primeira subida leva ~40 s (build do Vite). Não use `| head`: o pipe fechado mata o servidor.
- Portas e pareamento: ler no `.t3/dev.log` a linha `[dev-runner] ... webPort=NNNN` e a linha `pairingUrl: http://localhost:NNNN/pair#token=...`. Abrir essa URL uma vez no navegador interno (`preview_start`). O token é um credencial local de dev: não cole em commit, skill ou resposta.
- Dados: o `.t3` da worktree já traz pelo menos um projeto e uma thread (a tela abre em "New thread"). Se não houver, criar um projeto pela palette.
- Test-t3-app (`.agents/skills/test-t3-app/SKILL.md`) é a referência geral de navegador.

## Roteiro

1. Esperar a splash (ícone T3) sumir e a thread aparecer com o composer "Ask anything…".
2. Pressionar `Ctrl+K`. Com a palette aberta, avaliar via `javascript_tool`:
   `getComputedStyle(document.querySelector('[data-slot=command-dialog-popup]')).transitionProperty` → `none`; idem para `[data-slot=command-dialog-backdrop]` → `none`. Fechar com `Escape`.
3. Botão de enviar: `getComputedStyle(document.querySelector('form button[type=submit]'))` → `transitionProperty` = `scale, background-color, box-shadow, filter`, `transitionTimingFunction` = `cubic-bezier(0.23, 1, 0.32, 1)`, `transitionDuration` = `0.15s`.
4. Dialog: na palette digitar `link pull` e Enter (abre "Link pull request", um `[data-slot=dialog-popup]`; "Settings" é rota, não dialog) e conferir `transitionTimingFunction` = `cubic-bezier(0.23, 1, 0.32, 1)` e `transitionDuration` = `0.2s`; o backdrop `[data-slot=dialog-backdrop]` deve ter `transitionProperty` = `opacity`.
5. Screenshot do estado final (palette aberta e thread) para a pasta de evidência.

## Casos de borda (ainda não executados; promover ao roteiro quando rodarem)

- Spinner com gate: em qualquer `<Spinner>` visível, `style.getPropertyValue('--visible-animation-state')` = `running` dentro da viewport e `paused` fora dela.
- `prefers-reduced-motion: reduce` (emular no navegador): spinners e pulses param (`motion-safe:` some), dialogs seguem abrindo sem erro.
- Aba oculta: `document.visibilityState` ≠ `visible` → `--visible-animation-state` = `paused` nos spinners.
- Palette aberta e fechada em sequência rápida (3× Ctrl+K/Esc) sem elemento órfão no DOM (`querySelectorAll('[data-slot=command-dialog-popup]').length` ≤ 1).

## Evidência obrigatória

- Screenshot da thread com a palette aberta; JSON dos computed styles dos passos 2–4; console sem erros (`read_console_messages onlyErrors`).

## Limites

- Fluidez em 120 Hz e custo de GPU só se medem com o Performance panel do DevTools num Chrome real; aqui a prova é de computed style, não de frames.
- Dialog aninhado (`--nested-dialogs`) e sheets mobile não têm atalho fácil nesta fixture; testar manualmente quando o diff os tocar.
