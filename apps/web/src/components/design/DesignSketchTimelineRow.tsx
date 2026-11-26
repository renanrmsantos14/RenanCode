import { useAtomValue } from "@effect/atom-react";
import { DesignSketchId } from "@t3tools/contracts";
import type { DesignSketchReference } from "@t3tools/shared/design";
import { use, useState } from "react";

import { isElectron } from "~/env";
import { useRightPanelStore } from "~/rightPanelStore";
import { designEnvironment } from "~/state/design";
import { useAtomCommand } from "~/state/use-atom-command";

import { TimelineRowCtx, type TimelineRow } from "../chat/timelineRowContext";
import {
  DesignSketchCardGrid,
  EnvironmentSketchThumbnailCard,
  EnvironmentSketchViewer,
} from "./DesignSketchCard";
import { useDesignFocusStore } from "./designFocusStore";

/** Cards for the sketches a tool call saved. The desktop app opens the canvas; elsewhere a viewer opens. */
export function DesignSketchTimelineRow({
  row,
}: {
  row: Extract<TimelineRow, { kind: "design-sketches" }>;
}) {
  const ctx = use(TimelineRowCtx);
  const override = ctx.renderDesignSketches?.(row);
  if (override !== undefined) return override;
  return <EnvironmentDesignSketches sketches={row.designSketches} />;
}

/**
 * Opens a saved sketch: on the desktop canvas when it can place it there, otherwise in a viewer
 * that `viewer` draws.
 */
export function useDesignSketchOpener(sketches: ReadonlyArray<DesignSketchReference>) {
  const { activeThreadEnvironmentId: environmentId, threadRef } = use(TimelineRowCtx);
  const placeSketch = useAtomCommand(designEnvironment.placeSketch, {
    label: "design place sketch",
  });
  const canWrite = useAtomValue(designEnvironment.placeSketch.permissionAtom(environmentId));
  const [viewing, setViewing] = useState<number | null>(null);

  const open = async (index: number) => {
    const sketch = sketches[index];
    if (sketch === undefined) return;
    if (!isElectron || threadRef === null || !canWrite) {
      setViewing(index);
      return;
    }
    const result = await placeSketch({
      environmentId,
      input: { threadId: threadRef.threadId, sketchId: DesignSketchId.make(sketch.sketchId) },
    });
    if (result._tag !== "Success") {
      setViewing(index);
      return;
    }
    useDesignFocusStore.getState().request(threadRef, sketch.sketchId);
    useRightPanelStore.getState().open(threadRef, "design");
  };
  const viewer =
    viewing === null ? null : (
      <EnvironmentSketchViewer
        environmentId={environmentId}
        threadRef={threadRef ?? undefined}
        sketches={sketches}
        initialIndex={viewing}
        onClose={() => setViewing(null)}
      />
    );
  return { open, viewer };
}

function EnvironmentDesignSketches(props: {
  readonly sketches: ReadonlyArray<DesignSketchReference>;
}) {
  const ctx = use(TimelineRowCtx);
  const { activeThreadEnvironmentId: environmentId, onFollowHtmlVariant } = ctx;
  const { open, viewer } = useDesignSketchOpener(props.sketches);

  return (
    <div className="min-w-0 px-1">
      <DesignSketchCardGrid
        sketches={props.sketches}
        onFollow={onFollowHtmlVariant}
        renderCard={(sketch, index, letter) => (
          <EnvironmentSketchThumbnailCard
            environmentId={environmentId}
            sketch={sketch}
            letter={letter}
            onOpen={() => void open(index)}
          />
        )}
      />
      {viewer}
    </div>
  );
}
