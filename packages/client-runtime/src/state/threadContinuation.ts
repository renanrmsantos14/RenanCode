import {
  THREAD_CONTINUATION_MAX_MESSAGES,
  THREAD_CONTINUATION_MAX_TEXT_BYTES,
  type EnvironmentId,
  type OrchestrationV2ThreadProjection,
  type ScopedThreadRef,
  type ThreadContinuationMessage,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { Atom } from "effect/reactivity";
import { restoreSnapshotBodies } from "@t3tools/shared/orchestrationV2DedupedBodies";

import * as Persistence from "../platform/persistence.ts";
import { createRuntimeCommand } from "./runtime.ts";

const encoder = new TextEncoder();
const byteLength = (text: string) => encoder.encode(text).length;

/**
 * The conversation of a cached thread copy, oldest first: user and assistant text only, the
 * newest messages that fit the limits. A bounded cache window yields only what it holds.
 */
export function buildContinuationMessages(
  cached: OrchestrationV2ThreadProjection,
  limits = {
    maxMessages: THREAD_CONTINUATION_MAX_MESSAGES,
    maxBytes: THREAD_CONTINUATION_MAX_TEXT_BYTES,
  },
): ReadonlyArray<ThreadContinuationMessage> {
  const projection = restoreSnapshotBodies(cached);
  const all = projection.visibleTurnItems.flatMap(({ item }) =>
    (item.type === "user_message" || item.type === "assistant_message") && item.text.trim() !== ""
      ? [
          {
            role: item.type === "user_message" ? ("user" as const) : ("assistant" as const),
            text: item.text,
            createdAt: DateTime.formatIso(item.startedAt ?? item.updatedAt),
          },
        ]
      : [],
  );
  const kept: Array<ThreadContinuationMessage> = [];
  let bytes = 0;
  for (const message of all.slice(-limits.maxMessages).reverse()) {
    const size = byteLength(message.text);
    if (bytes + size <= limits.maxBytes) {
      kept.push(message);
      bytes += size;
    } else if (kept.length === 0) {
      // A single oversized message keeps its tail; a character takes at most 4 bytes.
      kept.push({
        ...message,
        text: message.text.slice(-Math.max(1, Math.floor(limits.maxBytes / 4))),
      });
      break;
    } else {
      break;
    }
  }
  return kept.reverse();
}

interface ContinuationThread {
  readonly environmentId: EnvironmentId;
  readonly id: ScopedThreadRef["threadId"];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
  readonly continuedFrom: ScopedThreadRef | null;
}

/** The oldest thread, on any environment, started from `original`. */
export function findContinuationOf<T extends ContinuationThread>(
  threads: Iterable<T>,
  original: ScopedThreadRef,
): T | null {
  let found: T | null = null;
  for (const thread of threads) {
    if (
      thread.continuedFrom?.environmentId === original.environmentId &&
      thread.continuedFrom.threadId === original.threadId &&
      (found === null || thread.createdAt < found.createdAt)
    ) {
      found = thread;
    }
  }
  return found;
}

/** Reads the thread copy a client cached, which works while its environment is offline. */
export function createCachedThreadReader<R, E>(
  runtime: Atom.AtomRuntime<Persistence.EnvironmentCacheStore | R, E>,
) {
  return createRuntimeCommand(runtime, {
    label: "environment-data:commands:thread:read-cached-copy",
    execute: Effect.fn("ThreadContinuation.readCachedCopy")(function* (input: ScopedThreadRef) {
      const cache = yield* Persistence.EnvironmentCacheStore;
      const cached = yield* cache.loadThread(input.environmentId, input.threadId);
      return Option.getOrNull(cached)?.projection ?? null;
    }),
  });
}

export type ContinuationWorkspace =
  | { readonly kind: "root" }
  | { readonly kind: "missing"; readonly branch: string }
  | { readonly kind: "existing"; readonly branch: string; readonly worktreePath: string }
  | { readonly kind: "create"; readonly branch: string };

interface ContinuationRef {
  readonly name: string;
  readonly isRemote?: boolean | undefined;
  readonly worktreePath: string | null;
}

/**
 * Where the continuation runs on the destination: a worktree already holding the branch, a new
 * one for a branch the machine has (even only as a remote ref), or the project root.
 */
export function resolveContinuationWorkspace(
  branch: string | null,
  refs: ReadonlyArray<ContinuationRef>,
): ContinuationWorkspace {
  if (branch === null) return { kind: "root" };
  const local = refs.find((ref) => ref.isRemote !== true && ref.name === branch);
  if (local?.worktreePath) {
    return { kind: "existing", branch, worktreePath: local.worktreePath };
  }
  const remote = refs.some(
    (ref) => ref.isRemote === true && ref.name.slice(ref.name.indexOf("/") + 1) === branch,
  );
  if (local || remote) {
    return { kind: "create", branch };
  }
  return { kind: "missing", branch };
}
