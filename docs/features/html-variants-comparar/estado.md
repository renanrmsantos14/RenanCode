# html_variants: comparar e decidir + chat ao lado da tela cheia

- Nível: 2 (várias telas/superfícies: bloco de variações, composer, painel maximizado com chat; web, desktop e mobile)
- Etapa: 4 de 7 Go
- Próximo passo: card do Go · com você
- Branch e PR: t3/html-variants-comparar · ainda não
- Protótipo: C · Comparar e decidir (branch prototype/html-render-ui, commit eb89c8b1f0)
- Go: pendente
- Atualizado: 26/11/2026 10:56

## Decisões
| Data | Decisão | Por quê | Quem decidiu |
|---|---|---|---|
| 26/11/2026 | Seguir a variação C para html_variants | protótipo | Renan |
| 26/11/2026 | Escolha volta como chip + nota no composer; o usuário envia | não mandar nada sem confirmar | Renan |
| 26/11/2026 | Em tela cheia, poder abrir o chat da sessão na lateral e seguir conversando | pedido do Renan | Renan |
| 26/11/2026 | Tela cheia = render no painel direito maximizado, com o chat real numa coluna ao lado (como no modo revisão) | evita uma 2ª timeline/composer | Renan |
| 26/11/2026 | O chat lateral já abre visível, com botão para esconder; lembra a última escolha | pedido | Renan |
| 26/11/2026 | No celular, o chat aparece numa folha inferior arrastável por cima do mockup | não há largura para colunas | Renan |
| 26/11/2026 | Vale para todo render HTML (html_render, html_variants, html_preview) | mesmo frame, um só comportamento | Renan |
| 26/11/2026 | Escolha = texto pronto "Escolhi B (rótulo): " em pt-BR no composer, com o cursor para a nota; sem chip novo | menor solução | Renan |
| 26/11/2026 | O bloco recolhe ao achar mensagem do usuário depois dele que comece com o texto da escolha | sobrevive a recarregar, outro aparelho e mobile, sem estado novo | Renan |
| 26/11/2026 | O mobile entra nesta entrega | sem diferença entre superfícies | Renan |

## Tarefas e provas
| # | Tarefa | Depende de | Cenário (ação → resultado) | Prova | Nível | Resultado |
|---|---|---|---|---|---|---|
| 1 | shared: `findHtmlVariantChoice` + texto da escolha (letra e rótulo) e `width` no script de medida | — | cenários 2, 4, 5 (base) | `vp test run packages/shared/src/htmlRender.test.ts` (casos localizado, inglês antigo, nota, rótulo com parênteses) | 1 | |
| 2 | web: bloco C (rádio, Escolher → composer em pt-BR/i18n, escala para caber) | 1 | 1, 2, 5, 11, 12 | browser test do HtmlVariantsGrid + print largo/estreito, claro/escuro | 3 | |
| 3 | web: recolher pelo texto enviado (deriveMessagesTimelineRows + linha recolhida + "Ver todas") | 1 | 3, 4 | teste de MessagesTimeline.logic + print antes/depois de enviar | 3 | |
| 4 | web: tela cheia = painel maximizado + coluna de chat / folha inferior (reaproveita reviewLayout) + preferência | — | 6, 7, 8, 9 | browser test do ChatView/painel + test-t3-app (Replay) com prints largo e estreito | 4 | |
| 5 | mobile: bloco C + recolher | 1 | 10 (bloco), 2–4 | `vp test run` dos testes mobile tocados + print no simulador/emulador (test-t3-mobile) | 4 | |
| 6 | mobile: tela cheia com chat em folha (rota/folha com composer; Android fullScreen) | 5 | 10 (chat) | test-t3-mobile Android: abrir, digitar, enviar, fechar | 4 | |
| 7 | i18n, docs/user, skill verificar-html-variants, revisão e ux-audit Fluxo | 2–6 | 12 + todos | `vp run i18n:check`, `vp run check:changed` (Node 26), code-review, prints | 4 | |

## Pendências e fora de escopo
- Conflito de regra: AGENTS.md proíbe commitar planos; docs/features/ sai da branch num commit antes do PR.
- Página de largura fixa cortada no celular: escalar para caber (achado do protótipo).
- Texto do "Usar A" em inglês (htmlVariantFollowUpText).

## Retro
-
