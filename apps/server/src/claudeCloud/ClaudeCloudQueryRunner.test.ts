import { describe, expect, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { ClaudeAgentSdkQueryRunnerShape } from "../orchestration-v2/Adapters/ClaudeAdapterV2.ts";
import {
  forCloudVm,
  isCanUseToolRequest,
  isClaudeSdkFrame,
  routeClaudeQueryRunner,
  sentFileImages,
  withNativeSessionId,
  withSentFileImages,
} from "./ClaudeCloudQueryRunner.ts";

describe("Claude cloud query runner", () => {
  it("forwards SDK frames and drops the cloud's own housekeeping", () => {
    expect(isClaudeSdkFrame({ type: "assistant", message: {} })).toBe(true);
    expect(isClaudeSdkFrame({ type: "result", subtype: "success" })).toBe(true);
    expect(isClaudeSdkFrame({ type: "env_manager_log" })).toBe(false);
    expect(isClaudeSdkFrame({ type: "autocompact_state" })).toBe(false);
    expect(isClaudeSdkFrame({ type: "control_request" })).toBe(false);
    expect(isClaudeSdkFrame(null)).toBe(false);
    const init = { type: "system", subtype: "init", session_id: "cli-uuid" } as never;
    expect(withNativeSessionId(init, "native-1")).toMatchObject({ session_id: "native-1" });
    expect(withNativeSessionId(init, "cli-uuid")).toBe(init);
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

  it("sends images inline without the local path the cloud VM cannot read", () => {
    const image = {
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "iVBOR" },
    } as const;
    const message = forCloudVm({
      type: "user",
      parent_tool_use_id: null,
      message: {
        role: "user",
        content: [
          image,
          {
            type: "text",
            text: 'olha isso\n\n[Attached image "tela.png" is saved at: /home/renan/.t3/userdata/attachments/a.png]',
          },
        ],
      },
    });
    expect(message.message.content).toEqual([
      image,
      {
        type: "text",
        text: 'olha isso\n\n[Attached image "tela.png" is included in this message.]',
      },
    ]);
  });

  it("tells the cloud VM the account's reply language, except on slash commands", () => {
    const user = (content: string) =>
      ({
        type: "user",
        parent_tool_use_id: null,
        message: { role: "user", content },
      }) as const;
    expect(forCloudVm(user("oi"), "português").message.content).toEqual([
      { type: "text", text: "oi" },
      { type: "text", text: "<system-reminder>Always respond in português.</system-reminder>" },
    ]);
    expect(forCloudVm(user("/compact"), "português").message.content).toBe("/compact");
    expect(forCloudVm(user("/home/x.ts falha"), "português").message.content).toHaveLength(2);
    expect(forCloudVm(user("oi")).message.content).toBe("oi");
    const blockCommand: Parameters<typeof forCloudVm>[0] = {
      type: "user",
      parent_tool_use_id: null,
      message: { role: "user", content: [{ type: "text", text: "/review" }] },
    };
    expect(forCloudVm(blockCommand, "português").message.content).toEqual([
      { type: "text", text: "/review" },
    ]);
  });

  it("adds the images a SendUserFile call sent to its tool result", () => {
    const frame = {
      type: "user",
      parent_tool_use_id: null,
      session_id: "s",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t1", content: "Sent 2 files" }],
      },
      tool_use_result: {
        attachments: [{ file_uuid: "f1", isImage: true, media_type: "image/png", size: 10 }],
      },
    } as unknown as Parameters<typeof sentFileImages>[0];
    const withAlso = (attachment: object) =>
      ({
        ...frame,
        tool_use_result: {
          attachments: [
            { file_uuid: "f1", isImage: true, media_type: "image/png", size: 10 },
            attachment,
          ],
        },
      }) as typeof frame;
    expect(
      sentFileImages(withAlso({ file_uuid: "f2", media_type: "image/png", size: 50_000_000 })),
    ).toEqual([]);
    expect(
      sentFileImages(withAlso({ file_uuid: "f3", isImage: false, media_type: "text/plain" })),
    ).toEqual([]);
    const images = sentFileImages(frame);
    expect(images).toEqual([{ fileUuid: "f1", mediaType: "image/png" }]);
    const withImages = withSentFileImages(
      frame,
      images.map((image) => ({ ...image, base64: "iVBOR" })),
    );
    expect(withImages.type === "user" && withImages.message.content).toEqual([
      {
        type: "tool_result",
        tool_use_id: "t1",
        content: [
          { type: "text", text: "Sent 2 files" },
          { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBOR" } },
        ],
      },
    ]);
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
