import type { AssetResource, ProjectReadFileError, ScopedThreadRef } from "@t3tools/contracts";
import { mediaFileReference } from "@t3tools/client-runtime/media-reference";
import {
  isHostPath,
  resolveWorkspaceFilePath,
  workspaceRelativeFilePath,
} from "@t3tools/shared/path";

export function resolveFilePreviewPath(path: string | null, cwd: string): string | null {
  if (path === null) return null;
  return path === "." || workspaceRelativeFilePath(path, cwd) === "." ? null : path;
}

export const isMarkdownPreviewFile = (path: string): boolean =>
  /\.(?:md|mdx|markdown|mdown|mkd)$/i.test(path);

export function filePreviewReadErrorMessage(error: ProjectReadFileError): string {
  switch (error.failure) {
    case "path_not_file":
      return "The path is a directory or special file, not a regular file.";
    case "binary_file":
      return "The file is binary and cannot be displayed as text.";
    case "workspace_path_outside_root":
      return "The requested path is outside the workspace.";
    case "resolved_path_outside_root":
      return "The path resolves to a location outside the workspace.";
    case "operation_failed":
      return error.operation === "realpath-workspace-root"
        ? "The workspace folder could not be accessed."
        : "The file could not be accessed or read. It may be missing or inaccessible.";
    default:
      return error.message;
  }
}

/** A relative path the read could not find in `cwd`, which another worktree of the repository may hold. */
export function isMissingRelativeFile(
  relativePath: string,
  readError: ProjectReadFileError | null,
): boolean {
  return (
    !isHostPath(relativePath) &&
    readError?.failure === "operation_failed" &&
    readError.operation === "realpath-target"
  );
}

/** The same path in the repository's other worktrees, keeping `cwd`'s offset inside its own worktree. */
export function worktreeFallbackPaths(
  relativePath: string,
  cwd: string,
  readError: ProjectReadFileError | null,
  refs: ReadonlyArray<{ readonly worktreePath: string | null }>,
): string[] {
  if (!isMissingRelativeFile(relativePath, readError)) return [];
  const roots = [...new Set(refs.flatMap((ref) => (ref.worktreePath ? [ref.worktreePath] : [])))];
  const ownRoot = roots
    .filter(
      (root) => cwd === root || (cwd.startsWith(root) && /^[/\\]/.test(cwd.slice(root.length))),
    )
    .reduce<string | null>(
      (longest, root) => (longest !== null && longest.length >= root.length ? longest : root),
      null,
    );
  const offset = ownRoot === null ? "" : cwd.slice(ownRoot.length);
  return (
    roots
      .filter((root) => root !== ownRoot)
      // filesystem.getMetadata accepts at most 64 paths.
      .slice(0, 64)
      .map((root) => resolveWorkspaceFilePath(relativePath, root + offset))
  );
}

export function shouldShowFileExplorer(input: {
  readonly relativePath: string | null;
  readonly explorerOpen: boolean;
  readonly attachmentOpen: boolean;
}): boolean {
  if (input.attachmentOpen || (input.relativePath && isHostPath(input.relativePath))) {
    return false;
  }
  return input.explorerOpen || input.relativePath === null;
}

/**
 * The server only signs `workspace-file` assets below the workspace root, so a
 * file opened from outside it, such as an absolute link in the thread, goes
 * through the host `media-file` resource the direct media viewer uses.
 */
export function workspaceAssetResource(input: {
  readonly kind: "workspace-file" | "media-file";
  readonly threadRef: ScopedThreadRef;
  readonly draft: boolean;
  readonly workspaceRoot: string;
  readonly absolutePath: string;
}): AssetResource {
  if (input.draft) {
    return { _tag: "draft-workspace-file", cwd: input.workspaceRoot, path: input.absolutePath };
  }
  const insideWorkspace =
    mediaFileReference(input.absolutePath, input.workspaceRoot).relativePath !== undefined;
  return {
    _tag: insideWorkspace ? input.kind : "media-file",
    threadId: input.threadRef.threadId,
    path: input.absolutePath,
  };
}
