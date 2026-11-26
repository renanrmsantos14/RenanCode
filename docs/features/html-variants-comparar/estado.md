# html_variants: comparar e decidir + chat ao lado da tela cheia

- Nível: 2 (várias telas/superfícies: bloco de variações, composer, painel maximizado com chat; web, desktop e mobile)
- Etapa: 3 de 7 Spec e plano
- Próximo passo: escrever spec.md e o plano · sozinho
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

## Pendências e fora de escopo
- Página de largura fixa cortada no celular: escalar para caber (achado do protótipo).
- Texto do "Usar A" em inglês (htmlVariantFollowUpText).

## Retro
-
