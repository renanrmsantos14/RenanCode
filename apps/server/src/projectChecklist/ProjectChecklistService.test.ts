import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { assert, it } from "@effect/vitest";
import { ProjectChecklistItemId, ProjectId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as ProjectChecklistService from "./ProjectChecklistService.ts";

const app = ProjectId.make("project:app");
const site = ProjectId.make("project:site");

const layer = ProjectChecklistService.layer.pipe(
  Layer.provideMerge(SqlitePersistence.layerMemory),
  Layer.provide(NodeCrypto.layer),
);

const withService = <A, E>(
  body: (
    service: ProjectChecklistService.ProjectChecklistService["Service"],
  ) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    return yield* body(yield* ProjectChecklistService.ProjectChecklistService);
  }).pipe(Effect.provide(layer));

const rejects = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.map(Effect.result(effect), (result) => result._tag === "Failure");

it.effect("appends modules and items after their siblings and keeps projects apart", () =>
  withService((service) =>
    Effect.gen(function* () {
      const a = yield* service.upsert({ projectId: app, title: "Release" });
      const b = yield* service.upsert({ projectId: app, title: "Docs", dueDate: "2026-11-30" });
      const first = yield* service.upsert({ projectId: app, parentId: a.id, title: "Tag" });
      const second = yield* service.upsert({ projectId: app, parentId: a.id, title: "Notes" });
      yield* service.upsert({ projectId: site, title: "Other project" });
      assert.deepStrictEqual(
        [a.position, b.position, first.position, second.position],
        [0, 1, 0, 1],
      );
      assert.strictEqual(b.dueDate, "2026-11-30");
      assert.strictEqual(first.parentId, a.id);
      const snapshot = yield* service.snapshot(app);
      assert.deepStrictEqual(snapshot.items.map((item) => item.title).toSorted(), [
        "Docs",
        "Notes",
        "Release",
        "Tag",
      ]);
    }),
  ),
);

it.effect("rejects an item under an item, under a missing module, or under another project", () =>
  withService((service) =>
    Effect.gen(function* () {
      const module = yield* service.upsert({ projectId: app, title: "Release" });
      const item = yield* service.upsert({ projectId: app, parentId: module.id, title: "Tag" });
      assert.isTrue(
        yield* rejects(service.upsert({ projectId: app, parentId: item.id, title: "Nested" })),
      );
      assert.isTrue(
        yield* rejects(
          service.upsert({
            projectId: app,
            parentId: ProjectChecklistItemId.make("checklist-item:missing"),
            title: "Lost",
          }),
        ),
      );
      assert.isTrue(
        yield* rejects(service.upsert({ projectId: site, parentId: module.id, title: "Cross" })),
      );
      assert.isTrue(yield* rejects(service.upsert({ projectId: app })));
      assert.strictEqual((yield* service.snapshot(app)).items.length, 2);
    }),
  ),
);

it.effect("renames, sets and clears the due date without touching the rest", () =>
  withService((service) =>
    Effect.gen(function* () {
      const item = yield* service.upsert({ projectId: app, title: "Tag" });
      const dated = yield* service.upsert({
        id: item.id,
        projectId: app,
        title: "Tag v2",
        dueDate: "2026-12-01",
      });
      assert.strictEqual(dated.title, "Tag v2");
      assert.strictEqual(dated.dueDate, "2026-12-01");
      const kept = yield* service.upsert({ id: item.id, projectId: app, done: true });
      assert.strictEqual(kept.title, "Tag v2");
      assert.strictEqual(kept.dueDate, "2026-12-01");
      const cleared = yield* service.upsert({ id: item.id, projectId: app, dueDate: null });
      assert.strictEqual(cleared.dueDate, null);
      assert.isTrue(cleared.done);
      assert.isTrue(yield* rejects(service.upsert({ id: item.id, projectId: site, title: "x" })));
    }),
  ),
);

it.effect("checking a module checks its items, and unchecking an item unchecks the module", () =>
  withService((service) =>
    Effect.gen(function* () {
      const module = yield* service.upsert({ projectId: app, title: "Release" });
      yield* service.upsert({ projectId: app, parentId: module.id, title: "One" });
      const two = yield* service.upsert({ projectId: app, parentId: module.id, title: "Two" });
      const other = yield* service.upsert({ projectId: app, title: "Other" });
      const stranger = yield* service.upsert({ projectId: app, parentId: other.id, title: "S" });
      const done = (yield* service.snapshot(app)).items;
      assert.isFalse(done.some((item) => item.done));

      yield* service.upsert({ id: module.id, projectId: app, done: true });
      const checked = (yield* service.snapshot(app)).items;
      assert.deepStrictEqual(
        checked
          .filter((item) => item.done)
          .map((item) => item.title)
          .toSorted(),
        ["One", "Release", "Two"],
      );
      assert.isFalse(checked.find((item) => item.id === stranger.id)?.done);

      yield* service.upsert({ id: two.id, projectId: app, done: false });
      const reopened = (yield* service.snapshot(app)).items;
      assert.deepStrictEqual(
        reopened.filter((item) => item.done).map((item) => item.title),
        ["One"],
      );

      yield* service.upsert({ id: module.id, projectId: app, done: true });
      yield* service.upsert({ id: module.id, projectId: app, done: false });
      assert.isFalse((yield* service.snapshot(app)).items.some((item) => item.done));
    }),
  ),
);

it.effect("reopens a finished module when an open item is added to it", () =>
  withService((service) =>
    Effect.gen(function* () {
      const module = yield* service.upsert({ projectId: app, title: "Release" });
      yield* service.upsert({ id: module.id, projectId: app, done: true });
      yield* service.upsert({ projectId: app, parentId: module.id, title: "Late" });
      const items = (yield* service.snapshot(app)).items;
      assert.isFalse(items.find((item) => item.id === module.id)?.done);
    }),
  ),
);

it.effect("moves an item within its siblings and keeps positions dense", () =>
  withService((service) =>
    Effect.gen(function* () {
      const module = yield* service.upsert({ projectId: app, title: "Release" });
      const a = yield* service.upsert({ projectId: app, parentId: module.id, title: "a" });
      yield* service.upsert({ projectId: app, parentId: module.id, title: "b" });
      yield* service.upsert({ projectId: app, parentId: module.id, title: "c" });
      yield* service.move({ id: a.id, index: 2 });
      yield* service.move({ id: a.id, index: 99 });
      const order = (yield* service.snapshot(app)).items
        .filter((item) => item.parentId === module.id)
        .toSorted((x, y) => x.position - y.position);
      assert.deepStrictEqual(
        order.map((item) => item.title),
        ["b", "c", "a"],
      );
      assert.deepStrictEqual(
        order.map((item) => item.position),
        [0, 1, 2],
      );
      assert.strictEqual(
        (yield* service.snapshot(app)).items.find((i) => i.id === module.id)?.position,
        0,
      );
    }),
  ),
);

it.effect("deleting a module deletes its items; deleting an item leaves its module", () =>
  withService((service) =>
    Effect.gen(function* () {
      const module = yield* service.upsert({ projectId: app, title: "Release" });
      const one = yield* service.upsert({ projectId: app, parentId: module.id, title: "One" });
      yield* service.upsert({ projectId: app, parentId: module.id, title: "Two" });
      const keep = yield* service.upsert({ projectId: app, title: "Keep" });
      assert.deepStrictEqual(yield* service.delete(one.id), [one.id]);
      assert.strictEqual((yield* service.snapshot(app)).items.length, 3);
      const deleted = yield* service.delete(module.id);
      assert.strictEqual(deleted.length, 2);
      assert.deepStrictEqual(
        (yield* service.snapshot(app)).items.map((item) => item.id),
        [keep.id],
      );
      assert.isTrue(yield* rejects(service.delete(module.id)));
    }),
  ),
);

it.effect("deleteForProject only clears that project", () =>
  withService((service) =>
    Effect.gen(function* () {
      yield* service.upsert({ projectId: app, title: "a" });
      yield* service.upsert({ projectId: site, title: "s" });
      yield* service.deleteForProject(app);
      assert.strictEqual((yield* service.snapshot(app)).items.length, 0);
      assert.strictEqual((yield* service.snapshot(site)).items.length, 1);
    }),
  ),
);

it.effect("subscribers get their project's snapshot first, then only its changes", () =>
  withService((service) =>
    Effect.gen(function* () {
      yield* service.upsert({ projectId: app, title: "first" });
      const received = yield* service.subscribe(app).pipe(
        Stream.take(2),
        Stream.map((snapshot) => snapshot.items.map((item) => item.title)),
        Stream.runCollect,
        Effect.forkChild,
      );
      yield* Effect.yieldNow;
      yield* service.upsert({ projectId: site, title: "elsewhere" });
      yield* service.upsert({ projectId: app, title: "second" });
      const snapshots = yield* Fiber.join(received);
      assert.deepStrictEqual(Array.from(snapshots), [["first"], ["first", "second"]]);
    }),
  ),
);
