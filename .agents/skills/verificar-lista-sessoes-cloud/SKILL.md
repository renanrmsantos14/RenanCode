---
name: verificar-lista-sessoes-cloud
description: Verifica que uma sessão Claude cloud aparece uma vez só na lista de threads (web e mobile), com ícone de nuvem, mesmo com várias máquinas espelhando a mesma sessão. Use após mudar dedupeClaudeCloudThreads, steadyNavigationThreadShellsAtom do mobile, o filtro de ambiente de buildThreadListV2Items ou o rótulo de máquina de ThreadListV2Row / SidebarThreadRow.
---

# Verificar lista de sessões cloud

Cada ambiente logado na mesma conta Claude espelha a mesma sessão com o mesmo id `claude-cloud:<id>`. A lista junta as cópias no cliente.

## Cobre

- `dedupeClaudeCloudThreads` (packages/client-runtime/src/state/claudeCloud.ts): fica a cópia com run ativo, depois a com run, depois a de ambiente preferido (web: o primário; mobile: os conectados). Com `preferredFirst`, o ambiente preferido vem antes do run (paleta do mobile e menções do composer).
- Mobile: `steadyNavigationThreadShellsAtom` (apps/mobile/src/state/threads.ts) alimenta Home, sidebar e a tela de reordenar; `buildThreadListV2Items` deixa sessão cloud passar pelo filtro de ambiente; `ThreadListV2Row` mostra ícone de nuvem e "Cloud".
- Mobile, outras listas: paleta de comandos (`CommandPalette.tsx`, cópia de ambiente conectado), arquivadas (`buildArchivedThreadGroups`) e a linha selecionada da sidebar no tablet (`useSidebarRowThreadKey` + `listedCloudSessionEnvironmentAtom`).
- Web e mobile: menções de thread no composer (`matchComposerThreadItems`), preferindo a cópia do ambiente do composer.
- Web: `Sidebar.tsx` chama o dedupe com o ambiente primário; `SidebarThreadRow` mostra o ícone de nuvem.

## Testes

```bash
export PATH=$HOME/.nvm/versions/node/v26.12.1/bin:$PWD/node_modules/.bin:$PATH
(cd packages/client-runtime && vp test run src/state/claudeCloud.test.ts src/composerThreadItems.test.ts)
(cd apps/mobile && vp test run src/features/threads/threadListV2.test.ts src/features/archive/archivedThreadList.test.ts)
```

## No app (precisa de 2+ máquinas na mesma conta Claude)

1. Com desktop e notebook pareados e uma sessão cloud existente, abra a lista de threads no web e no celular (skills `test-t3-app` / `test-t3-mobile`).
2. Esperado: uma linha por sessão cloud, com ícone de nuvem; no celular o rótulo é "Cloud"/"Nuvem", não o nome da máquina.
3. Celular, filtro por máquina: a sessão cloud continua na lista em qualquer máquina filtrada.
4. Desligue a máquina cuja cópia estava listada: a linha continua e abre pela cópia de uma máquina conectada.

## Lacunas conhecidas

- Arquivadas do mobile: desarquivar ou excluir age só na cópia listada; a linha volta como a cópia da outra máquina até repetir a ação em cada uma.
- Web: a paleta de comandos lê as listas por ambiente e ainda pode repetir a sessão.
