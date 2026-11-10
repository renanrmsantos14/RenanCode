---
name: verificar-status-sessao-cloud
description: Verifica que uma sessão Claude cloud iniciada pelo composer mostra Working e depois Done (thread e sidebar) desde o primeiro turno. Use após mudar ClaudeCloudSessions.start, ClaudeCloudQueryRunner ou o espelho syncSession em apps/server/src/claudeCloud.
---

# Verificar status da sessão cloud

O primeiro prompt precisa passar por `message.dispatch` para virar run; é o run que gera Working/Done.

1. Suba `vp run dev` na worktree (skill `test-t3-app`). Com a base acima de 500 MiB, copie só `~/.t3/userdata/settings.json` para `.t3/userdata/`.
2. A branch do projeto precisa existir no GitHub (senão o start dá `branch-not-pushed`).
3. No composer de uma thread nova: chip de ambiente → "Claude cloud". Envie `Teste T3 (pode arquivar). Responda só: oi. Não use ferramentas.`
4. Esperado: a URL vira `/claude-cloud:cse_...`, aparece "Working for Ns" na thread e um item "Working" na sidebar. Em até ~1 min chega "oi", o botão de parar volta a ser enviar e a thread sai de Working.
5. Prompt aparece uma única vez (sem duplicata espelhada).
6. Limpeza: menu de contexto da thread → "Archive thread" (arquiva a sessão no claude.ai pela conta da thread). Encerre o dev server pelo PID/tarefa que você iniciou.

Falha típica: thread aparece sem Working e a resposta surge só via espelho → o prompt voltou a ir embutido no POST de criação.
