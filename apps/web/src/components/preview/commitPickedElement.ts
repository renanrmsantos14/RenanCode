import type {
  PreviewAnnotationPayload,
  PreviewAnnotationSubmissionResult,
} from "@t3tools/contracts";
import type { ScopedThreadRef } from "@t3tools/contracts";

import { type ComposerImageAttachment, useComposerDraftStore } from "~/composerDraftStore";
import { capturePreviewAnnotationScreenshot } from "~/lib/previewAnnotation";
import { stackedThreadToast, toastManager } from "~/components/ui/toast";

import { readComposerImageBytes } from "../chat/composerAttachmentFiles";

/**
 * Puts an accepted element pick (selector, HTML, styles and the cropped print) into the thread's
 * composer. The annotation is kept even when the optional crop fails, so a prompt never claims an image.
 */
export async function commitPickedElement(input: {
  readonly threadRef: ScopedThreadRef;
  readonly result: PreviewAnnotationSubmissionResult;
  readonly gt: (message: string) => string;
}): Promise<{
  readonly annotation: PreviewAnnotationPayload;
  readonly image: ComposerImageAttachment | null;
}> {
  const { threadRef, gt } = input;
  const { annotation: picked, screenshotFailed = false } = input.result;
  const capture = capturePreviewAnnotationScreenshot(picked);
  const cropDropped = screenshotFailed || capture.status === "failed";
  const annotation = capture.status === "failed" ? { ...picked, screenshot: null } : picked;
  if (capture.status === "captured") await readComposerImageBytes(capture.file);
  const draft = useComposerDraftStore.getState();
  draft.addPreviewAnnotation(threadRef, annotation);
  if (cropDropped) {
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title: gt("Could not capture the picked element"),
        description: gt("The annotation was kept without the screenshot."),
      }),
    );
  }
  const screenshotFile = capture.status === "captured" ? capture.file : null;
  const image =
    screenshotFile && annotation.screenshot
      ? ({
          type: "image",
          id: annotation.id,
          name: screenshotFile.name,
          mimeType: screenshotFile.type,
          sizeBytes: screenshotFile.size,
          previewUrl: annotation.screenshot.dataUrl,
          file: screenshotFile,
        } satisfies ComposerImageAttachment)
      : null;
  if (image) draft.addImage(threadRef, image);
  return { annotation, image };
}
