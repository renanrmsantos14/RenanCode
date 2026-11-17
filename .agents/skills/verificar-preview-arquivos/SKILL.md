---
name: verificar-preview-arquivos
description: "Verifica o painel de arquivos do web/desktop, incluindo o fallback que abre um link relativo ausente a partir de outro worktree do repositório (caso do subagente em worktree próprio). Use após mudar apps/web/src/components/files/FilePreviewPanel.tsx ou filePreviewMode.ts."
---

# Verificar painel de arquivos

## Cobre

- `worktreeFallbackPaths` e `isMissingRelativeFile` (filePreviewMode.ts): só caminho relativo com erro `operation_failed` + `realpath-target` (arquivo ausente). Mantém o trecho do `cwd` abaixo do worktree dele (projeto em subpasta) e no máximo 64 caminhos.
- `FilePreviewPanel.tsx`: lê os worktrees por `vcsEnvironment.listRefs` (stream; precisa de `useEnvironmentQuery`, não `useAtomQueryRunner`), confere com `filesystem.getMetadata` e troca a aba que falhou no lugar (`onNavigateFolder(found, found, false)`), sem abrir aba nova.

## Roteiro

1. Testes: `vp test run apps/web/src/components/files/FilePreviewPanel.test.ts`.
2. `vp run check:changed` (testes de navegador precisam do Chromium do Playwright instalado).
3. App real:
   - `vp run dev` em segundo plano, guardando o task id. Portas na linha `[dev-runner]`.
   - Worktree temporário ao lado deste, **com branch** (worktree destacado não aparece em `listRefs`): `git worktree add --detach ../<wt>-verif HEAD && git -C ../<wt>-verif switch -c t3/verif-tmp`.
   - Crie o arquivo só nele, no mesmo trecho do `cwd` da thread (thread em `apps/server` → `../<wt>-verif/apps/server/docs/x.md`).
   - No navegador de preview já pareado, abra pelo store: `(await import('/src/rightPanelStore.ts')).useRightPanelStore.getState().openFile(ref, 'docs/x.md')`.
   - Esperado: uma aba só, breadcrumb no worktree temporário e o conteúdo visível. Salve o print.
4. Limpeza: feche a aba, pare o dev pelo task id, apague o arquivo, `git worktree remove` e `git branch -D`.

## Limites

- Worktrees sem branch e branches além das 200 primeiras não entram.
- O redirecionamento perde a linha (`:42`) do link.
- Mobile (`ThreadFilesRouteScreen.tsx`) não tem esse fallback.
