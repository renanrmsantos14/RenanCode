import {
  type EnvironmentId,
  OrchestratorMcpFailure,
  PROVIDER_SEND_TURN_MAX_FILE_BYTES,
  type PeerLinkError,
} from "@t3tools/contracts";
import { expandHomePath } from "@t3tools/provider-core/server/pathExpansion";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as HttpBody from "effect/http/HttpBody";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

import { makeIsServerInternalPath } from "../auth/serverInternalPaths.ts";
import * as McpInvocationContext from "../mcp/McpInvocationContext.ts";
import {
  AttachmentDiscardTool,
  AttachmentSaveToDownloadsTool,
  AttachmentUploadTool,
} from "../mcp/toolkits/attachment/tools.ts";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import * as ProjectService from "../project/ProjectService.ts";
import { threadWorkspaceRoot } from "../project/threadWorkspaceRoot.ts";
import { downloadFileName } from "../assets/SaveToDownloads.ts";
import * as PeerForwarding from "./PeerForwarding.ts";
import * as PeerLinks from "./PeerLinks.ts";

type Scope = McpInvocationContext.McpInvocationScope;

const failure = (code: OrchestratorMcpFailure["code"], message: string) =>
  new OrchestratorMcpFailure({ code, message });

const fromLinkError = (error: PeerLinkError) =>
  failure(
    error.reason === "unknown_link"
      ? "invalid_request"
      : error.reason === "expired" || error.reason === "incompatible"
        ? "capability_denied"
        : "orchestration_error",
    error.message,
  );

/** Sends a file from this environment's disk to the Downloads folder of a linked environment. */
export class PeerFileTransfer extends Context.Service<
  PeerFileTransfer,
  {
    readonly send: (
      scope: Scope,
      input: { readonly toEnvironmentId: EnvironmentId; readonly path: string },
    ) => Effect.Effect<
      { readonly environmentId: EnvironmentId; readonly path: string; readonly sizeBytes: number },
      OrchestratorMcpFailure
    >;
  }
>()("t3/peer/PeerFileTransfer") {}

const make = Effect.gen(function* () {
  const forwarding = yield* PeerForwarding.PeerForwarding;
  const links = yield* PeerLinks.PeerLinks;
  const http = yield* HttpClient.HttpClient;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const isServerInternalPath = yield* makeIsServerInternalPath;
  const threads = yield* ThreadManagement.ThreadManagementService;
  const projects = yield* ProjectService.ProjectService;

  const resolveFile = Effect.fn("PeerFileTransfer.resolveFile")(function* (
    scope: Scope,
    requested: string,
  ) {
    const expanded = expandHomePath(requested.trim(), yield* HostProcess.HomeDirectory);
    const workspace = path.isAbsolute(expanded)
      ? undefined
      : scope.thread === undefined
        ? undefined
        : yield* threadWorkspaceRoot(scope.thread.threadId).pipe(
            Effect.provideService(ThreadManagement.ThreadManagementService, threads),
            Effect.provideService(ProjectService.ProjectService, projects),
          );
    if (!path.isAbsolute(expanded) && workspace === undefined) {
      return yield* failure(
        "invalid_request",
        "Pass an absolute path: this call has no workspace.",
      );
    }
    const real = yield* fileSystem
      .realPath(workspace === undefined ? expanded : path.resolve(workspace, expanded))
      .pipe(Effect.mapError(() => failure("invalid_request", "That file does not exist.")));
    const info = yield* fileSystem
      .stat(real)
      .pipe(Effect.mapError(() => failure("invalid_request", "That file cannot be read.")));
    if (info.type !== "File") return yield* failure("invalid_request", "Only a file can be sent.");
    if (yield* isServerInternalPath(real)) {
      return yield* failure("capability_denied", "That file belongs to T3 Code's own state.");
    }
    const sizeBytes = Number(info.size);
    if (sizeBytes < 1) return yield* failure("invalid_request", "That file is empty.");
    if (sizeBytes > PROVIDER_SEND_TURN_MAX_FILE_BYTES) {
      return yield* failure("invalid_request", "That file is larger than 50 MB.");
    }
    return { real, sizeBytes };
  });

  const pushBytes = Effect.fn("PeerFileTransfer.pushBytes")(function* (
    environmentId: EnvironmentId,
    relativeUrl: string,
    file: string,
    sizeBytes: number,
  ) {
    const resolved = yield* links.resolve(environmentId).pipe(Effect.mapError(fromLinkError));
    // The signed URL is the credential, so no bearer travels with the bytes.
    const response = yield* http
      .execute(
        HttpClientRequest.post(`${resolved.url}${relativeUrl}`).pipe(
          HttpClientRequest.setBody(
            HttpBody.stream(fileSystem.stream(file), "application/octet-stream", sizeBytes),
          ),
        ),
      )
      .pipe(
        Effect.mapError(() =>
          failure("orchestration_error", "The linked environment could not be reached."),
        ),
      );
    if (response.status !== 204) {
      return yield* failure(
        "orchestration_error",
        `The linked environment refused the upload (HTTP ${response.status}).`,
      );
    }
  });

  const send: PeerFileTransfer["Service"]["send"] = Effect.fn("PeerFileTransfer.send")(
    function* (scope, input) {
      if (input.toEnvironmentId === scope.environmentId) {
        return yield* failure("invalid_request", "That is this environment. Pick a linked one.");
      }
      const { real, sizeBytes } = yield* resolveFile(scope, input.path);
      const name = downloadFileName(path.basename(real));
      const prepared = yield* forwarding.call(scope, AttachmentUploadTool, input.toEnvironmentId, {
        upload: { type: "file", name, mimeType: "application/octet-stream", sizeBytes },
      });
      const saved = yield* pushBytes(
        input.toEnvironmentId,
        prepared.relativeUrl,
        real,
        sizeBytes,
      ).pipe(
        Effect.andThen(() =>
          forwarding.call(scope, AttachmentSaveToDownloadsTool, input.toEnvironmentId, {
            attachmentId: prepared.attachmentId,
            fileName: name,
          }),
        ),
        Effect.tapError(() =>
          forwarding
            .call(scope, AttachmentDiscardTool, input.toEnvironmentId, {
              attachmentId: prepared.attachmentId,
            })
            .pipe(Effect.ignore),
        ),
      );
      return { environmentId: input.toEnvironmentId, path: saved.path, sizeBytes };
    },
  );

  return PeerFileTransfer.of({ send });
});

export const layer = Layer.effect(PeerFileTransfer, make);
