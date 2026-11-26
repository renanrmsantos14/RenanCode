# Spec: html_variants "comparar e decidir" + chat ao lado da tela cheia

## Objetivo
Fazer a comparação de variações de HTML levar a uma decisão clara: escolher uma variação, deixar uma nota, mandar a escolha ao agente e ver o bloco recolhido no histórico. Ao abrir qualquer render HTML em tela cheia, o usuário continua conversando com o chat da sessão ao lado (web e desktop) ou numa folha inferior (celular e web estreita).

## Fora de escopo
- Servidor MCP e contratos de ferramenta. Nenhuma mudança em `html_render`, `html_variants` ou `html_preview` no lado do agente. `html_preview` não tem bloco no chat (devolve PNG ao agente), então só é afetado por usar o mesmo frame.
- Chip novo no composer, envio automático da escolha e estado novo no servidor.
- Tela cheia de imagens, arquivos e outros painéis.

## Cenários de aceite (ação → resultado)
1. O agente chama `html_variants` com 3 variações (web largo) → aparecem lado a lado, cada uma com rádio e rótulo "A · rótulo". Abaixo há "Escolher" desativado até selecionar uma.
2. Selecionar B e clicar "Escolher" → o composer recebe `Escolhi B (rótulo): ` (na língua do app), com o foco e o cursor no fim. Nada é enviado.
3. Enviar a mensagem → o bloco recolhe numa linha: miniatura de B, "Você escolheu B · rótulo", o trecho da nota e "Ver todas" (que reabre localmente). Continua recolhido depois de recarregar, em outro aparelho e no mobile.
4. Uma mensagem antiga com `Continue with variant B (rótulo): ` também recolhe o bloco (compatibilidade).
5. Página de largura fixa (mockup de 440 px) numa célula de 300 px → a página é reduzida para caber, sem corte horizontal. Página fluida não muda.
6. Web/desktop largo: clicar em "Tela cheia" num render (simples ou variação) → o render abre no painel direito maximizado e o chat da sessão fica numa coluna à direita, já aberto. É possível rolar, ler e enviar mensagens ali, inclusive escolher a variação.
7. O botão "Esconder chat" recolhe a coluna (o render ocupa tudo) e "Mostrar chat" a traz de volta. A preferência vale para a próxima vez.
8. Esc, o botão de restaurar ou fechar o painel → volta ao layout normal, com o chat no mesmo ponto de rolagem.
9. Web estreita (< md): a tela cheia mostra o render, e o chat fica numa folha inferior com alça (espiar, metade, cheia), com o composer utilizável.
10. Mobile (iOS/Android): o bloco de variações faz seleção, "Escolher" e recolher (cenários 2–4). Na tela cheia de um render há um botão "Chat" que abre o chat da sessão numa folha por cima, com composer e teclado funcionando no Android.
11. Tema claro/escuro, carregando e erro continuam como hoje dentro do frame. O erro mostra "Tentar de novo".
12. Textos novos traduzidos (web e mobile). `vp run i18n:check` passa.

## Dados e contratos
- Nenhum schema nem migração; não há Dataverse neste projeto.
- `packages/shared/src/htmlRender.ts`: um helper puro `findHtmlVariantChoice(variants, laterUserTexts)` → `{ index, note } | null`. Procura no início do texto `X (rótulo):`, com a letra e o rótulo exatos, nas formas localizada e antiga em inglês.
- O script de medida do frame passa a mandar também `width` (`scrollWidth`) junto de `height`. O campo é opcional: um cliente antigo o ignora.
- A preferência "chat ao lado na tela cheia" é guardada só no cliente.

## Irreversível
Nada. A mudança é só de cliente e de um campo opcional no script do frame. Rollback = reverter o PR.
