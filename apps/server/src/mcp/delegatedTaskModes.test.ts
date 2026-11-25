import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { resolveInteractionMode } from "./delegatedTaskModes.ts";

it.effect("a child of a Design thread starts in the default mode unless it asks for Design", () =>
  Effect.gen(function* () {
    expect(yield* resolveInteractionMode("design", undefined)).toBe("default");
    expect(yield* resolveInteractionMode("design", "inherit")).toBe("default");
    expect(yield* resolveInteractionMode("design", "design")).toBe("design");
    expect(yield* resolveInteractionMode("plan", "inherit")).toBe("plan");
  }),
);
