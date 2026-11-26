# html_variants: comparar e decidir + chat ao lado da tela cheia

- Nível: 2 (várias telas/superfícies: bloco de variações, composer, painel maximizado com chat; web, desktop e mobile)
- Etapa: 5 de 7 Construir
- Próximo passo: prova no app real das tarefas 1–4 (test-t3-app) · sozinho
- Branch e PR: t3/html-variants-comparar · ainda não
- Protótipo: C · Comparar e decidir (branch prototype/html-render-ui, commit eb89c8b1f0)
- Go: 26/11/2026 11:03 por Renan (card AskUserQuestion)
- Atualizado: 26/11/2026 11:36

## Decisões

| Data       | Decisão                                                                                                      | Por quê                                                          | Quem decidiu |
| ---------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ------------ |
| 26/11/2026 | Seguir a variação C para html_variants                                                                       | protótipo                                                        | Renan        |
| 26/11/2026 | Escolha volta como chip + nota no composer; o usuário envia                                                  | não mandar nada sem confirmar                                    | Renan        |
| 26/11/2026 | Em tela cheia, poder abrir o chat da sessão na lateral e seguir conversando                                  | pedido do Renan                                                  | Renan        |
| 26/11/2026 | Tela cheia = render no painel direito maximizado, com o chat real numa coluna ao lado (como no modo revisão) | evita uma 2ª timeline/composer                                   | Renan        |
| 26/11/2026 | O chat lateral já abre visível, com botão para esconder; lembra a última escolha                             | pedido                                                           | Renan        |
| 26/11/2026 | No celular, o chat aparece numa folha inferior arrastável por cima do mockup                                 | não há largura para colunas                                      | Renan        |
| 26/11/2026 | Vale para todo render HTML (html_render, html_variants, html_preview)                                        | mesmo frame, um só comportamento                                 | Renan        |
| 26/11/2026 | Escolha = texto pronto "Escolhi B (rótulo): " em pt-BR no composer, com o cursor para a nota; sem chip novo  | menor solução                                                    | Renan        |
| 26/11/2026 | O bloco recolhe ao achar mensagem do usuário depois dele que comece com o texto da escolha                   | sobrevive a recarregar, outro aparelho e mobile, sem estado novo | Renan        |
| 26/11/2026 | O mobile entra nesta entrega                                                                                 | sem diferença entre superfícies                                  | Renan        |
| 26/11/2026 | Com o Design ativo, as variações mostram o bloco C mesmo assim, com "Abrir no Design"                        | escolher é o objetivo; os cartões do Design não escolhem         | Renan (card) |
| 26/11/2026 | Assumi: na tela cheia o chat fica à esquerda do painel (onde já está)                                        | não brigar com os controles nativos do Electron                  | Claude       |

## Tarefas e provas

| #   | Tarefa                                                                                                         | Depende de | Cenário (ação → resultado) | Prova                                                                                                               | Nível | Resultado                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | shared: `findHtmlVariantChoice` + texto da escolha (letra e rótulo) e `width` no script de medida              | —          | cenários 2, 4, 5 (base)    | `vp test run packages/shared/src/htmlRender.test.ts` (casos localizado, inglês antigo, nota, rótulo com parênteses) | 1     | feita: 34/34 testes passam                                                                                                            |
| 2   | web: bloco C (rádio, Escolher → composer em pt-BR/i18n, escala para caber)                                     | 1          | 1, 2, 5, 11, 12            | browser test do HtmlVariantsGrid + print largo/estreito, claro/escuro                                               | 3     | feita: browser tests 11/11; prints feat-c-{light,dark,narrow}.png; escala e "Tentar novamente" sem prova em tela (vai no test-t3-app) |
| 3   | web: recolher pelo texto enviado (deriveMessagesTimelineRows + linha recolhida + "Ver todas")                  | 1          | 3, 4                       | teste de MessagesTimeline.logic + print antes/depois de enviar                                                      | 3     | feita: teste de lógica passa; print feat-recolhido-{light,dark}.png; fluxo enviar→recolher ainda sem prova em tela (test-t3-app)      |
| 4   | web: tela cheia = painel maximizado + coluna de chat / folha inferior (reaproveita reviewLayout) + preferência | —          | 6, 7, 8, 9                 | browser test do ChatView/painel + test-t3-app (Replay) com prints largo e estreito                                  | 4     | feita (commits b0523d64f6 e "bloco C sempre"); browser test do frame passa; falta prova em tela (test-t3-app)                         |
| 5   | mobile: bloco C + recolher                                                                                     | 1          | 10 (bloco), 2–4            | `vp test run` dos testes mobile tocados + print no simulador/emulador (test-t3-mobile)                              | 4     |                                                                                                                                       |
| 6   | mobile: tela cheia com chat em folha (rota/folha com composer; Android fullScreen)                             | 5          | 10 (chat)                  | test-t3-mobile Android: abrir, digitar, enviar, fechar                                                              | 4     |                                                                                                                                       |
| 7   | i18n, docs/user, skill verificar-html-variants, revisão e ux-audit Fluxo                                       | 2–6        | 12 + todos                 | `vp run i18n:check`, `vp run check:changed` (Node 26), code-review, prints                                          | 4     |                                                                                                                                       |

## Pendências e fora de escopo

- Conflito de regra: AGENTS.md proíbe commitar planos; docs/features/ sai da branch num commit antes do PR.
- Página de largura fixa cortada no celular: escalar para caber (achado do protótipo).
- Texto do "Usar A" em inglês (htmlVariantFollowUpText).

## Retro

-
