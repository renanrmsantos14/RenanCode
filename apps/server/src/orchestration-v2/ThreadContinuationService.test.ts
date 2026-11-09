import { expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  THREAD_CONTINUATION_MAX_TEXT_BYTES,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ProjectService from "../project/ProjectService.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as ProviderInstanceRegistry from "../provider/ProviderInstanceRegistry.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as EventSink from "./EventSink.ts";
import * as EventStore from "./EventStore.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as ThreadContinuationService from "./ThreadContinuationService.ts";

const projectId = ProjectId.make("continuation-project");
const threadId = ThreadId.make("continued-thread");
const source = {
  environmentId: EnvironmentId.make("offline-machine"),
  threadId: ThreadId.make("original-thread"),
};
const timestamp = "2026-11-01T10:00:00.000Z";
const stores = Layer.mergeAll(EventStore.layer, ProjectionStore.layer).pipe(
  Layer.provideMerge(SqlitePersistence.layerMemory),
);

const input = {
  threadId,
  projectId,
  source,
  title: "Fix the build",
  modelSelection: { instanceId: ProviderInstanceId.make("gone"), model: "some-model" },
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: "feature/x",
  worktreePath: null,
  messages: [
    { role: "user", text: "Fix it", createdAt: "2026-11-01T09:00:00.000Z" },
    { role: "assistant", text: "Fixed", createdAt: "2026-11-01T09:01:00.000Z" },
    { role: "user", text: "Thanks", createdAt: "2026-11-01T09:02:00.000Z" },
  ],
} as const;

const persistence = Layer.mergeAll(stores, EventSink.layer.pipe(Layer.provide(stores)));

const makeService = Effect.gen(function* () {
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const service = yield* ThreadContinuationService.make.pipe(
    Effect.provide(
      Layer.mergeAll(
        Layer.succeed(EventSink.EventSinkV2, yield* EventSink.EventSinkV2),
        ServerSettings.layerTest(),
        Layer.mock(ProviderInstanceRegistry.ProviderInstanceRegistry)({
          getInstance: () => Effect.undefined,
        }),
        Layer.mock(ProjectService.ProjectService)({
          getById: () =>
            Effect.succeedSome({
              id: projectId,
              title: "Project",
              workspaceRoot: "/workspace/project",
              defaultModelSelection: null,
              scripts: [],
              createdAt: timestamp,
              updatedAt: timestamp,
              deletedAt: null,
            }),
        }),
        Layer.mock(Orchestrator.OrchestratorV2)({
          getThreadRecords: (id, fields) =>
            projections
              .getThreadRecords(id, fields)
              .pipe(
                Effect.mapError(
                  (cause) => new Orchestrator.OrchestratorProjectionError({ threadId: id, cause }),
                ),
              ),
        }),
      ),
    ),
  );
  return { service, projections };
});

it.effect("recreates the history as a v1_import thread that links back to the original", () =>
  Effect.gen(function* () {
    const { service, projections } = yield* makeService;
    expect(yield* service.importContinuation(input)).toEqual({ threadId });
    // A retry lands on the same thread without duplicating the history.
    yield* service.importContinuation(input);

    const records = yield* projections.getThreadRecords(threadId, ["messages", "turnItems"]);
    expect(records.thread).toMatchObject({
      historyOrigin: "v1_import",
      continuedFrom: source,
      branch: "feature/x",
      title: "Fix the build",
    });
    // The missing provider instance falls back to this machine's default.
    expect(records.thread.modelSelection.instanceId).not.toBe("gone");
    expect(records.messages.map((message) => message.text)).toEqual(["Fix it", "Fixed", "Thanks"]);
    // The handoff the first message builds reads exactly the run-less items.
    const handoffItems = (yield* projections.getThreadRecords(threadId, ["turnItems"], {
      turnItemRunIds: [null],
    })).turnItems;
    expect(handoffItems.map((item) => [item.type, item.runId, item.ordinal])).toEqual([
      ["user_message", null, 1],
      ["assistant_message", null, 2],
      ["user_message", null, 3],
    ]);

    const shell = yield* projections.getThreadShell(threadId);
    expect(shell?.continuedFrom).toEqual(source);

    const oversized = yield* service
      .importContinuation({
        ...input,
        threadId: ThreadId.make("oversized-thread"),
        messages: [
          { ...input.messages[0], text: "x".repeat(THREAD_CONTINUATION_MAX_TEXT_BYTES + 1) },
        ],
      })
      .pipe(Effect.flip);
    expect(oversized._tag).toBe("ThreadContinuationError");
  }).pipe(Effect.scoped, Effect.provide(persistence)),
);
