import { describe, expect, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { ClaudeAgentSdkQueryRunnerShape } from "../orchestration-v2/Adapters/ClaudeAdapterV2.ts";
import {
  isCanUseToolRequest,
  isClaudeSdkFrame,
  routeClaudeQueryRunner,
} from "./ClaudeCloudQueryRunner.ts";

describe("Claude cloud query runner", () => {
  it("forwards SDK frames and drops the cloud's own housekeeping", () => {
    expect(isClaudeSdkFrame({ type: "assistant", message: {} })).toBe(true);
    expect(isClaudeSdkFrame({ type: "result", subtype: "success" })).toBe(true);
    expect(isClaudeSdkFrame({ type: "env_manager_log" })).toBe(false);
    expect(isClaudeSdkFrame({ type: "autocompact_state" })).toBe(false);
    expect(isClaudeSdkFrame({ type: "control_request" })).toBe(false);
    expect(isClaudeSdkFrame(null)).toBe(false);
  });

  it("answers only tool permission requests", () => {
    const request = (subtype: string) => ({
      type: "control_request",
      request_id: "req-1",
      request: { subtype, tool_name: "Bash", input: { command: "ls" } },
    });
    expect(isCanUseToolRequest(request("can_use_tool"))).toBe(true);
    expect(isCanUseToolRequest(request("interrupt"))).toBe(false);
    expect(isCanUseToolRequest({ type: "control_request", request: {} })).toBe(false);
  });

  it.effect("opens cloud threads on the cloud runner and others locally", () =>
    Effect.gen(function* () {
      const opened: Array<string> = [];
      const runner = (name: string) =>
        ({
          open: () => Effect.sync(() => opened.push(name)),
        }) as unknown as ClaudeAgentSdkQueryRunnerShape;
      const routed = routeClaudeQueryRunner(runner("local"), runner("cloud"));
      const open = (threadId: string) =>
        routed.open({
          threadId: ThreadId.make(threadId),
        } as Parameters<ClaudeAgentSdkQueryRunnerShape["open"]>[0]);
      yield* open("claude-cloud:cse_1");
      yield* open("thread-local");
      expect(opened).toEqual(["cloud", "local"]);
    }),
  );
});
