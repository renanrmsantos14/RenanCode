import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  OrchestratorMcpFailure,
  PROVIDER_SEND_TURN_MAX_FILE_BYTES,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

import * as ServerConfig from "../config.ts";
import * as McpInvocationContext from "../mcp/McpInvocationContext.ts";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import * as ProjectService from "../project/ProjectService.ts";
import * as PeerFileTransfer from "./PeerFileTransfer.ts";
import * as PeerForwarding from "./PeerForwarding.ts";
import * as PeerLinks from "./PeerLinks.ts";

const here = EnvironmentId.make("environment-here");
const there = EnvironmentId.make("environment-there");
const scope: McpInvocationContext.McpInvocationScope = {
  environmentId: here,
  requestNamespace: "provider-session:sender",
  thread: {
    threadId: ThreadId.make("thread:sender"),
    providerSessionId: "provider-session:sender",
    providerInstanceId: ProviderInstanceId.make("codex"),
  },
  client: undefined,
  capabilities: new Set(["orchestration"]),
  issuedAt: 1,
};

/** The peer answers each forwarded tool as a healthy environment would; the upload answers `status`. */
const makeTransfer = (uploadStatus: number) => {
  const forwarded: Array<string> = [];
  const uploads: Array<{ readonly url: string; readonly bytes: number | undefined }> = [];
  const layer = PeerFileTransfer.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.mock(PeerForwarding.PeerForwarding)({
          call: ((_scope: unknown, tool: { readonly name: string }) => {
            forwarded.push(tool.name);
            return Effect.succeed(
              tool.name === "t3_attachment_prepare_upload"
                ? {
                    attachmentId: "pending_a",
                    relativeUrl: "/api/attachments/upload/x.y",
                    expiresAt: 1,
                  }
                : tool.name === "t3_attachment_save_to_downloads"
                  ? { path: "/home/there/Downloads/note.txt" }
                  : {},
            );
          }) as never,
        }),
        Layer.mock(PeerLinks.PeerLinks)({
          resolve: () => Effect.succeed({ url: "http://peer.test", token: "secret" } as never),
        }),
        Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make((request) =>
            Effect.sync(() => {
              uploads.push({
                url: request.url,
                bytes: request.body._tag === "Stream" ? request.body.contentLength : undefined,
              });
              return HttpClientResponse.fromWeb(
                request,
                new Response(null, { status: uploadStatus }),
              );
            }),
          ),
        ),
        Layer.mock(ThreadManagement.ThreadManagementService)({
          getThreadShell: () => Effect.succeed(null),
        }),
        Layer.mock(ProjectService.ProjectService)({}),
      ),
    ),
    Layer.provideMerge(ServerConfig.layerTest(process.cwd(), { prefix: "t3-file-transfer-" })),
    Layer.provideMerge(NodeServices.layer),
  );
  return { forwarded, uploads, layer };
};

const send = (path: string, toEnvironmentId = there) =>
  PeerFileTransfer.PeerFileTransfer.use((transfer) =>
    transfer.send(scope, { toEnvironmentId, path }),
  );

it.effect("sends a file's exact size to the peer's Downloads and reports where it landed", () => {
  const transfer = makeTransfer(204);
  return Effect.scoped(
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const dir = yield* fileSystem.makeTempDirectoryScoped();
      yield* fileSystem.writeFileString(`${dir}/note.txt`, "hello");

      expect(yield* send(`${dir}/note.txt`)).toEqual({
        environmentId: there,
        path: "/home/there/Downloads/note.txt",
        sizeBytes: 5,
      });
      expect(transfer.forwarded).toEqual([
        "t3_attachment_prepare_upload",
        "t3_attachment_save_to_downloads",
      ]);
      expect(transfer.uploads).toEqual([
        { url: "http://peer.test/api/attachments/upload/x.y", bytes: 5 },
      ]);
    }),
  ).pipe(Effect.provide(transfer.layer));
});

it.effect("discards the peer's pending upload when the bytes are refused", () => {
  const transfer = makeTransfer(500);
  return Effect.scoped(
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const dir = yield* fileSystem.makeTempDirectoryScoped();
      yield* fileSystem.writeFileString(`${dir}/note.txt`, "hello");

      const failure = yield* send(`${dir}/note.txt`).pipe(Effect.flip);
      expect(failure).toBeInstanceOf(OrchestratorMcpFailure);
      expect(transfer.forwarded).toEqual(["t3_attachment_prepare_upload", "t3_attachment_discard"]);
    }),
  ).pipe(Effect.provide(transfer.layer));
});

it.effect("refuses what it must not send before the peer hears of it", () => {
  const transfer = makeTransfer(204);
  return Effect.scoped(
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const config = yield* ServerConfig.ServerConfig;
      const dir = yield* fileSystem.makeTempDirectoryScoped();
      yield* fileSystem.writeFileString(`${dir}/big.bin`, "x");
      yield* fileSystem.truncate(`${dir}/big.bin`, PROVIDER_SEND_TURN_MAX_FILE_BYTES + 1);
      yield* fileSystem.makeDirectory(config.secretsDir, { recursive: true });
      yield* fileSystem.writeFileString(`${config.secretsDir}/key`, "secret");

      for (const path of [dir, `${dir}/big.bin`, `${config.secretsDir}/key`, "relative.txt"]) {
        expect(yield* send(path).pipe(Effect.flip)).toBeInstanceOf(OrchestratorMcpFailure);
      }
      expect(yield* send(`${dir}/big.bin`, here).pipe(Effect.flip)).toMatchObject({
        message: "That is this environment. Pick a linked one.",
      });
      expect(transfer.forwarded).toEqual([]);
    }),
  ).pipe(Effect.provide(transfer.layer));
});
