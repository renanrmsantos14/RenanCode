import type { DesignSelection, PreviewAnnotationPayload } from "@t3tools/contracts";

const PNG_DATA_URL_PREFIX = "data:image/png;base64,";
const MAX_PNG_BASE64_LENGTH = 3_000_000;

const clip = (value: string, max: number) => (value.length > max ? value.slice(0, max) : value);

/** What the agent can read back about a pick: the first element, its comment and the crop when it is a PNG that fits. */
export function designSelectionFromAnnotation(
  annotation: PreviewAnnotationPayload,
): DesignSelection | null {
  const element = annotation.elements[0]?.element;
  if (element === undefined) return null;
  const dataUrl = annotation.screenshot?.dataUrl ?? "";
  const png =
    dataUrl.startsWith(PNG_DATA_URL_PREFIX) &&
    dataUrl.length - PNG_DATA_URL_PREFIX.length <= MAX_PNG_BASE64_LENGTH
      ? dataUrl.slice(PNG_DATA_URL_PREFIX.length)
      : null;
  return {
    pageUrl: clip(element.pageUrl, 2048),
    tagName: clip(element.tagName, 64),
    selector: element.selector === null ? null : clip(element.selector, 2000),
    htmlPreview: clip(element.htmlPreview, 20_000),
    styles: clip(element.styles, 20_000),
    comment: clip(annotation.comment, 4000),
    png,
    pickedAt: element.pickedAt,
  };
}
