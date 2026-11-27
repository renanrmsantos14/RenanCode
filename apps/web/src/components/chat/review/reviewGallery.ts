import { chatMarkdownImageSources } from "@t3tools/shared/markdownPipeline";
import { classifyMarkdownImageSource } from "@t3tools/shared/markdownLinks";
import { mediaKindFromPath } from "@t3tools/shared/mediaPreview";

import type { SnapShotSource } from "@t3tools/contracts";

import {
  isFileAttachment,
  isImageAttachment,
  isVideoAttachment,
  type ChatAttachment,
  type ChatFileAttachment,
} from "../../../types";
import type { MediaActionSource } from "../../media/MediaActions";
import { resolveProtocolRelativeMediaUrl } from "../../media/mediaContent";
import type { ExpandedImageItem, ExpandedImagePreview } from "../ExpandedImagePreview";

/** The part of a timeline entry the gallery reads, so any `TimelineEntry` fits. */
export interface ReviewGalleryEntry {
  readonly id: string;
  readonly kind: string;
  readonly message?:
    | {
        readonly role: string;
        readonly text: string;
        readonly attachments?: ReadonlyArray<ChatAttachment> | undefined;
      }
    | undefined;
  readonly text?: string | undefined;
}

export interface ReviewItem {
  readonly key: string;
  readonly kind: "image" | "video";
  /** The timeline row the item came from; the chat scrolls there. Null outside the gallery. */
  readonly rowId: string | null;
  /** Position among this row's gallery items, to find the rendered media inside the row. */
  readonly ordinal: number;
  readonly name: string;
  /** A markdown media source, resolved lazily because workspace files need an asset URL. */
  readonly markdownSource: string | null;
  /** A source that is already usable, such as an attachment's preview URL. */
  readonly src: string | null;
  /** A user's video, served by its environment while it has no usable `src`. */
  readonly videoAttachment?: Pick<ChatFileAttachment, "id" | "name" | "mimeType"> | undefined;
  readonly mimeType?: string | undefined;
  /** Revoke this owned object URL when the review lets go of it. */
  readonly ownsSrc?: boolean | undefined;
  readonly source?: SnapShotSource | undefined;
  readonly onCopySnapshot?: (() => Promise<void>) | undefined;
  readonly autoPlay?: boolean | undefined;
  readonly originalUrl?: string | undefined;
  readonly srcFragment?: string | undefined;
  readonly actionsSource?: MediaActionSource | undefined;
}

export type ReviewItemTarget =
  | { readonly _tag: "direct"; readonly src: string }
  | { readonly _tag: "workspace"; readonly path: string; readonly relative: boolean };

export interface ReviewSourceContext {
  readonly cwd: string | undefined;
  /** The guest page serves host files from its own route. */
  readonly hostImageUrl: ((path: string) => string) | null;
}

/** What decides which markdown sources the chat renders as images. */
export interface ReviewGalleryContext {
  readonly cwd?: string | undefined;
  /** The theme the chat renders in; without it every theme variant is listed. */
  readonly theme?: "dark" | "light" | undefined;
}

const SOURCES_CACHE_LIMIT = 200;
const sourcesCache = new Map<string, ReadonlyArray<MarkdownMedia>>();

type MarkdownMedia = { readonly source: string; readonly kind: ReviewItem["kind"] };

// The chat shows a workspace file without a media extension as a file chip, and blocks some.
function renderedMediaKind(source: string, cwd: string | undefined): ReviewItem["kind"] | null {
  const kind = mediaKindFromPath(source);
  const classified = classifyMarkdownImageSource(source, cwd);
  const shown =
    classified._tag === "Direct"
      ? (kind ?? "image")
      : classified._tag === "WorkspaceFile"
        ? kind
        : null;
  return shown === "image" || shown === "video" ? shown : null;
}

// Streaming re-derives the gallery per token; only the streaming message's text is new.
function markdownMedia(text: string, context: ReviewGalleryContext): ReadonlyArray<MarkdownMedia> {
  if (!text.includes("![") && !text.includes("<img")) return [];
  const cacheKey = `${context.theme ?? ""}\u0000${context.cwd ?? ""}\u0000${text}`;
  const cached = sourcesCache.get(cacheKey);
  if (cached) return cached;
  const sources = chatMarkdownImageSources(text, context.theme).flatMap((source) => {
    const kind = renderedMediaKind(source, context.cwd);
    return kind === null ? [] : [{ source, kind }];
  });
  if (sourcesCache.size >= SOURCES_CACHE_LIMIT) sourcesCache.clear();
  sourcesCache.set(cacheKey, sources);
  return sources;
}

function markdownSourceName(source: string, kind: ReviewItem["kind"]): string {
  if (source.startsWith("data:")) return kind;
  const path = source.split(/[?#]/, 1)[0] ?? "";
  const name = path.split(/[\\/]/).at(-1);
  try {
    return (name && decodeURIComponent(name)) || kind;
  } catch {
    return name || kind;
  }
}

/**
 * Every image and video of the thread in timeline order: assistant and `send_to_user` markdown,
 * then the attachments of user messages, which show images before videos. Built from entries, not
 * the DOM, which is virtualized.
 */
export function deriveReviewGallery(
  entries: ReadonlyArray<ReviewGalleryEntry>,
  context: ReviewGalleryContext = {},
): ReadonlyArray<ReviewItem> {
  const images: ReviewItem[] = [];
  for (const entry of entries) {
    const text =
      entry.kind === "sent-message"
        ? entry.text
        : entry.kind === "message" && entry.message?.role === "assistant"
          ? entry.message.text
          : undefined;
    if (text !== undefined) {
      markdownMedia(text, context).forEach(({ source, kind }, ordinal) => {
        images.push({
          key: `${entry.id}:${ordinal}`,
          kind,
          rowId: entry.id,
          ordinal,
          name: markdownSourceName(source, kind),
          markdownSource: source,
          src: null,
        });
      });
      continue;
    }
    if (entry.kind !== "message" || entry.message?.role !== "user") continue;
    let shown = 0;
    const attachments = entry.message.attachments ?? [];
    attachments.forEach((attachment, ordinal) => {
      if (!isImageAttachment(attachment) || !attachment.previewUrl) return;
      images.push({
        key: `${entry.id}:a${ordinal}`,
        kind: "image",
        rowId: entry.id,
        ordinal: shown++,
        name: attachment.name,
        markdownSource: null,
        src: attachment.previewUrl,
        ...(attachment.source ? { source: attachment.source } : {}),
      });
    });
    attachments.forEach((attachment, ordinal) => {
      if (!isFileAttachment(attachment) || !isVideoAttachment(attachment)) return;
      if (!attachment.previewUrl && attachment.downloadable === false) return;
      images.push({
        key: `${entry.id}:a${ordinal}`,
        kind: "video",
        rowId: entry.id,
        ordinal: shown++,
        name: attachment.name,
        markdownSource: null,
        src: attachment.previewUrl ?? null,
        ...(attachment.downloadable === false
          ? {}
          : {
              videoAttachment: {
                id: attachment.id,
                name: attachment.name,
                mimeType: attachment.mimeType,
              },
            }),
      });
    });
  }
  return images;
}

/** The items a click outside the thread's gallery opens, in the order the caller gave them. */
export function reviewItemsFromPreview(preview: ExpandedImagePreview): ReadonlyArray<ReviewItem> {
  return preview.images.map((image, index) => ({
    key: `preview:${index}`,
    kind: image.type === "video" ? "video" : "image",
    rowId: null,
    ordinal: index,
    name: image.name,
    markdownSource: null,
    src: image.src,
    mimeType: image.mimeType,
    ownsSrc: image.ownsSrc,
    source: image.source,
    onCopySnapshot: image.onCopySnapshot,
    autoPlay: image.autoPlay,
    originalUrl: image.originalUrl,
    srcFragment: image.srcFragment,
    actionsSource: image.actionsSource,
  }));
}

export function reviewItemTarget(
  image: ReviewItem,
  context: ReviewSourceContext,
): ReviewItemTarget | null {
  if (image.src !== null) return { _tag: "direct", src: image.src };
  if (image.markdownSource === null) return null;
  const source = classifyMarkdownImageSource(image.markdownSource, context.cwd);
  if (source._tag === "Direct") {
    return { _tag: "direct", src: resolveProtocolRelativeMediaUrl(source.uri) };
  }
  if (source._tag !== "WorkspaceFile") return null;
  return context.hostImageUrl
    ? { _tag: "direct", src: context.hostImageUrl(source.path) }
    : { _tag: "workspace", path: source.path, relative: source.relative === true };
}

function itemIdentity(item: ReviewItem, context: ReviewSourceContext) {
  const target = reviewItemTarget(item, context);
  if (target !== null) return target._tag === "direct" ? `s:${target.src}` : `f:${target.path}`;
  return item.videoAttachment ? `a:${item.videoAttachment.id}` : null;
}

function previewItemIdentity(item: ExpandedImageItem | undefined) {
  if (!item) return null;
  const resource = item.actionsSource?.asset?.resource;
  if (resource?._tag === "media-file") return `f:${resource.path}`;
  if (item.src !== null) return `s:${item.src}`;
  return resource?._tag === "attachment" ? `a:${resource.attachmentId}` : null;
}

/**
 * Where a clicked item sits in the thread gallery, or -1. The click only knows its own message's
 * media, so a repeated item resolves to the occurrence whose neighbors match those too.
 */
export function findReviewIndex(
  images: ReadonlyArray<ReviewItem>,
  preview: ExpandedImagePreview,
  context: ReviewSourceContext,
): number {
  const wanted = preview.images.map(previewItemIdentity);
  const selected = wanted[preview.index];
  if (selected === null || selected === undefined) return -1;
  const identities = images.map((image) => itemIdentity(image, context));
  let best = -1;
  let bestScore = 0;
  identities.forEach((identity, candidate) => {
    if (identity !== selected) return;
    const offset = candidate - preview.index;
    const score = wanted.reduce(
      (total, identityAt, position) =>
        total + (identityAt !== null && identities[offset + position] === identityAt ? 1 : 0),
      0,
    );
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  });
  return best;
}
