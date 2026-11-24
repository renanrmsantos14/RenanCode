import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import {
  type DesignSketchId,
  type OrchestrationV2ThreadShell,
  ProjectId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import { resolveAttachmentPathById } from "../attachmentStore.ts";
import * as ServerConfig from "../config.ts";
import * as HtmlRender from "../htmlRender/HtmlRender.ts";
import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as DesignService from "./DesignService.ts";

const app = ProjectId.make("project:app");
const site = ProjectId.make("project:site");
const threadA = ThreadId.make("thread:a");
const threadB = ThreadId.make("thread:b");
const threadSite = ThreadId.make("thread:site");

const shell = (projectId: ProjectId) =>
  ({ projectId, deletedAt: null }) as unknown as OrchestrationV2ThreadShell;
const shells: Record<string, OrchestrationV2ThreadShell> = {
  [threadA]: shell(app),
  [threadB]: shell(app),
  [threadSite]: shell(site),
};

const PNG = Buffer.from("png-bytes").toString("base64");

const makeHtmlRender = (options: { readonly chrome: boolean }) =>
  Layer.mock(HtmlRender.HtmlRender)({
    prepare: (html) => Effect.succeed(html),
    preview: (input) =>
      options.chrome
        ? Effect.succeed({
            png: PNG,
            width: input.width ?? 1280,
            contentHeight: 5200,
            capturedHeight: 5200,
            consoleMessages: [],
          })
        : Effect.fail(new HtmlRender.HtmlRenderFileError({ path: "no-chrome" })),
  });

const makeLayer = (options: { readonly chrome: boolean }) =>
  DesignService.layer.pipe(
    Layer.provide(
      Layer.mock(ThreadManagementService.ThreadManagementService)({
        getThreadShell: (threadId) => Effect.succeed(shells[threadId] ?? null),
      }),
    ),
    Layer.provideMerge(makeHtmlRender(options)),
    Layer.provideMerge(ServerConfig.layerTest(process.cwd(), { prefix: "t3-design-" })),
    Layer.provideMerge(SqlitePersistence.layerMemory),
    Layer.provideMerge(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer)),
  );

const withService = <A, E>(
  options: { readonly chrome: boolean },
  body: (
    service: DesignService.DesignService["Service"],
  ) => Effect.Effect<A, E, FileSystem.FileSystem | ServerConfig.ServerConfig>,
) =>
  Effect.gen(function* () {
    return yield* body(yield* DesignService.DesignService);
  }).pipe(Effect.provide(makeLayer(options)));

const page = (title: string, extra?: { height?: number; width?: number; label?: string }) => ({
  html: `<!doctype html><html><body>${title}</body></html>`,
  title,
  width: extra?.width ?? 400,
  ...(extra?.height === undefined ? {} : { height: extra.height }),
  ...(extra?.label === undefined ? {} : { label: extra.label }),
});

it.effect("places a group side by side and a new group below, with a capped default height", () =>
  withService({ chrome: true }, (service) =>
    Effect.gen(function* () {
      const group = yield* service.createSketches({
        threadId: threadA,
        projectId: app,
        pages: [page("A", { label: "Calma" }), page("B")],
      });
      assert.strictEqual(group.length, 2);
      assert.strictEqual(group[0]!.height, 4000);
      assert.strictEqual(group[0]!.label, "Calma");
      assert.isNotNull(group[0]!.thumbnailAttachmentId);
      const next = yield* service.createSketches({
        threadId: threadA,
        projectId: app,
        pages: [page("C", { height: 300 })],
      });
      const snapshot = yield* service.snapshot(threadA);
      const [a, b, c] = snapshot.nodes;
      assert.strictEqual(snapshot.sketches.length, 3);
      assert.strictEqual(a!.y, b!.y);
      assert.isTrue(b!.x > a!.x + a!.width);
      assert.isTrue(c!.y >= a!.y + a!.height);
      assert.strictEqual(next[0]!.height, 300);
      const [first, second] = snapshot.sketches;
      assert.strictEqual(first!.groupId, second!.groupId);
      assert.isNotNull(first!.groupId);
    }),
  ),
);

it.effect(
  "writes the html and thumbnail under the project prefix, outside the thread's attachments",
  () =>
    withService({ chrome: true }, (service) =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const config = yield* ServerConfig.ServerConfig;
        const [sketch] = yield* service.createSketches({
          threadId: threadA,
          projectId: app,
          pages: [page("A")],
        });
        assert.isTrue(sketch!.attachmentId.startsWith("design-project-app-"));
        assert.isTrue(sketch!.attachmentId.endsWith("-html"));
        assert.isTrue(sketch!.thumbnailAttachmentId!.endsWith("-png"));
        const html = yield* fileSystem.readFileString(
          `${config.attachmentsDir}/${sketch!.attachmentId}.html`,
        );
        assert.include(html, "<body>A</body>");
        assert.isTrue(
          yield* fileSystem.exists(`${config.attachmentsDir}/${sketch!.thumbnailAttachmentId}.png`),
        );
        // The asset route resolves ids by this lookup.
        for (const id of [sketch!.attachmentId, sketch!.thumbnailAttachmentId!]) {
          assert.isNotNull(
            resolveAttachmentPathById({ attachmentsDir: config.attachmentsDir, attachmentId: id }),
          );
        }
      }),
    ),
);

it.effect("keeps the sketch without a thumbnail when Chrome is missing", () =>
  withService({ chrome: false }, (service) =>
    Effect.gen(function* () {
      const [withHeight, measured] = yield* Effect.all([
        service.createSketches({
          threadId: threadA,
          projectId: app,
          pages: [page("A", { height: 500 })],
        }),
        service.createSketches({ threadId: threadA, projectId: app, pages: [page("B")] }),
      ]).pipe(Effect.map(([a, b]) => [a[0]!, b[0]!] as const));
      assert.isNull(withHeight.thumbnailAttachmentId);
      assert.strictEqual(withHeight.height, 500);
      assert.strictEqual(measured.height, 800);
    }),
  ),
);

it.effect("places a variant to the right of the sketch it builds on", () =>
  withService({ chrome: true }, (service) =>
    Effect.gen(function* () {
      const [original] = yield* service.createSketches({
        threadId: threadA,
        projectId: app,
        pages: [page("A", { height: 300 })],
      });
      yield* service.createSketches({
        threadId: threadA,
        projectId: app,
        basedOn: original!.sketchId as DesignSketchId,
        pages: [page("A2", { height: 300 })],
      });
      const { nodes } = yield* service.snapshot(threadA);
      assert.strictEqual(nodes[1]!.y, nodes[0]!.y);
      assert.isTrue(nodes[1]!.x >= nodes[0]!.x + nodes[0]!.width);
      const missing = yield* service
        .createSketches({
          threadId: threadA,
          projectId: app,
          basedOn: "design-sketch:nope" as DesignSketchId,
          pages: [page("X")],
        })
        .pipe(Effect.flip);
      assert.include(missing.message, "not found");
    }),
  ),
);

it.effect("moves nodes, stores the viewport, removes and places a sketch again", () =>
  withService({ chrome: true }, (service) =>
    Effect.gen(function* () {
      const [sketch] = yield* service.createSketches({
        threadId: threadA,
        projectId: app,
        pages: [page("A", { height: 300 })],
      });
      const [node] = (yield* service.snapshot(threadA)).nodes;
      yield* service.moveNodes({
        threadId: threadA,
        nodes: [{ nodeId: node!.id, x: 120, y: 340 }],
      });
      yield* service.setViewport({ threadId: threadA, viewport: { x: 5, y: 6, zoom: 0.5 } });
      let snapshot = yield* service.snapshot(threadA);
      assert.deepStrictEqual([snapshot.nodes[0]!.x, snapshot.nodes[0]!.y], [120, 340]);
      assert.deepStrictEqual(snapshot.viewport, { x: 5, y: 6, zoom: 0.5 });

      yield* service.removeNode({ threadId: threadA, nodeId: node!.id });
      snapshot = yield* service.snapshot(threadA);
      assert.strictEqual(snapshot.nodes.length, 0);
      assert.strictEqual(snapshot.sketches.length, 1);

      const placed = yield* service.placeSketch({
        threadId: threadA,
        sketchId: sketch!.sketchId as DesignSketchId,
      });
      const again = yield* service.placeSketch({
        threadId: threadA,
        sketchId: sketch!.sketchId as DesignSketchId,
      });
      assert.strictEqual(placed.id, again.id);
      assert.strictEqual((yield* service.snapshot(threadA)).nodes.length, 1);
    }),
  ),
);

it.effect("places a project sketch on another thread but refuses one from another project", () =>
  withService({ chrome: true }, (service) =>
    Effect.gen(function* () {
      const [sketch] = yield* service.createSketches({
        threadId: threadA,
        projectId: app,
        pages: [page("A", { height: 300 })],
      });
      const sketchId = sketch!.sketchId as DesignSketchId;
      yield* service.placeSketch({ threadId: threadB, sketchId });
      assert.strictEqual((yield* service.snapshot(threadB)).nodes.length, 1);
      const refused = yield* service
        .placeSketch({ threadId: threadSite, sketchId })
        .pipe(Effect.flip);
      assert.include(refused.message, "not found");
    }),
  ),
);

it.effect("publishes the snapshot to subscribers when the canvas changes", () =>
  withService({ chrome: true }, (service) =>
    Effect.gen(function* () {
      const fiber = yield* service
        .subscribe(threadA)
        .pipe(Stream.take(2), Stream.runCollect, Effect.forkChild);
      yield* Effect.yieldNow;
      yield* service.createSketches({
        threadId: threadA,
        projectId: app,
        pages: [page("A", { height: 300 })],
      });
      yield* service.createSketches({
        threadId: threadB,
        projectId: app,
        pages: [page("B", { height: 300 })],
      });
      const snapshots = Array.from(yield* Fiber.join(fiber));
      assert.strictEqual(snapshots[0]!.nodes.length, 0);
      assert.strictEqual(snapshots[1]!.nodes.length, 1);
      assert.strictEqual(snapshots[1]!.threadId, threadA);
    }),
  ),
);

it.effect("deleting a thread drops its nodes and viewport but keeps the sketches and files", () =>
  withService({ chrome: true }, (service) =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const config = yield* ServerConfig.ServerConfig;
      const [sketch] = yield* service.createSketches({
        threadId: threadA,
        projectId: app,
        pages: [page("A", { height: 300 })],
      });
      yield* service.setViewport({ threadId: threadA, viewport: { x: 1, y: 2, zoom: 1 } });
      yield* service.cleanupThread(threadA);
      const snapshot = yield* service.snapshot(threadA);
      assert.strictEqual(snapshot.nodes.length, 0);
      assert.isNull(snapshot.viewport);
      assert.strictEqual(snapshot.sketches.length, 1);
      assert.isTrue(
        yield* fileSystem.exists(`${config.attachmentsDir}/${sketch!.attachmentId}.html`),
      );
      yield* service.placeSketch({
        threadId: threadB,
        sketchId: sketch!.sketchId as DesignSketchId,
      });
      assert.strictEqual((yield* service.snapshot(threadB)).nodes.length, 1);
    }),
  ),
);
