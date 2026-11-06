// @effect-diagnostics nodeBuiltinImport:off -- an exclusive copy has no Effect FileSystem equivalent.
import * as NodeFSP from "node:fs/promises";
import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  parseThreadSegmentFromAttachmentId,
  PENDING_ATTACHMENT_THREAD_SEGMENT,
  resolveAttachmentPathById,
} from "../attachmentStore.ts";
import * as ServerConfig from "../config.ts";
import { deletePendingAttachment } from "./AttachmentUpload.ts";

const MAX_COLLISION_SUFFIX = 1000;

const failure = (code: OrchestratorMcpFailure["code"], message: string) =>
  new OrchestratorMcpFailure({ code, message });

/** The last path segment of `fileName` with characters a filesystem rejects replaced. */
export const downloadFileName = (fileName: string) => {
  const base = (fileName.split(/[\\/]/).pop() ?? "")
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "_")
    .trim()
    .replace(/[. ]+$/, "");
  return base === "" ? "file" : base;
};

/** Copies without replacing: false when `target` already exists. */
const copyIfAbsent = (source: string, target: string) =>
  Effect.tryPromise({
    try: () => NodeFSP.copyFile(source, target, NodeFSP.constants.COPYFILE_EXCL).then(() => true),
    catch: (cause) =>
      cause instanceof Error && "code" in cause && cause.code === "EEXIST"
        ? ("exists" as const)
        : ("failed" as const),
  }).pipe(
    Effect.catch((reason) =>
      reason === "exists"
        ? Effect.succeed(false)
        : Effect.fail(failure("orchestration_error", "The file could not be saved to Downloads.")),
    ),
  );

/** Moves a pending upload into `<home>/Downloads` under a name that is not taken, and returns its path. */
export const saveToDownloads = Effect.fn("SaveToDownloads.save")(function* (
  attachmentId: string,
  fileName: string,
) {
  if (parseThreadSegmentFromAttachmentId(attachmentId) !== PENDING_ATTACHMENT_THREAD_SEGMENT) {
    return yield* failure("invalid_request", "Only a pending upload can be saved to Downloads.");
  }
  const config = yield* ServerConfig.ServerConfig;
  const source = resolveAttachmentPathById({ attachmentsDir: config.attachmentsDir, attachmentId });
  if (source === null) {
    return yield* failure("invalid_request", "The pending upload was not found. Upload it first.");
  }
  const path = yield* Path.Path;
  const fileSystem = yield* FileSystem.FileSystem;
  const directory = path.join(yield* HostProcess.HomeDirectory, "Downloads");
  yield* fileSystem
    .makeDirectory(directory, { recursive: true })
    .pipe(
      Effect.mapError(() =>
        failure("orchestration_error", "The Downloads folder could not be created."),
      ),
    );

  const name = downloadFileName(fileName);
  const extension = path.extname(name);
  const stem = name.slice(0, name.length - extension.length);
  for (let attempt = 0; attempt <= MAX_COLLISION_SUFFIX; attempt++) {
    const target = path.join(directory, attempt === 0 ? name : `${stem} (${attempt})${extension}`);
    if (yield* copyIfAbsent(source, target)) {
      yield* deletePendingAttachment(attachmentId);
      return target;
    }
  }
  return yield* failure(
    "orchestration_error",
    "Downloads already holds too many copies of that name.",
  );
});
