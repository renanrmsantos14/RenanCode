import * as Schema from "effect/Schema";

import {
  EnvironmentId,
  IsoDateTime,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import { ModelSelection } from "./modelSelection.ts";
import { ProviderInteractionMode, RuntimeMode } from "./providerPolicy.ts";

export const THREAD_CONTINUATION_MAX_MESSAGES = 400;
export const THREAD_CONTINUATION_MAX_TEXT_BYTES = 400 * 1024;

export const ThreadContinuationMessage = Schema.Struct({
  role: Schema.Literals(["user", "assistant"]),
  text: Schema.String,
  createdAt: IsoDateTime,
});
export type ThreadContinuationMessage = typeof ThreadContinuationMessage.Type;

/** A thread read from a client's offline cache, to be recreated on this environment. */
export const ThreadContinuationInput = Schema.Struct({
  /** Chosen by the client so a retried request lands on the same thread. */
  threadId: ThreadId,
  projectId: ProjectId,
  source: Schema.Struct({ environmentId: EnvironmentId, threadId: ThreadId }),
  title: Schema.String,
  modelSelection: ModelSelection,
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode,
  branch: Schema.NullOr(TrimmedNonEmptyString),
  worktreePath: Schema.NullOr(TrimmedNonEmptyString),
  messages: Schema.Array(ThreadContinuationMessage).check(
    Schema.isMaxLength(THREAD_CONTINUATION_MAX_MESSAGES),
  ),
});
export type ThreadContinuationInput = typeof ThreadContinuationInput.Type;

export const ThreadContinuationResult = Schema.Struct({ threadId: ThreadId });
export type ThreadContinuationResult = typeof ThreadContinuationResult.Type;

export class ThreadContinuationError extends Schema.TaggedError<ThreadContinuationError>()(
  "ThreadContinuationError",
  { detail: TrimmedNonEmptyString },
) {
  override get message(): string {
    return `Could not continue the thread: ${this.detail}`;
  }
}
