import * as Schema from "effect/Schema";

import { MessageId, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ProviderInstanceId } from "./providerInstance.ts";

export const ClaudeCloudStartSessionInput = Schema.Struct({
  projectId: ProjectId,
  messageId: MessageId,
  text: TrimmedNonEmptyString,
  model: Schema.optional(TrimmedNonEmptyString),
  /** The Claude provider instance whose claude.ai login owns the session; default when absent. */
  providerInstanceId: Schema.optional(ProviderInstanceId),
  /** Push the branch's local commits first instead of failing with `branch-not-pushed`. */
  pushBranch: Schema.optional(Schema.Boolean),
});
export type ClaudeCloudStartSessionInput = typeof ClaudeCloudStartSessionInput.Type;

export const ClaudeCloudPlacementInput = Schema.Struct({
  projectId: ProjectId,
  text: TrimmedNonEmptyString,
});
export type ClaudeCloudPlacementInput = typeof ClaudeCloudPlacementInput.Type;

/** Where a new task should run. Anything uncertain answers `local`. */
export const ClaudeCloudPlacementResult = Schema.Struct({
  placement: Schema.Literals(["cloud", "local"]),
  reason: Schema.String,
  /** The branch has commits GitHub lacks; starting in the cloud pushes them. */
  pushRequired: Schema.Boolean,
});
export type ClaudeCloudPlacementResult = typeof ClaudeCloudPlacementResult.Type;

export const ClaudeCloudStartSessionResult = Schema.Struct({ threadId: ThreadId });
export type ClaudeCloudStartSessionResult = typeof ClaudeCloudStartSessionResult.Type;

export class ClaudeCloudStartSessionError extends Schema.TaggedError<ClaudeCloudStartSessionError>()(
  "ClaudeCloudStartSessionError",
  {
    /** `branch-not-pushed`: the cloud clones from GitHub, so local commits would be left out. */
    reason: Schema.Literals(["disabled", "not-github", "branch-not-pushed", "unavailable"]),
    detail: TrimmedNonEmptyString,
  },
) {
  override get message(): string {
    return this.detail;
  }
}
