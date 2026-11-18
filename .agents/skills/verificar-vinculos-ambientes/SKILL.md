---
name: verificar-vinculos-ambientes
description: "Verifica a renovação automática de vínculos entre ambientes (peer links): grant peer_link_renewal no servidor remoto, capability linkRenewal, renovação no cliente PeerLinks e teto de 180 dias. Use após mudar apps/server/src/peer/**, apps/server/src/auth/McpOAuth.ts, EnvironmentAuth.ts, SessionStore.ts ou packages/contracts/src/auth.ts."
---

# Verificar vínculos entre ambientes (renovação)

## Cobre

- Remoto: `McpOAuth.renewPeerLink` (grant `peer_link_renewal`), `EnvironmentAuth.renewMcpPeerLink` e `confirmMcpPeerLinkRenewal`, claims `org`/`lid` em `SessionStore`.
- Cliente: `PeerLinks.renewIfDue` chamado por `resolve()` e pelo `list()` (`statusOf`); capability `linkRenewal` em `ServerEnvironment`.
- Regras: renova quando faltar menos de min(7 dias, 1/3 da validade); teto de 180 dias desde o pareamento; o nível de execução nunca sobe; sessão antiga só é revogada depois que o cliente grava a nova; sem capability ou recusa, o token atual continua valendo.

## Testes (cobrem toda a regra, sem UI)

- Em `apps/server`: `vp test run src/auth/EnvironmentAuth.test.ts src/peer/PeerLinks.test.ts src/mcp`.
- Esperado: limiar (renova na janela, não antes); recusa grava `last_error`; peer offline não muda nada; escopo e teto de runtime preservados; remoto sem `linkRenewal` não é chamado; `invalid_grant` depois de origem + 180 dias; antiga revogada só após a confirmação.
- Antes do PR: `vp run check:changed` (Node 26.12.1).

## Roteiro manual (dois ambientes, opcional)

1. Vincular dois ambientes (Settings → Linked environments). Esperado: vínculo com validade de 30 dias.
2. Adiantar o relógio do vínculo no banco de DEV (`expires_at` a menos de 7 dias) e abrir a lista. Esperado: `expires_at` volta a ~30 dias e `last_error` fica vazio.
3. Desligar "Linked environments" no remoto e repetir. Esperado: `last_error` "refused to renew the link"; o vínculo antigo segue funcionando até expirar.

## Casos de borda

- Token já expirado: não renova (o usuário vincula de novo).
- Duas chamadas ao mesmo tempo renovam uma vez só (trava por vínculo).
- Falha ao gravar o segredo novo: o token antigo continua e o segredo novo é removido.

## Limites

- Nunca tocar `~/.t3/userdata`; o roteiro manual usa o banco do worktree.
