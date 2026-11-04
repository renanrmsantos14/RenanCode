import * as Schema from "effect/Schema";

import { ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const CacheKeepWarmInput = Schema.Struct({
  threadId: ThreadId,
  action: Schema.Literals(["status", "start", "stop"]),
  /** Used by `start`; the server clamps it to the maximum. */
  hours: Schema.optional(Schema.Number),
});
export type CacheKeepWarmInput = typeof CacheKeepWarmInput.Type;

export const CacheKeepWarmStatus = Schema.Struct({
  active: Schema.Boolean,
  /** ISO time the keep-warm stops; null when inactive. */
  deadlineAt: Schema.NullOr(Schema.String),
  pings: Schema.Number,
});
export type CacheKeepWarmStatus = typeof CacheKeepWarmStatus.Type;

export const ThreadHandoffInput = Schema.Struct({ threadId: ThreadId });
export type ThreadHandoffInput = typeof ThreadHandoffInput.Type;

export const ThreadHandoffResult = Schema.Struct({ threadId: ThreadId });
export type ThreadHandoffResult = typeof ThreadHandoffResult.Type;

export class ThreadHandoffError extends Schema.TaggedError<ThreadHandoffError>()(
  "ThreadHandoffError",
  { detail: TrimmedNonEmptyString },
) {
  override get message(): string {
    return `Thread handoff failed: ${this.detail}`;
  }
}

export const EstimateInputCostInput = Schema.Struct({
  model: Schema.String,
  tokens: Schema.Number,
});
export type EstimateInputCostInput = typeof EstimateInputCostInput.Type;

/** Estimated USD to read `tokens` as fresh input; null when the model has no known rate. */
export const EstimateInputCostResult = Schema.Struct({
  costUsd: Schema.NullOr(Schema.Number),
});
export type EstimateInputCostResult = typeof EstimateInputCostResult.Type;
