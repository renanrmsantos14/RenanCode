---
name: verificar-perguntas-painel
description: "Verifica as perguntas do agente no painel lateral: a configuração questionPlacement (Configurações › Chat › Agent questions), o botão de mover no cabeçalho da pergunta, a aba Questions (QuestionsSidePanel) e a faixa 'Question waiting in the side panel' acima do composer. Use após mudar packages/contracts/src/settings.ts (questionPlacement), usePendingThreadRequests.ts, ComposerPendingUserInputPanel.tsx, QuestionsSidePanel.tsx, ChatComposer.tsx (pendingUserInputInSidePanel), ChatView.tsx (openQuestionsPanel/movePendingUserInput) ou rightPanelStore.ts (kind questions)."
---

# Verificar perguntas no painel lateral

## Cobre

- `questionPlacement` ("composer" padrão, "side") no `ClientSettingsSchema`; `useQuestionPlacementOverrides` troca o lugar só de um `requestId`.
- No modo painel, a resposta livre fica no painel: o rascunho do composer, o cursor e `promptRef` não mudam, e o composer envia mensagem normal.
- A aba `questions` abre sozinha quando chega uma pergunta nova no painel (`showQuestions`, guarda `questionsReturnTo`); fechada, a faixa acima do composer reabre. Respondida (ou movida ao composer), `settleQuestions` fecha a aba que ela criou e devolve o painel como estava (fechado, ou na aba anterior), salvo se o usuário trocou de aba no meio.
- Aviso de pergunta no painel: faixa em `variant="warning"`, `AttentionDot` (âmbar, `animate-attention-ping` 3 vezes e para) no mascote da faixa, na aba Questions e no botão "Toggle right panel" quando o painel está fechado.
- Visualização embutida (`embedded`) sempre usa o composer. Mobile não tem painel: as perguntas seguem no composer.

## Testes rápidos

- `apps/web`: `vp test run src/components/chat/ComposerPendingUserInputPanel.navigation.browser.test.tsx` (caso "leaves the composer draft alone while the question is answered in the side panel").
- `vp run i18n:check` na raiz.

## Roteiro manual (web, dev, Replay)

1. `vp run dev`, parear o navegador, `window.t3dev.replay("question")`.
2. Padrão "Above the composer": a pergunta aparece no composer com um botão de painel no cabeçalho. Clicar: a aba Questions abre com a pergunta, o composer volta ao normal e mostra a faixa "Question waiting in the side panel · Open".
3. Escolher uma opção e "Submit answer" no painel: a pergunta some, a faixa some, a aba Questions fecha e o painel volta ao que era antes (aqui, fechado).
4. Configurações › Chat › Agent questions → "Side panel". Nova thread com `replay("question")`: a aba abre sozinha.
5. Fechar a aba (X): a faixa continua; clicar nela reabre a aba.
6. Botão "Move question to composer" no painel: a pergunta volta ao composer, a faixa some e a aba Questions fecha.
   6b. Painel aberto na aba Design, mandar outra mensagem na mesma thread Replay: a pergunta assume a aba Questions; respondida, volta à Design.
   6c. Com a pergunta na aba Questions, trocar para outra aba (existente ou nova pelo "Add panel surface"): a pergunta volta ao composer, a faixa some e a aba Questions criada por ela fecha. Fechar o painel, fechar a aba Questions no X ou uma troca automática (reveal do agente, diff proativo) mantêm a pergunta no painel e a faixa.
7. Com a pergunta no painel: faixa âmbar, ponto na aba Questions; fechar o painel mostra o ponto no botão do painel. `getComputedStyle` do anel interno do ponto: `0.9s ease-out 3 step-ping` (nunca `infinite`).
8. Com o chat estreito (~360px) a faixa trunca o texto; o nome acessível do botão tem o texto inteiro.
9. Modo revisão (abrir imagem da conversa, viewport ≥ 1600px): a pergunta aparece no composer do chat lateral, sem a faixa "Question waiting in the side panel"; o `padding-left` de `.chat-composer-lane` é 4px. Fechar a revisão devolve a pergunta ao painel.

## Casos de borda

- Pergunta com `allowCustomAnswer: false` (fixture `question`): o painel não mostra a caixa de texto.
- Anexos na resposta pelo painel não são suportados; para anexar, mover a pergunta para o composer.
