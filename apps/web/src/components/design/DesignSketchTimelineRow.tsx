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

function EnvironmentDesignSketches(props: {
  readonly sketches: ReadonlyArray<DesignSketchReference>;
}) {
  const ctx = use(TimelineRowCtx);
  const { activeThreadEnvironmentId: environmentId, threadRef, onFollowHtmlVariant } = ctx;
  const placeSketch = useAtomCommand(designEnvironment.placeSketch, {
    label: "design place sketch",
  });
  const canWrite = useAtomValue(designEnvironment.placeSketch.permissionAtom(environmentId));
  const [viewing, setViewing] = useState<number | null>(null);

  const open = async (index: number) => {
    const sketch = props.sketches[index];
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
      {viewing !== null ? (
        <EnvironmentSketchViewer
          environmentId={environmentId}
          threadRef={threadRef ?? undefined}
          sketches={props.sketches}
          initialIndex={viewing}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </div>
  );
}
