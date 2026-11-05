import * as Schema from "effect/Schema";

import { MessageId, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const ClaudeCloudStartSessionInput = Schema.Struct({
  projectId: ProjectId,
  messageId: MessageId,
  text: TrimmedNonEmptyString,
  model: Schema.optional(TrimmedNonEmptyString),
});
export type ClaudeCloudStartSessionInput = typeof ClaudeCloudStartSessionInput.Type;

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
