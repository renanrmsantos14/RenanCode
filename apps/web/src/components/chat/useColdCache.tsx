import { useAtomValue } from "@effect/atom-react";
import type { CacheKeepWarmStatus, EnvironmentId, ThreadId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { KEEP_WARM_DEFAULT_HOURS, supportsPromptCacheFeatures } from "@t3tools/shared/promptCache";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useStableCallback } from "~/hooks/useStableCallback";
import { threadEnvironment } from "~/state/threads";
import { useAtomCommand } from "~/state/use-atom-command";
import { buildThreadRouteParams } from "~/threadRoutes";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { subscribeCacheAction } from "./cacheActionBus";
import { ColdCacheDialog, type ColdCacheChoice, type ColdCachePrompt } from "./ColdCacheDialog";
import { coldCacheWarning } from "./ContextWindowMeter.logic";

type ColdCacheUsage = Parameters<typeof coldCacheWarning>[0]["usage"];

const INACTIVE: CacheKeepWarmStatus = { active: false, deadlineAt: null, pings: 0 };

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Cold-cache warning before send, per-thread keep-warm status and handoff.
 * The dialog and the keep-warm control are returned as nodes for ChatView to place.
 */
export function useColdCache(input: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId | null;
  readonly driver: string | null | undefined;
  readonly model: string | null | undefined;
  readonly usage: ColdCacheUsage;
  readonly nowMinute: string;
  readonly isWorking: boolean;
  readonly canCompact: boolean;
  readonly onCompact: () => void;
}) {
  const { environmentId, threadId, driver, model, usage, nowMinute, isWorking } = input;
  const navigate = useNavigate();
  const canOperate = useAtomValue(threadEnvironment.cacheKeepWarm.permissionAtom(environmentId));
  const keepWarmCommand = useAtomCommand(threadEnvironment.cacheKeepWarm, {
    reportFailure: false,
  });
  const handoffCommand = useAtomCommand(threadEnvironment.handoff, {
    label: "hand off thread",
  });
  const estimateCost = useAtomCommand(threadEnvironment.estimateInputCost, {
    reportFailure: false,
  });
  const supported = supportsPromptCacheFeatures(driver) && threadId !== null;

  const [fetched, setFetched] = useState<{
    readonly threadId: ThreadId;
    readonly status: CacheKeepWarmStatus;
  } | null>(null);
  const status =
    supported && canOperate && fetched?.threadId === threadId ? fetched.status : INACTIVE;
  const [prompt, setPrompt] = useState<ColdCachePrompt | null>(null);
  const resolveRef = useRef<((choice: ColdCacheChoice) => void) | null>(null);

  const runKeepWarm = useStableCallback(async (action: "status" | "start" | "stop") => {
    if (!supported || threadId === null) return;
    const result = await keepWarmCommand({
      environmentId,
      input: {
        threadId,
        action,
        ...(action === "start" ? { hours: KEEP_WARM_DEFAULT_HOURS } : {}),
      },
    });
    if (result._tag === "Success") setFetched({ threadId, status: result.value });
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keep-warm state lives on the server; refetch on thread open and each minute so the deadline and ping count stay current.
  useEffect(() => {
    if (supported && canOperate) void runKeepWarm("status");
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- nowMinute is the refetch tick
  }, [supported, canOperate, threadId, nowMinute, runKeepWarm]);

  const toggleKeepWarm = useStableCallback(() => {
    void runKeepWarm(status.active ? "stop" : "start");
  });

  const startHandoff = useStableCallback(async () => {
    if (threadId === null) return;
    toastManager.add({
      type: "info",
      title: "Handoff started",
      description: "The model is writing a summary.",
    });
    const result = await handoffCommand({ environmentId, input: { threadId } });
    if (result._tag !== "Success") return;
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(environmentId, result.value.threadId)),
    });
  });

  const warning =
    supported && !isWorking
      ? coldCacheWarning({ driver, usage, now: `${nowMinute}:00.000Z` })
      : null;

  /** Resolves how to send: null when no warning applies. */
  const confirmColdCache = async (text: string): Promise<"send" | "compact" | "cancel" | null> => {
    if (warning === null || text.trim() === "/compact") return null;
    let costUsd: number | null = null;
    if (model) {
      const cost = await estimateCost({
        environmentId,
        input: { model, tokens: warning.usedTokens },
      });
      if (cost._tag === "Success") costUsd = cost.value.costUsd;
    }
    const choice = await new Promise<ColdCacheChoice>((resolve) => {
      resolveRef.current = resolve;
      setPrompt({
        usedTokens: warning.usedTokens,
        costUsd,
        canCompact: input.canCompact,
        canHandoff: canOperate,
      });
    });
    resolveRef.current = null;
    setPrompt(null);
    if (choice === "handoff") {
      void startHandoff();
      return "cancel";
    }
    return choice;
  };

  const { onCompact } = input;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- palette and keybinding commands reach this thread's actions through a window event.
  useEffect(
    () =>
      subscribeCacheAction((action) => {
        if (action === "compact") onCompact();
        else if (action === "handoff") void startHandoff();
        else toggleKeepWarm();
      }),
    [onCompact, startHandoff, toggleKeepWarm],
  );

  const dialog = (
    <ColdCacheDialog prompt={prompt} onChoose={(choice) => resolveRef.current?.(choice)} />
  );

  const control: ReactNode =
    supported && canOperate ? (
      <div className="mt-1 flex flex-col gap-1 border-t pt-2">
        <div className="text-2xs font-medium text-secondary-label">Prompt cache</div>
        {status.active && status.deadlineAt ? (
          <div className="text-2xs text-secondary-label">
            Warm until {formatClock(status.deadlineAt)} · {status.pings}{" "}
            {status.pings === 1 ? "ping" : "pings"}
          </div>
        ) : (
          <div className="text-pretty text-2xs text-secondary-label">
            Keep warm sends a real, billed turn shortly before each cache expiry, for up to{" "}
            {KEEP_WARM_DEFAULT_HOURS} hours while the thread is idle.
          </div>
        )}
        <Button
          size="xs"
          variant="outline"
          className="w-full justify-center"
          onClick={toggleKeepWarm}
        >
          {status.active ? "Off" : "Keep warm"}
        </Button>
      </div>
    ) : null;

  return { confirmColdCache, dialog, control };
}
