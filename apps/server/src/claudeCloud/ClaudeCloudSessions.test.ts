import { describe, expect, it } from "@effect/vitest";
import type { OrchestrationProjectShell } from "@t3tools/contracts";

import {
  cloudMessages,
  cloudSessionRepository,
  isMirroredCloudSession,
  projectForRepository,
  type CloudSession,
} from "./ClaudeCloudSessions.ts";

const session = (overrides: Partial<CloudSession> = {}): CloudSession => ({
  id: "session_1",
  created_at: "2026-11-05T10:00:00Z",
  environment_kind: "anthropic_cloud",
  status: "active",
  config: { sources: [{ type: "git_repository", url: "https://github.com/Owner/Repo.git" }] },
  ...overrides,
});

describe("Claude cloud session mirroring", () => {
  it("skips Remote Control bridges but keeps archived sessions so the archive syncs", () => {
    expect(isMirroredCloudSession(session())).toBe(true);
    expect(isMirroredCloudSession(session({ environment_kind: "bridge" }))).toBe(false);
    expect(isMirroredCloudSession(session({ status: "archived" }))).toBe(true);
  });

  it("matches the session repository to a project case-insensitively", () => {
    const repository = cloudSessionRepository(session());
    expect(repository).toEqual({ owner: "owner", name: "repo" });
    expect(cloudSessionRepository(session({ config: { sources: [] } }))).toBeNull();
    const project = (
      id: string,
      remoteUrl: string,
      originUrl?: string,
      archivedAt: string | null = null,
    ) =>
      ({
        id,
        archivedAt,
        repositoryIdentity: {
          locator: { remoteUrl },
          ...(originUrl === undefined ? {} : { origin: { remoteUrl: originUrl } }),
        },
      }) as unknown as OrchestrationProjectShell;
    expect(
      projectForRepository(
        [
          project("archived", "git@github.com:OWNER/repo.git", undefined, "2026-01-01T00:00:00Z"),
          project("other", "https://github.com/someone/else"),
          project("live", "https://github.com/owner/repo"),
        ],
        repository!,
      )?.id,
    ).toBe("live");
    // A fork's identity points at upstream; the session runs on the fork's origin.
    expect(
      projectForRepository(
        [project("fork", "https://github.com/upstream/repo", "https://github.com/Owner/Repo.git")],
        repository!,
      )?.id,
    ).toBe("fork");
  });

  it("keeps user prompts and assistant text, not tool traffic or subagents", () => {
    const event = (sequence: number, payload: unknown) => ({
      sequence_num: String(sequence),
      created_at: "2026-11-05T10:00:00Z",
      payload,
    });
    const messages = cloudMessages([
      event(1, { type: "user", uuid: "sent-from-t3", message: { content: "Fix the bug" } }),
      event(2, {
        type: "assistant",
        message: {
          content: [
            { type: "thinking", thinking: "hmm" },
            { type: "text", text: "On it." },
            { type: "tool_use", id: "t1" },
          ],
        },
      }),
      event(3, { type: "user", message: { content: [{ type: "tool_result", content: "ok" }] } }),
      event(4, { type: "assistant", parent_tool_use_id: "t1", message: { content: "sub" } }),
      event(5, { type: "system", subtype: "init" }),
    ]);
    expect(
      messages.map(({ sequence, uuid, role, text }) => ({ sequence, uuid, role, text })),
    ).toEqual([
      { sequence: "1", uuid: "sent-from-t3", role: "user", text: "Fix the bug" },
      { sequence: "2", uuid: null, role: "assistant", text: "On it." },
    ]);
  });
});
