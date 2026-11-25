import { useAtomValue } from "@effect/atom-react";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { DesignSketchId } from "@t3tools/contracts";
import { T } from "gt-react";
import { AsyncResult } from "effect/reactivity";
import { useState } from "react";

import { useRightPanelStore } from "~/rightPanelStore";
import { designEnvironment } from "~/state/design";
import { useThreadShell } from "~/state/entities";
import { useAtomCommand } from "~/state/use-atom-command";

import { previewBridge } from "../preview/previewBridge";
import { DesignCanvas } from "./DesignCanvas";
import { useDesignFocusStore } from "./designFocusStore";
import { DesignSketchLibrary } from "./DesignSketchLibrary";
import { DESIGN_SKETCH_DRAG_TYPE, readDroppedSketchId } from "./projectSketchLibrary";
import { useAutoDesignFrame } from "./useAutoDesignFrame";

export default function DesignSurface(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
}) {
  const { environmentId, threadRef } = props;
  const result = useAtomValue(
    designEnvironment.canvas({ environmentId, input: { threadId: threadRef.threadId } }),
  );
  const snapshot = AsyncResult.getOrElse(result, () => null);
  const canWrite = useAtomValue(designEnvironment.moveNodes.permissionAtom(environmentId));
  const placeSketch = useAtomCommand(designEnvironment.placeSketch, {
    label: "design place sketch",
  });
  const projectId = useThreadShell(threadRef)?.projectId ?? null;
  const [libraryOpen, setLibraryOpen] = useState(false);
  useAutoDesignFrame({ environmentId, threadRef, ready: snapshot !== null, canWrite });
  const maximized = useRightPanelStore(
    (state) => state.byThreadKey[scopedThreadKey(threadRef)]?.maximized === true,
  );
  const libraryAvailable = previewBridge !== null && projectId !== null;

  const place = async (sketchId: string) => {
    const placed = await placeSketch({
      environmentId,
      input: { threadId: threadRef.threadId, sketchId: DesignSketchId.make(sketchId) },
    });
    if (placed._tag === "Success") useDesignFocusStore.getState().request(threadRef, sketchId);
  };

  return (
    <div className="flex size-full min-h-0 min-w-0" data-design-surface>
      <div
        className="relative size-full min-h-0 min-w-0 flex-1"
        onDragOver={(event) => {
          if (canWrite && event.dataTransfer.types.includes(DESIGN_SKETCH_DRAG_TYPE)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={(event) => {
          const sketchId = readDroppedSketchId(event.dataTransfer);
          if (sketchId === null || !canWrite) return;
          event.preventDefault();
          void place(sketchId);
        }}
      >
        {snapshot !== null ? (
          <DesignCanvas
            environmentId={environmentId}
            threadRef={threadRef}
            snapshot={snapshot}
            canWrite={canWrite}
            maximized={maximized}
            onToggleMaximized={() =>
              useRightPanelStore.getState().setMaximized(threadRef, !maximized)
            }
            {...(libraryAvailable
              ? { library: { open: libraryOpen, onToggle: () => setLibraryOpen((open) => !open) } }
              : {})}
          />
        ) : (
          <p className="flex size-full items-center justify-center px-6 text-center text-muted-foreground text-sm">
            {result._tag === "Failure" ? <T>Design is not available on this environment.</T> : null}
          </p>
        )}
      </div>
      {libraryAvailable && libraryOpen ? (
        <DesignSketchLibrary
          environmentId={environmentId}
          projectId={projectId}
          canWrite={canWrite}
          onPlace={(sketchId) => void place(sketchId)}
        />
      ) : null}
    </div>
  );
}
