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
  it("skips Remote Control bridges and archived sessions", () => {
    expect(isMirroredCloudSession(session())).toBe(true);
    expect(isMirroredCloudSession(session({ environment_kind: "bridge" }))).toBe(false);
    expect(isMirroredCloudSession(session({ status: "archived" }))).toBe(false);
  });

  it("matches the session repository to a project case-insensitively", () => {
    const repository = cloudSessionRepository(session());
    expect(repository).toEqual({ owner: "owner", name: "repo" });
    expect(cloudSessionRepository(session({ config: { sources: [] } }))).toBeNull();
    const project = (id: string, owner: string, archivedAt: string | null = null) =>
      ({
        id,
        archivedAt,
        repositoryIdentity: { owner, name: "repo" },
      }) as unknown as OrchestrationProjectShell;
    expect(
      projectForRepository(
        [project("archived", "OWNER", "2026-01-01T00:00:00Z"), project("live", "OWNER")],
        repository!,
      )?.id,
    ).toBe("live");
  });

  it("keeps user prompts and assistant text, not tool traffic or subagents", () => {
    const event = (sequence: number, payload: unknown) => ({
      sequence_num: String(sequence),
      created_at: "2026-11-05T10:00:00Z",
      payload,
    });
    const messages = cloudMessages([
      event(1, { type: "user", message: { content: "Fix the bug" } }),
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
    expect(messages.map(({ sequence, role, text }) => ({ sequence, role, text }))).toEqual([
      { sequence: "1", role: "user", text: "Fix the bug" },
      { sequence: "2", role: "assistant", text: "On it." },
    ]);
  });
});
