import { EnvironmentId, ThreadId, type PreviewAnnotationPayload } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { useComposerDraftStore } from "~/composerDraftStore";

import { commitPickedElement } from "./commitPickedElement";

const threadRef = scopeThreadRef(
  EnvironmentId.make("environment-local"),
  ThreadId.make("thread-pick"),
);

function pick(
  id: string,
  selector: string,
  pageUrl = "http://localhost:3000/",
): PreviewAnnotationPayload {
  return {
    id,
    pageUrl,
    pageTitle: "Exemplo",
    comment: "",
    elements: [
      {
        id: `${id}_el`,
        rect: { x: 0, y: 0, width: 10, height: 10 },
        element: {
          pageUrl,
          pageTitle: "Exemplo",
          tagName: "H1",
          selector,
          htmlPreview: "<h1>Exemplo</h1>",
          componentName: null,
          source: null,
          stack: [],
          styles: "color: red;",
          pickedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    ],
    regions: [],
    strokes: [],
    styleChanges: [],
    screenshot: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

const commit = (annotation: PreviewAnnotationPayload) =>
  commitPickedElement({
    threadRef,
    result: { annotation, submission: "attach" },
    gt: (message) => message,
  });

const chips = () =>
  useComposerDraftStore
    .getState()
    .getComposerDraft(threadRef)
    ?.previewAnnotations.map((entry) => entry.id);

describe("commitPickedElement", () => {
  beforeEach(() => {
    useComposerDraftStore.setState({ draftsByThreadKey: {}, draftThreadsByThreadKey: {} });
  });

  it("replaces the chip when the same element of the same page is picked again", async () => {
    await commit(pick("first", "h1"));
    await commit(pick("second", "h1"));
    const draft = useComposerDraftStore.getState().getComposerDraft(threadRef);
    expect(chips()).toEqual(["second"]);
    expect(draft?.prompt.match(/t3-context:/g)).toHaveLength(1);
  });

  it("keeps chips for other elements and other pages", async () => {
    await commit(pick("a", "h1"));
    await commit(pick("b", "p"));
    await commit(pick("c", "h1", "http://localhost:3000/other"));
    expect(chips()).toEqual(["a", "b", "c"]);
  });
});
