import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { describe, expect, it, vi } from "vite-plus/test";

import { DraftId } from "../../composerDraftStore";
import { composerCommandKeyHandler } from "./composerCommandKey";

type HandlerInput = Parameters<typeof composerCommandKeyHandler>[0];

function setup(input: {
  readonly prompt: string;
  readonly suggestion?: string | null;
  readonly composerRichTextEnabled?: boolean;
}) {
  const promptRef = { current: input.prompt };
  const setComposerDraftPrompt = vi.fn<HandlerInput["setComposerDraftPrompt"]>();
  const dismissPromptSuggestion = vi.fn();
  const applyPromptReplacement = vi.fn<HandlerInput["applyPromptReplacement"]>(() => true);
  const submitComposer = vi.fn();
  const handler = composerCommandKeyHandler({
    keybindings: DEFAULT_RESOLVED_KEYBINDINGS,
    getShortcutContext: () => ({
      terminalFocus: false,
      terminalOpen: false,
      previewFocus: false,
      previewOpen: false,
      isWeb: true,
      isDesktop: false,
    }),
    sendShortcut: "enter",
    composerRichTextEnabled: input.composerRichTextEnabled ?? true,
    routeKind: "draft",
    phase: "ready",
    canSteer: true,
    followUpBehavior: "queue",
    isSoftwareKeyboardOpen: false,
    isLiteralPendingAnswer: false,
    pendingUserInputs: [],
    promptHistoryEntries: [],
    promptHistoryPositionRef: { current: null },
    composerDraftTarget: DraftId.make("draft"),
    promptRef,
    composerImagesRef: { current: [] },
    composerFilesRef: { current: [] },
    composerTerminalContextsRef: { current: [] },
    composerPreviewAnnotations: [],
    composerReviewComments: [],
    composerEditorRef: {
      current: {
        focus: vi.fn(),
        focusAt: vi.fn(),
        focusAtEnd: vi.fn(),
        pasteAtCodeBlockEnd: () => false,
        readSelectionRange: () => ({ start: input.prompt.length, end: input.prompt.length }),
        captureAttachmentInsertion: () => undefined,
        requestCitationComment: vi.fn(),
        readSnapshot: () => ({
          value: input.prompt,
          cursor: input.prompt.length,
          expandedCursor: input.prompt.length,
          contextIds: [],
        }),
        isCaretOnVisualEdge: () => false,
      },
    },
    composerMenuItemsRef: { current: [] },
    activeComposerMenuItemRef: { current: null },
    setComposerDraftPrompt,
    setComposerDraftThreadContexts: vi.fn(),
    setComposerDraftEnvironmentContexts: vi.fn(),
    setComposerCursor: vi.fn(),
    setComposerTrigger: vi.fn(),
    setComposerHighlightedItemId: vi.fn(),
    dismissComposerTrigger: vi.fn(),
    nudgeComposerMenuHighlight: vi.fn(),
    onSelectComposerItem: vi.fn(),
    resolveActiveComposerTrigger: () => ({ trigger: null }),
    readComposerSnapshot: () => ({ value: promptRef.current }),
    applyPromptReplacement,
    submitComposer,
    promptSuggestion: input.suggestion ?? null,
    dismissPromptSuggestion,
    steerQueuedMessage: () => false,
  });
  return { handler, promptRef, applyPromptReplacement, dismissPromptSuggestion, submitComposer };
}

const key = (name: string, init: KeyboardEventInit = {}) =>
  ({
    key: name,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ctrlKey: false,
    ...init,
  }) as KeyboardEvent;

describe("composerCommandKeyHandler prompt suggestion", () => {
  it("accepts the suggestion on Tab without sending", () => {
    const harness = setup({ prompt: "", suggestion: "Run the tests" });
    expect(harness.handler("Tab", key("Tab"))).toBe(true);
    expect(harness.applyPromptReplacement).toHaveBeenCalledWith(0, 0, "Run the tests");
  });

  it("dismisses the suggestion on Escape", () => {
    const harness = setup({ prompt: "", suggestion: "Run the tests" });
    expect(harness.handler("Escape", key("Escape"))).toBe(true);
    expect(harness.dismissPromptSuggestion).toHaveBeenCalledOnce();
    expect(harness.promptRef.current).toBe("");
  });

  it.each([
    ["no suggestion", "", null],
    ["text in the composer", "draft", "Run the tests"],
  ] as const)("keeps Tab's normal behavior with %s", (_name, prompt, suggestion) => {
    const harness = setup({ prompt, suggestion });
    expect(harness.handler("Tab", key("Tab"))).toBe(false);
    expect(harness.promptRef.current).toBe(prompt);
    expect(harness.dismissPromptSuggestion).not.toHaveBeenCalled();
  });
});

describe.each([false, true])("composer list keys (rich text: %s)", (richText) => {
  it.each([
    { prompt: "1. item", key: "Enter", shift: true },
    { prompt: "1. item", key: "Tab", shift: false },
    { prompt: "  1. item", key: "Tab", shift: true },
  ])("edits lists only in rich text for $key on $prompt", ({ prompt, key: name, shift }) => {
    const harness = setup({ prompt, composerRichTextEnabled: richText });
    harness.handler(name, key(name, { shiftKey: shift }));
    expect(harness.applyPromptReplacement).toHaveBeenCalledTimes(richText ? 1 : 0);
    expect(harness.submitComposer).not.toHaveBeenCalled();
  });
});
