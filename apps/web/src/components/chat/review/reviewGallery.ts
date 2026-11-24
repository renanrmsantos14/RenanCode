import { chatMarkdownImageSources } from "@t3tools/shared/markdownPipeline";
import { classifyMarkdownImageSource } from "@t3tools/shared/markdownLinks";
import { mediaKindFromPath } from "@t3tools/shared/mediaPreview";

import { isImageAttachment, type ChatAttachment } from "../../../types";
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

export interface ReviewImage {
  readonly key: string;
  /** The timeline row the image came from; the chat scrolls there. */
  readonly rowId: string;
  /** Position among this row's gallery images, to find the rendered image inside the row. */
  readonly ordinal: number;
  readonly name: string;
  /** A markdown image source, resolved lazily because workspace files need an asset URL. */
  readonly markdownSource: string | null;
  /** A source that is already usable, such as an attachment's preview URL. */
  readonly src: string | null;
}

export type ReviewImageTarget =
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
const sourcesCache = new Map<string, ReadonlyArray<string>>();

// The chat shows a workspace file without an image extension as a file chip, and blocks some.
function rendersAsImage(source: string, cwd: string | undefined): boolean {
  const kind = mediaKindFromPath(source);
  const classified = classifyMarkdownImageSource(source, cwd);
  if (classified._tag === "Direct") return (kind ?? "image") === "image";
  return classified._tag === "WorkspaceFile" && kind === "image";
}

// Streaming re-derives the gallery per token; only the streaming message's text is new.
function markdownImages(text: string, context: ReviewGalleryContext): ReadonlyArray<string> {
  if (!text.includes("![") && !text.includes("<img")) return [];
  const cacheKey = `${context.theme ?? ""}\u0000${context.cwd ?? ""}\u0000${text}`;
  const cached = sourcesCache.get(cacheKey);
  if (cached) return cached;
  const sources = chatMarkdownImageSources(text, context.theme).filter((source) =>
    rendersAsImage(source, context.cwd),
  );
  if (sourcesCache.size >= SOURCES_CACHE_LIMIT) sourcesCache.clear();
  sourcesCache.set(cacheKey, sources);
  return sources;
}

function markdownSourceName(source: string): string {
  if (source.startsWith("data:")) return "image";
  const path = source.split(/[?#]/, 1)[0] ?? "";
  const name = path.split(/[\\/]/).at(-1);
  try {
    return (name && decodeURIComponent(name)) || "image";
  } catch {
    return name || "image";
  }
}

/**
 * Every image of the thread in timeline order: assistant and `send_to_user` markdown, then the
 * image attachments of user messages. Built from entries, not the DOM, which is virtualized.
 */
export function deriveReviewGallery(
  entries: ReadonlyArray<ReviewGalleryEntry>,
  context: ReviewGalleryContext = {},
): ReadonlyArray<ReviewImage> {
  const images: ReviewImage[] = [];
  for (const entry of entries) {
    const text =
      entry.kind === "sent-message"
        ? entry.text
        : entry.kind === "message" && entry.message?.role === "assistant"
          ? entry.message.text
          : undefined;
    if (text !== undefined) {
      markdownImages(text, context).forEach((source, ordinal) => {
        images.push({
          key: `${entry.id}:${ordinal}`,
          rowId: entry.id,
          ordinal,
          name: markdownSourceName(source),
          markdownSource: source,
          src: null,
        });
      });
      continue;
    }
    if (entry.kind !== "message" || entry.message?.role !== "user") continue;
    let shown = 0;
    entry.message.attachments?.forEach((attachment, ordinal) => {
      if (!isImageAttachment(attachment) || !attachment.previewUrl) return;
      images.push({
        key: `${entry.id}:a${ordinal}`,
        rowId: entry.id,
        ordinal: shown++,
        name: attachment.name,
        markdownSource: null,
        src: attachment.previewUrl,
      });
    });
  }
  return images;
}

export function reviewImageTarget(
  image: ReviewImage,
  context: ReviewSourceContext,
): ReviewImageTarget | null {
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

const targetIdentity = (target: ReviewImageTarget | null) =>
  target === null ? null : target._tag === "direct" ? `s:${target.src}` : `f:${target.path}`;

function previewItemIdentity(item: ExpandedImageItem | undefined) {
  if (!item) return null;
  const resource = item.actionsSource?.asset?.resource;
  if (resource?._tag === "media-file") return `f:${resource.path}`;
  return item.src === null ? null : `s:${item.src}`;
}

/**
 * Where a clicked image sits in the thread gallery, or -1. The click only knows its own message's
 * images, so a repeated image resolves to the occurrence whose neighbors match those too.
 */
export function findReviewIndex(
  images: ReadonlyArray<ReviewImage>,
  preview: ExpandedImagePreview,
  context: ReviewSourceContext,
): number {
  const wanted = preview.images.map(previewItemIdentity);
  const selected = wanted[preview.index];
  if (selected === null || selected === undefined) return -1;
  const identities = images.map((image) => targetIdentity(reviewImageTarget(image, context)));
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
