import type { ArchivedSnapshotEntry } from "@t3tools/client-runtime/state/threads";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { expect, it } from "vite-plus/test";

import { makeRawThreadShell } from "../../test-fixtures";
import { archivedThreadCopies, buildArchivedThreadGroups } from "./archivedThreadList";

const projectId = ProjectId.make("project-test");
const cloudThreadId = ThreadId.make("claude-cloud:session");
const archivedAt = DateTime.makeUnsafe("2026-11-01T00:00:00.000Z");

function entry(environment: string): ArchivedSnapshotEntry {
  return {
    environmentId: EnvironmentId.make(environment),
    snapshot: {
      schemaVersion: 1,
      snapshotSequence: 1,
      projects: [
        {
          id: projectId,
          title: "Project",
          workspaceRoot: "/workspaces/project",
          defaultModelSelection: null,
          scripts: [],
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
      ],
      threads: [
        makeRawThreadShell({ id: cloudThreadId, archivedAt }),
        makeRawThreadShell({ id: ThreadId.make(`local-${environment}`), archivedAt }),
      ],
    },
  };
}

it("lists an archived cloud session once across environments, and on each one filtered to", () => {
  const snapshots = [entry("env-desktop"), entry("env-notebook")];
  const listed = (environmentId: EnvironmentId | null) =>
    buildArchivedThreadGroups({
      snapshots,
      environmentLabels: {},
      environmentId,
      searchQuery: "",
      sortOrder: "newest",
    }).flatMap((group) => group.threads.map((thread) => `${thread.environmentId}:${thread.id}`));

  expect(listed(null).toSorted()).toEqual([
    "env-desktop:claude-cloud:session",
    "env-desktop:local-env-desktop",
    "env-notebook:local-env-notebook",
  ]);
  expect(listed(EnvironmentId.make("env-notebook")).toSorted()).toEqual([
    "env-notebook:claude-cloud:session",
    "env-notebook:local-env-notebook",
  ]);

  const [cloudSession, localThread] = buildArchivedThreadGroups({
    snapshots,
    environmentLabels: {},
    environmentId: EnvironmentId.make("env-notebook"),
    searchQuery: "",
    sortOrder: "newest",
  })
    .flatMap((group) => group.threads)
    .toSorted((left, right) => left.id.localeCompare(right.id));
  expect(
    archivedThreadCopies(snapshots, cloudSession!).map((thread) => thread.environmentId),
  ).toEqual(["env-desktop", "env-notebook"]);
  expect(archivedThreadCopies(snapshots, localThread!)).toEqual([localThread]);
});
