import * as Schema from "effect/Schema";

import { ThreadId } from "./baseSchemas.ts";

export const NextActionSuggestionInput = Schema.Struct({
  threadId: ThreadId,
});
export type NextActionSuggestionInput = typeof NextActionSuggestionInput.Type;

/** An empty suggestion means there is nothing useful to suggest. */
export const NextActionSuggestionResult = Schema.Struct({
  suggestion: Schema.String,
});
export type NextActionSuggestionResult = typeof NextActionSuggestionResult.Type;
