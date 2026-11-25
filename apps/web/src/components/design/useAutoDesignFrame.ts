import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { useEffect, useRef } from "react";

import { useDiscoveredPortsState } from "~/portDiscoveryState";
import { designEnvironment } from "~/state/design";
import { useAtomCommand } from "~/state/use-atom-command";

import { previewBridge } from "../preview/previewBridge";
import { useDesignFrameStore } from "./designFrameStore";

/**
 * Opens the first Frame by itself when Design shows a thread whose dev server is already running.
 * The server remembers it did so, so a Frame the user deletes never comes back.
 */
export function useAutoDesignFrame(input: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly ready: boolean;
  readonly canWrite: boolean;
}) {
  const { environmentId, threadRef, ready, canWrite } = input;
  const addFrame = useAtomCommand(designEnvironment.addFrame, {
    label: "design auto frame",
    reportFailure: false,
  });
  const { servers } = useDiscoveredPortsState(previewBridge === null ? null : environmentId);
  const tried = useRef(false);
  const own = servers.find(
    (server) =>
      server.terminal?.threadId === threadRef.threadId ||
      server.agent?.threadId === threadRef.threadId,
  );
  const url = (own ?? servers[0])?.url;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- asks the server, an external system, to open the thread's first Frame once a dev server shows up
  useEffect(() => {
    if (tried.current || !ready || !canWrite || url === undefined) return;
    tried.current = true;
    void addFrame({
      environmentId,
      input: { threadId: threadRef.threadId, url, device: "desktop", auto: true },
    }).then((result) => {
      if (result._tag === "Success" && result.value !== null) {
        useDesignFrameStore.getState().focus(threadRef, result.value.id);
      }
    });
  }, [ready, canWrite, url, addFrame, environmentId, threadRef]);
}
