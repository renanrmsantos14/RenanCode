import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { assert, it } from "@effect/vitest";
import {
  type OrchestrationV2ThreadShell,
  ProjectId,
  ThreadId,
  type WorkModuleError,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";

import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as WorkModuleService from "./WorkModuleService.ts";

const app = ProjectId.make("project:app");
const site = ProjectId.make("project:site");
const threadInApp = ThreadId.make("thread:app");
const threadInSite = ThreadId.make("thread:site");

// Only projectId and deletedAt are read by the service.
const shell = (projectId: ProjectId) =>
  ({ projectId, deletedAt: null }) as unknown as OrchestrationV2ThreadShell;

const shells: Record<string, OrchestrationV2ThreadShell> = {
  [threadInApp]: shell(app),
  [threadInSite]: shell(site),
};

const layer = WorkModuleService.layer.pipe(
  Layer.provide(
    Layer.mergeAll(
      NodeCrypto.layer,
      Layer.mock(ThreadManagementService.ThreadManagementService)({
        getThreadShell: (threadId) => Effect.succeed(shells[threadId] ?? null),
      }),
    ),
  ),
  Layer.provideMerge(SqlitePersistence.layerMemory),
);

const withService = <A>(
  body: (
    service: WorkModuleService.WorkModuleService["Service"],
  ) => Effect.Effect<A, WorkModuleError>,
) =>
  Effect.gen(function* () {
    return yield* body(yield* WorkModuleService.WorkModuleService);
  }).pipe(Effect.provide(layer));

it.effect("creates modules as ideas appended after their siblings", () =>
  withService((service) =>
    Effect.gen(function* () {
      const a = yield* service.upsert({ projectId: app, title: "Usage" });
      const b = yield* service.upsert({ projectId: app, title: "Chat" });
      const child = yield* service.upsert({ projectId: app, parentId: a.id, title: "Meter" });
      assert.strictEqual(a.status, "idea");
      assert.deepStrictEqual([a.position, b.position, child.position], [0, 1, 0]);
      assert.strictEqual(child.parentId, a.id);
    }),
  ),
);

it.effect("requires a reason for waiting and clears it when leaving waiting", () =>
  withService((service) =>
    Effect.gen(function* () {
      const m = yield* service.upsert({ projectId: app, title: "Domain" });
      const refused = yield* service
        .upsert({ id: m.id, projectId: app, status: "waiting" })
        .pipe(Effect.flip);
      assert.strictEqual(refused.message, "A waiting module needs a reason.");
      const waiting = yield* service.upsert({
        id: m.id,
        projectId: app,
        status: "waiting",
        waitingReason: "DNS from client",
      });
      assert.strictEqual(waiting.waitingReason, "DNS from client");
      const active = yield* service.upsert({ id: m.id, projectId: app, status: "active" });
      assert.strictEqual(active.waitingReason, null);
    }),
  ),
);

it.effect("moves statusChangedAt only when the status really changes", () =>
  withService((service) =>
    Effect.gen(function* () {
      const m = yield* service.upsert({ projectId: app, title: "Pix" });
      yield* TestClock.adjust("1 hour");
      const renamed = yield* service.upsert({ id: m.id, projectId: app, title: "Pix payments" });
      assert.strictEqual(renamed.statusChangedAt, m.statusChangedAt);
      const active = yield* service.upsert({ id: m.id, projectId: app, status: "active" });
      assert.notStrictEqual(active.statusChangedAt, m.statusChangedAt);
      yield* TestClock.adjust("1 hour");
      const same = yield* service.upsert({ id: m.id, projectId: app, status: "active" });
      assert.strictEqual(same.statusChangedAt, active.statusChangedAt);
    }),
  ),
);

it.effect("refuses moving a module under itself or its grandchild, and across projects", () =>
  withService((service) =>
    Effect.gen(function* () {
      const root = yield* service.upsert({ projectId: app, title: "Board" });
      const child = yield* service.upsert({ projectId: app, parentId: root.id, title: "Web" });
      const grandchild = yield* service.upsert({
        projectId: app,
        parentId: child.id,
        title: "Tree",
      });
      const other = yield* service.upsert({ projectId: site, title: "Checkout" });
      for (const parentId of [root.id, grandchild.id]) {
        const error = yield* service.move({ id: root.id, parentId, index: 0 }).pipe(Effect.flip);
        assert.strictEqual(error.message, "A module cannot move inside itself.");
      }
      const across = yield* service
        .move({ id: child.id, parentId: other.id, index: 0 })
        .pipe(Effect.flip);
      assert.strictEqual(across.message, "Modules can only move within their project.");
    }),
  ),
);

it.effect("reorders siblings when moving to an index", () =>
  withService((service) =>
    Effect.gen(function* () {
      const a = yield* service.upsert({ projectId: app, title: "A" });
      const b = yield* service.upsert({ projectId: app, title: "B" });
      const c = yield* service.upsert({ projectId: app, title: "C" });
      yield* service.move({ id: c.id, parentId: null, index: 0 });
      const { modules } = yield* service.snapshot();
      const order = modules
        .filter((m) => m.parentId === null)
        .sort((x, y) => x.position - y.position)
        .map((m) => m.title);
      assert.deepStrictEqual(order, ["C", "A", "B"]);
      assert.ok([a, b].every((m) => m.projectId === app));
    }),
  ),
);

it.effect("deletes descendants and their links but keeps the threads' other data", () =>
  withService((service) =>
    Effect.gen(function* () {
      const root = yield* service.upsert({ projectId: app, title: "Board" });
      const child = yield* service.upsert({ projectId: app, parentId: root.id, title: "Web" });
      const keep = yield* service.upsert({ projectId: app, title: "Usage" });
      yield* service.linkThread({ threadId: threadInApp, moduleId: child.id, suggested: false });
      const deleted = yield* service.delete(root.id);
      assert.sameMembers([...deleted], [root.id, child.id]);
      const snapshot = yield* service.snapshot();
      assert.deepStrictEqual(
        snapshot.modules.map((m) => m.id),
        [keep.id],
      );
      assert.lengthOf(snapshot.links, 0);
    }),
  ),
);

it.effect("keeps one module per thread and refuses cross-project links", () =>
  withService((service) =>
    Effect.gen(function* () {
      const a = yield* service.upsert({ projectId: app, title: "A" });
      const b = yield* service.upsert({ projectId: app, title: "B" });
      yield* service.linkThread({ threadId: threadInApp, moduleId: a.id, suggested: false });
      yield* service.linkThread({ threadId: threadInApp, moduleId: b.id, suggested: false });
      const { links } = yield* service.snapshot();
      assert.deepStrictEqual(
        links.map((l) => l.moduleId),
        [b.id],
      );
      const error = yield* service
        .linkThread({ threadId: threadInSite, moduleId: a.id, suggested: false })
        .pipe(Effect.flip);
      assert.strictEqual(error.message, "The thread belongs to another project.");
    }),
  ),
);

it.effect("lets a suggestion replace a suggestion but never a confirmed link", () =>
  withService((service) =>
    Effect.gen(function* () {
      const a = yield* service.upsert({ projectId: app, title: "A" });
      const b = yield* service.upsert({ projectId: app, title: "B" });
      yield* service.linkThread({ threadId: threadInApp, moduleId: a.id, suggested: true });
      yield* service.linkThread({ threadId: threadInApp, moduleId: b.id, suggested: true });
      const confirmed = yield* service.confirmSuggestion(threadInApp);
      assert.strictEqual(confirmed.suggested, false);
      assert.strictEqual(confirmed.moduleId, b.id);
      const refused = yield* service
        .linkThread({ threadId: threadInApp, moduleId: a.id, suggested: true })
        .pipe(Effect.flip);
      assert.strictEqual(
        refused.message,
        "The user already linked this thread; a suggestion cannot replace it.",
      );
    }),
  ),
);

it.effect("appends agent notes without rewriting the note", () =>
  withService((service) =>
    Effect.gen(function* () {
      const m = yield* service.upsert({ projectId: app, title: "A", note: "Mine" });
      const once = yield* service.appendAgentNote({ moduleId: m.id, text: "PR opened" });
      const twice = yield* service.appendAgentNote({ moduleId: m.id, text: "CI green" });
      assert.strictEqual(once.note, "Mine\n1970-01-01 · agent: PR opened");
      assert.strictEqual(
        twice.note,
        "Mine\n1970-01-01 · agent: PR opened\n1970-01-01 · agent: CI green",
      );
    }),
  ),
);

it.effect("refuses an agent note that would overflow the module note", () =>
  withService((service) =>
    Effect.gen(function* () {
      const m = yield* service.upsert({ projectId: app, title: "A", note: "x".repeat(19_990) });
      const error = yield* service
        .appendAgentNote({ moduleId: m.id, text: "this line is too long" })
        .pipe(Effect.flip);
      assert.strictEqual(error.message, "The module note is full; ask the user to trim it.");
      const after = yield* service.upsert({ id: m.id, projectId: app });
      assert.strictEqual(after.note, m.note);
    }),
  ),
);

it.effect("unlinks deleted threads and reports the module of a thread", () =>
  withService((service) =>
    Effect.gen(function* () {
      const m = yield* service.upsert({ projectId: app, title: "A" });
      yield* service.linkThread({ threadId: threadInApp, moduleId: m.id, suggested: false });
      assert.strictEqual((yield* service.moduleForThread(threadInApp))?.module.id, m.id);
      yield* service.unlinkThreads([threadInApp]);
      assert.isNull(yield* service.moduleForThread(threadInApp));
    }),
  ),
);
