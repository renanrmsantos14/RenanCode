import type { ReactNode } from "react";

import { mediaReferenceFileName } from "@t3tools/client-runtime/media-reference";
import { mediaMimeType, mediaMimeTypeFromExtension } from "@t3tools/shared/mediaPreview";
import { useAssetUrlRefresh, useAssetUrlState } from "../../assets/assetUrls";
import type { MediaActionSource } from "../media/MediaActions";
import { MediaVideoPlayer } from "../media/MediaVideoPlayer";

export type ExpandedMediaAsset = NonNullable<MediaActionSource["asset"]>;

const EXPANDED_MEDIA_STATE_CLASS_NAME =
  "flex aspect-auto h-48 min-h-0 w-[min(var(--media-width),32rem)] flex-col items-center justify-center gap-3 rounded-lg border border-border/70 bg-black p-6 text-center text-sm text-white shadow-2xl";

export function ExpandedMediaFailure({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className={EXPANDED_MEDIA_STATE_CLASS_NAME}>
      {children}
    </div>
  );
}

export function expandedMediaMimeType(item: {
  readonly mimeType?: string | undefined;
  readonly src: string | null;
  readonly actionsSource?: MediaActionSource | undefined;
}): string | undefined {
  if (item.mimeType) return item.mimeType;
  const reference = item.actionsSource?.reference;
  const fileName = reference && mediaReferenceFileName(reference);
  if (fileName) {
    return mediaMimeTypeFromExtension(fileName.slice(fileName.lastIndexOf("."))) ?? undefined;
  }
  return mediaMimeType(item.src ?? "") ?? undefined;
}

/** A video sized by `--media-width` and `--media-height`, served by its asset when it has one. */
export function ExpandedVideo(props: {
  readonly name: string;
  readonly src: string | null;
  readonly asset: ExpandedMediaAsset | null | undefined;
  readonly srcFragment?: string | undefined;
  readonly originalUrl?: string | undefined;
  readonly autoPlay?: boolean | undefined;
}) {
  const { asset } = props;
  const assetUrl = useAssetUrlState(asset?.environmentId ?? null, asset?.resource ?? null);
  const refreshAssetUrl = useAssetUrlRefresh(asset?.environmentId ?? null, asset?.resource ?? null);
  const src = asset
    ? assetUrl._tag === "Success"
      ? assetUrl.url + (props.srcFragment ?? "")
      : null
    : props.src;
  return (
    <MediaVideoPlayer
      src={src}
      label={props.name}
      sourceFailed={assetUrl._tag === "Failure"}
      originalUrl={props.originalUrl}
      preload="metadata"
      autoPlay={props.autoPlay ?? true}
      className="block max-h-[var(--media-height)] max-w-[var(--media-width)] text-center"
      videoClassName="aspect-auto max-h-[var(--media-height)] w-auto max-w-[var(--media-width)] rounded-lg border border-border/70 shadow-2xl"
      stateClassName={EXPANDED_MEDIA_STATE_CLASS_NAME}
      onRetry={asset ? refreshAssetUrl : undefined}
    />
  );
}
