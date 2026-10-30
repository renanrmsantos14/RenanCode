---
name: verificar-mcp-sob-demanda
description: 'Verifica os MCP servers sob demanda nas threads do Claude: sessão começa sem MCP, o botão de plug do composer liga e desliga servidores por thread, e o modo "Load all servers" religa tudo. Use após mudar apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.ts (gateClaudeMcpServers e helpers de MCP), apps/web/src/components/chat/McpServersMenu.tsx, o comando thread.mcp-server.set ou os campos mcpServers/enabledMcpServers/mcpAtStart nos contratos.'
---

# Verificar MCP sob demanda (Claude)

## Cobre

- Código: `gateClaudeMcpServers`, `planClaudeMcpToggles` e `summarizeClaudeMcpServers` em `apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.ts`; o comando `thread.mcp-server.set` (contrato em `packages/contracts/src/orchestrationV2.ts`, mutação em `Orchestrator.ts`); `mcpAtStart` e `alwaysOnMcpServers` em `packages/contracts/src/settings.ts`; `pinnedMcpServers`/`setMcpServerPinned` em `settings.ts` e `serverSettings.ts`; `splitMcpServers` em `packages/client-runtime/src/mcpServerRequest.ts`; `apps/web/src/components/chat/McpServersMenu.tsx` e a ligação em `ChatComposer.tsx`/`ChatView.tsx`.
- Telas: composer de uma thread do Claude (botão de plug ao lado do medidor de contexto) e Settings → Providers → Claude.

## Testes rápidos

- `vp test run src/orchestration-v2/Adapters/ClaudeAdapterV2.test.ts -t "on-demand MCP"` (em `apps/server`).
- `vp test run src/orchestration-v2/runtimeLayer.test.ts -t "lifecycle"` (em `apps/server`): cobre ligar e desligar servidores pelo comando.

## Preparar ambiente

- Da raiz da worktree, com `node_modules/.bin` no PATH: `vp run dev --no-seed > .t3/dev.log 2>&1` em segundo plano. Portas na linha `[dev-runner]` do log. Na máquina do Renan a subida leva de 25 a 60 s.
- O navegador interno costuma já ter o cookie de dev. Se pedir pareamento, `node apps/server/src/bin.ts pair --base-dir=.t3` (pode demorar ou travar com pouca RAM). Não cole o token em lugar nenhum.
- Use um projeto descartável (ex.: `C:/Users/mendo/AppData/Local/Temp/mcp-spike/projeto-teste`) e o modelo **Haiku** do Claude. Cada mensagem é um turno real e pago.
- Confira em Settings → Providers → Claude que **MCP servers at session start** está em **Off until switched on**.
- Efeito colateral esperado: os toggles gravam `disabledMcpServers` por pasta em `~/.claude.json`. Para conferir: `node -e 'const p=require(process.env.USERPROFILE+"/.claude.json").projects;for(const k in p)if(/projeto-teste/.test(k))console.log(p[k].disabledMcpServers)'`.

## Roteiro

1. Abrir a thread do projeto de teste e mandar: `Liste as ferramentas MCP (prefixo mcp__) exceto t3-code, ou diga NENHUMA. Responda só isso.` Esperado: `NENHUMA`. Depois do 1º turno aparece o botão `button[aria-label^="MCP servers"]` com "0 on".
2. Abrir o menu pelo teclado (focar o botão e Enter). Esperado: lista de servidores (claude.ai e plugins), todos desligados, primeiro item só destacado, nada ligado.
3. Ligar "claude.ai Spotify" (ArrowDown até ele e Enter, ou clique). Esperado: botão "1 on", nota "Applies on next message" no item, menu continua aberto.
4. Mandar a mesma pergunta. Esperado: só as 5 ferramentas `mcp__claude_ai_Spotify__*`. Reabrir o menu: Spotify ligado e sem nota.
5. Desligar o Spotify e perguntar `Quantas ferramentas com prefixo mcp__claude_ai_ você tem disponíveis agora? Responda só "TOTAL=" seguido do número.` Esperado: `TOTAL=0`.
6. Trocar **MCP servers at session start** para **Load all servers**. A sessão já aberta mantém as configurações antigas: reinicie o servidor de dev para abrir sessão nova. Perguntar a contagem do Spotify. Esperado: 5, botão de plug some e `disabledMcpServers` da pasta fica vazio.
7. Voltar a configuração para **Off until switched on** ao terminar.

## Fixar servidores (favoritos)

Não precisa de turno pago: o `vp run dev` com dados copiados já traz threads do Claude com `mcpServers` (procure em `orchestration_v2_projection_provider_threads.payload_json` do `.t3/userdata/statev2.sqlite`) e a rota é `/<environmentId>/<threadId>`.

1. Sem nada fixado, o menu lista todos os servidores. Passar o mouse num item mostra a estrela (`button[aria-label="Pin <nome>"]`).
2. Clicar na estrela: o switch não muda, o menu passa a mostrar só fixados e ligados, e o resto vai para "More servers (N)".
3. Pela estrela dentro do submenu, o servidor sobe para a lista principal e o N cai.
4. Conferir `pinnedMcpServers` em `.t3/userdata/settings.json`. No mobile, a seção MCP servers das configurações da thread segue os mesmos fixados.

## Casos de borda

- Cliques rápidos em dois servidores diferentes (ex.: `items[2].click(); items[0].click()` via `preview_evaluate` com o menu aberto) mantêm os dois. O comando é por servidor, então um não apaga o outro.
- Servidor em **Always-on MCP servers** aparece ligado, desabilitado e com a nota "Always on in settings".
- Dados gravados antes do campo `alwaysOn` existir precisam carregar. "Missing key" no `.t3/dev.log` quebra o projection store inteiro.

## Armadilhas da automação

- Ao fixar o primeiro servidor o menu encolhe; um clique na coordenada antiga pode cair no switch de outro item.

- `preview_act` com `selector` no botão do plug já ligou o primeiro item por engano. Abra o menu por coordenada ou pelo teclado.
- Um hook Stop de commit do ambiente pode trocar a resposta final do agente. Se isso acontecer, faça perguntas com resposta marcada (`TOTAL=`, `SPOTIFY=`) e procure o texto com `preview_wait_for`.
- Se o Enter no composer não enviar, clique em `button[aria-label="Submit message"]`.
