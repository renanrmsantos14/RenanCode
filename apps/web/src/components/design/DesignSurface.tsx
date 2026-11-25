import { useAtomValue } from "@effect/atom-react";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { T } from "gt-react";
import { AsyncResult } from "effect/reactivity";

import { useRightPanelStore } from "~/rightPanelStore";
import { designEnvironment } from "~/state/design";

import { DesignCanvas } from "./DesignCanvas";
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
  useAutoDesignFrame({ environmentId, threadRef, ready: snapshot !== null, canWrite });
  const maximized = useRightPanelStore(
    (state) => state.byThreadKey[scopedThreadKey(threadRef)]?.maximized === true,
  );

  return (
    <div className="relative size-full min-h-0 min-w-0" data-design-surface>
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
        />
      ) : (
        <p className="flex size-full items-center justify-center px-6 text-center text-muted-foreground text-sm">
          {result._tag === "Failure" ? <T>Design is not available on this environment.</T> : null}
        </p>
      )}
    </div>
  );
}
