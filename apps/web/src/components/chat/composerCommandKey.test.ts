import { describe, expect, it, vi } from "vite-plus/test";

import { DraftId } from "../../composerDraftStore";
import { composerCommandKeyHandler } from "./composerCommandKey";

type HandlerInput = Parameters<typeof composerCommandKeyHandler>[0];

function setup(input: { readonly prompt: string; readonly suggestion: string | null }) {
  const promptRef = { current: input.prompt };
  const setComposerDraftPrompt = vi.fn<HandlerInput["setComposerDraftPrompt"]>();
  const dismissNextActionSuggestion = vi.fn();
  const applyPromptReplacement = vi.fn<HandlerInput["applyPromptReplacement"]>(() => false);
  const handler = composerCommandKeyHandler({
    keybindings: [],
    sendShortcut: "enter",
    routeKind: "server",
    phase: "ready",
    isCompacting: false,
    followUpBehavior: "queue",
    isSoftwareKeyboardOpen: false,
    planModeUiEnabled: false,
    isLiteralPendingAnswer: false,
    pendingUserInputs: [],
    promptHistoryMessages: [],
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
        readSelectionRange: () => ({ start: input.prompt.length, end: input.prompt.length }),
      } as never,
    },
    composerMenuOpenRef: { current: false },
    composerMenuItemsRef: { current: [] },
    activeComposerMenuItemRef: { current: null },
    setComposerDraftPrompt,
    setComposerCursor: vi.fn(),
    setComposerTrigger: vi.fn(),
    setComposerHighlightedItemId: vi.fn(),
    dismissComposerTrigger: vi.fn(),
    toggleInteractionMode: vi.fn(),
    nudgeComposerMenuHighlight: vi.fn(),
    onSelectComposerItem: vi.fn(),
    resolveActiveComposerTrigger: () => ({ trigger: null }),
    readComposerSnapshot: () => ({ value: promptRef.current }),
    applyPromptReplacement,
    submitComposer: vi.fn(),
    nextActionSuggestion: input.suggestion,
    dismissNextActionSuggestion,
    steerQueuedMessage: () => false,
  });
  return { handler, promptRef, setComposerDraftPrompt, dismissNextActionSuggestion };
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

describe("composerCommandKeyHandler next action suggestion", () => {
  it("accepts the suggestion on Tab without sending", () => {
    const harness = setup({ prompt: "", suggestion: "Run the tests" });
    expect(harness.handler("Tab", key("Tab"))).toBe(true);
    expect(harness.promptRef.current).toBe("Run the tests");
    expect(harness.setComposerDraftPrompt).toHaveBeenCalledWith(
      DraftId.make("draft"),
      "Run the tests",
    );
  });

  it("dismisses the suggestion on Escape", () => {
    const harness = setup({ prompt: "", suggestion: "Run the tests" });
    expect(harness.handler("Escape", key("Escape"))).toBe(true);
    expect(harness.dismissNextActionSuggestion).toHaveBeenCalledOnce();
    expect(harness.promptRef.current).toBe("");
  });

  it.each([
    ["no suggestion", "", null],
    ["text in the composer", "draft", "Run the tests"],
  ] as const)("keeps Tab's normal behavior with %s", (_name, prompt, suggestion) => {
    const harness = setup({ prompt, suggestion });
    expect(harness.handler("Tab", key("Tab"))).toBe(false);
    expect(harness.promptRef.current).toBe(prompt);
    expect(harness.dismissNextActionSuggestion).not.toHaveBeenCalled();
  });
});
