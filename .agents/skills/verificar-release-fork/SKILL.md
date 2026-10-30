---
name: verificar-release-fork
description: "Verifica o release do fork (instalador Windows x64 e AppImage Linux x64) gerado pelo .github/workflows/fork-release-windows.yml. Use após mudar esse workflow, .github/actions/setup-ci-deps ou scripts/build-desktop-artifact.ts."
---

# Verificar release do fork

## Cobre

- `.github/workflows/fork-release-windows.yml` (build Windows x64 + Linux x64 em paralelo, depois `publish`).
- `.github/actions/setup-ci-deps/action.yml` (o workflow usa só a parte do Vite+, com `install: "false"`).
- `scripts/build-desktop-artifact.ts` (alvos do electron-builder; `T3CODE_DESKTOP_SKIP_DEB`, `T3CODE_DESKTOP_REUSE_*`).

## Preparar

- Só roda no GitHub, no repo `renanrmsantos14/RenanCode`. Disparo: push na `main` (merge de PR) ou `gh workflow run fork-release-windows.yml -R renanrmsantos14/RenanCode`.
- Todo run com sucesso publica um release real e o app instalado atualiza. Não dispare de branch sem o OK do Renan.
- Local, só dá para provar o script: `vp install --filter=@t3tools/scripts...`, depois `cd scripts && vp run typecheck`. Em Windows, `vp test run build-desktop-artifact.test.ts` já tem 13 falhas na `main` (testes de archive Linux/macOS); compare a lista antes e depois, não o total.

## Roteiro

1. `gh run list -R renanrmsantos14/RenanCode -w fork-release-windows.yml --limit 5` e pegar o run do commit.
2. Tempos por etapa: `gh run view <id> -R renanrmsantos14/RenanCode --json jobs --jq '.jobs[] | {name, startedAt, completedAt}'`. Referência antes da otimização (run 40972118733): Windows 5m47s, Linux 4m35s, total ~6m10s.
3. No log (`gh run view <id> --log`), conferir no Linux que os artefatos não incluem `.deb` e que `Cache resource monitor`/`Cache Linux capture helpers` deram hit a partir do segundo run.
4. Segundo run em diante no Windows: `Use cached Vite+` roda e o `Install` (pwsh) acha o `vp`. Esse é o caso que quebra se o PATH vier no formato `/c/Users/...`.
5. `gh release view -R renanrmsantos14/RenanCode` lista `*.exe`, `*.exe.blockmap`, `latest.yml`, `*.AppImage` e `latest-linux.yml`.

## Casos de borda

- Mudança em `native/resource-monitor/src/**`: cache erra, o Rust compila do zero (mais lento só nesse run) e o binário novo é salvo.
- Mudança só em `.github/actions/**` não dispara release (filtro `paths`); dispare manualmente se precisar provar.
