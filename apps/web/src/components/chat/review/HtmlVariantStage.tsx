import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { htmlRenderFileName, type HtmlRenderReference } from "@t3tools/shared/htmlRender";
import { T, useGT, Var } from "gt-react";
import { useState } from "react";

import { useAssetUrlRefresh } from "~/assets/assetUrls";
import { useLongLivedAssetUrl } from "~/assets/longLivedAssetUrls";

import { HtmlRenderDocument } from "../../files/BrowserDocumentFrame";
import { Button } from "../../ui/button";

/** One published page filling its box as a live, interactive frame, loaded from the environment. */
export function HtmlVariantStage(props: {
  readonly environmentId: EnvironmentId;
  readonly htmlRender: HtmlRenderReference;
  readonly threadRef: ScopedThreadRef | undefined;
}) {
  const gt = useGT();
  const { attachmentId, title } = props.htmlRender;
  const resource = {
    _tag: "attachment" as const,
    attachmentId,
    fileName: htmlRenderFileName(title),
    mimeType: "text/html",
    disposition: "inline" as const,
  };
  // The frame keeps the first URL it loads, so later mints do not reload the page.
  const [src, setSrc] = useState<string | null>(null);
  const assetUrl = useLongLivedAssetUrl(src === null ? props.environmentId : null, resource);
  if (src === null && assetUrl._tag === "Success") setSrc(assetUrl.url);
  const refresh = useAssetUrlRefresh(props.environmentId, resource);

  if (src !== null) {
    return (
      <HtmlRenderDocument
        src={src}
        title={title}
        threadRef={props.threadRef}
        className="block size-full"
      />
    );
  }
  if (assetUrl._tag === "Failure") {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground text-xs">
        <p>
          <T>
            Unable to load <Var>{title}</Var>
          </T>
        </p>
        <Button
          size="xs"
          variant="outline"
          onClick={() => {
            void refresh()
              .then((url) => {
                if (url !== null) setSrc(url);
              })
              .catch(() => undefined);
          }}
        >
          <T>Try again</T>
        </Button>
      </div>
    );
  }
  return (
    <div className="flex size-full items-center justify-center text-muted-foreground text-xs">
      {gt("Loading...")}
    </div>
  );
}
