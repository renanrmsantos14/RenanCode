---
name: verificar-medidor-uso
description: "Verifica o medidor de limites de uso: indicador `Claude 39/60` no composer (web, desktop, mobile), detalhe ao clicar, `/usage-limits`, meta de 20% por dia útil e leitura única de `/api/oauth/usage` (60 s em foco, 5 min com o app aberto). Use após mudar claudeUsagePoller, claudeUsageLimits, packages/shared/src/usageLimits.ts, ClaudeUsageIndicator, ClaudeUsageDetail, ClaudeUsageSheet ou applyUsageReading."
---

# Verificar medidor de uso

## Cobre

- Leitura: `claudeUsagePoller.ts` faz uma chamada por `configDir` que traz limites e créditos (`cedar_ember=1`), a cada 60 s em foco e 5 min sem foco (`BackgroundPolicy.scopeDemand`), com `get_usage` de reserva. `retryAt` diz quando tenta de novo. `applyUsageReading` só republica o que mudou; `applyUsageReadFailure` guarda `lastError` sem trocar as janelas nem `checkedAt`.
- Meta (`packages/shared/src/usageLimits.ts`): 20% por dia útil seg–sex desde o reset real, fuso America/Sao_Paulo, sem feriados, teto 100%.
- Composer: uma entrada por conta Claude ativa, com qualquer modelo selecionado. Dado com mais de 3 min esmaece e mostra a idade.
- Detalhe: veredito (`On pace` / `N% over goal`), barra `usado / meta`, reset, previsão só quando há risco, 5 h, Fable sem meta e oculto em 0%, hora do dado e os outros providers. Falha só aparece com dado acima de 3 min (`Updated 6m ago · retrying in 8m`).

## Roteiro

1. Testes: `vp test run packages/shared/src/usageLimits.test.ts apps/server/src/provider/claudeUsageLimits.test.ts apps/server/src/provider/claudeUsagePoller.test.ts`. Em `apps/web`: `vp test run --project browser src/components/chat/useComposerResume.browser.test.tsx src/components/chat/useThreadLifecycle.browser.test.tsx`.
2. `vp run dev`, abrir pelo painel Browser. Com Codex selecionado, o indicador continua aparecendo.
3. Clicar no indicador: o popover abre com veredito, `N / M` e reset em horário de São Paulo. Sair com Esc.
4. Digitar `/usage-limits` e Enter: abre o mesmo detalhe e limpa o composer.
5. `window.t3dev.replay("showcase")`, aprovar o pedido do replay, `/side` e Enter duas vezes. Com dois indicadores, cada um abre o popover no próprio painel (`aria-expanded` só no clicado).
6. Usage > Limits: a meta aparece só na janela semanal geral, nunca em Fable.

## Limites

- App instalado e dev na mesma conta consultam em paralelo; o aviso "Claude limited the usage check" (429) é esperado nesse cenário. A deduplicação vale por processo.
- Mobile: tipos e testes aqui; em aparelho use `test-t3-mobile`.
