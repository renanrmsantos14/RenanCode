import type { EnvironmentId } from "@t3tools/contracts";
import { htmlRenderFileName } from "@t3tools/shared/htmlRender";

import { useLongLivedAssetUrl } from "~/assets/longLivedAssetUrls";

export interface SketchAssetSource {
  readonly attachmentId: string;
  readonly title: string;
}

export function useSketchPageUrl(environmentId: EnvironmentId | null, sketch: SketchAssetSource) {
  const state = useLongLivedAssetUrl(environmentId, {
    _tag: "attachment",
    attachmentId: sketch.attachmentId,
    fileName: htmlRenderFileName(sketch.title),
    mimeType: "text/html",
    disposition: "inline",
  });
  return state._tag === "Success" ? state.url : null;
}

export function useSketchThumbnailUrl(
  environmentId: EnvironmentId | null,
  thumbnailAttachmentId: string | null,
) {
  const state = useLongLivedAssetUrl(thumbnailAttachmentId === null ? null : environmentId, {
    _tag: "attachment",
    attachmentId: thumbnailAttachmentId ?? "none",
    fileName: "sketch.png",
    mimeType: "image/png",
    disposition: "inline",
  });
  return thumbnailAttachmentId !== null && state._tag === "Success" ? state.url : null;
}
