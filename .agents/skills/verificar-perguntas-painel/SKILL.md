---
name: verificar-perguntas-painel
description: "Verifica as perguntas do agente no painel lateral: a configuração questionPlacement (Configurações › Chat › Agent questions), o botão de mover no cabeçalho da pergunta, a aba Questions (QuestionsSidePanel) e a faixa 'Question waiting in the side panel' acima do composer. Use após mudar packages/contracts/src/settings.ts (questionPlacement), usePendingThreadRequests.ts, ComposerPendingUserInputPanel.tsx, QuestionsSidePanel.tsx, ChatComposer.tsx (pendingUserInputInSidePanel), ChatView.tsx (openQuestionsPanel/movePendingUserInput) ou rightPanelStore.ts (kind questions)."
---

# Verificar perguntas no painel lateral

## Cobre

- `questionPlacement` ("composer" padrão, "side") no `ClientSettingsSchema`; `useQuestionPlacementOverrides` troca o lugar só de um `requestId`.
- No modo painel, a resposta livre fica no painel: o rascunho do composer, o cursor e `promptRef` não mudam, e o composer envia mensagem normal.
- A aba `questions` abre sozinha quando chega uma pergunta nova no painel; fechada, a faixa acima do composer reabre.
- Visualização embutida (`embedded`) sempre usa o composer. Mobile não tem painel: as perguntas seguem no composer.

## Testes rápidos

- `apps/web`: `vp test run src/components/chat/ComposerPendingUserInputPanel.navigation.browser.test.tsx` (caso "leaves the composer draft alone while the question is answered in the side panel").
- `vp run i18n:check` na raiz.

## Roteiro manual (web, dev, Replay)

1. `vp run dev`, parear o navegador, `window.t3dev.replay("question")`.
2. Padrão "Above the composer": a pergunta aparece no composer com um botão de painel no cabeçalho. Clicar: a aba Questions abre com a pergunta, o composer volta ao normal e mostra a faixa "Question waiting in the side panel · Open".
3. Escolher uma opção e "Submit answer" no painel: a pergunta some, a faixa some e a aba mostra "No questions here".
4. Configurações › Chat › Agent questions → "Side panel". Nova thread com `replay("question")`: a aba abre sozinha.
5. Fechar a aba (X): a faixa continua; clicar nela reabre a aba.
6. Botão "Move question to composer" no painel: a pergunta volta ao composer, a faixa some e a aba fica vazia.
7. Com o chat estreito (~360px) a faixa trunca o texto; o nome acessível do botão tem o texto inteiro.

## Casos de borda

- Pergunta com `allowCustomAnswer: false` (fixture `question`): o painel não mostra a caixa de texto.
- Anexos na resposta pelo painel não são suportados; para anexar, mover a pergunta para o composer.
