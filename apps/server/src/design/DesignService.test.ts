import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import {
  DESIGN_PROJECT_SKETCHES_PAGE_SIZE,
  type DesignFrameNode,
  type DesignNodeId,
  type DesignSelection,
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
const PNG_SIGNATURE_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString(
  "base64",
);

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
  ) => Effect.Effect<
    A,
    E,
    FileSystem.FileSystem | ServerConfig.ServerConfig | HtmlRender.HtmlRender
  >,
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

const frameInput = (threadId: ThreadId, extra?: object) => ({
  threadId,
  url: "http://localhost:5173/",
  device: "desktop" as const,
  ...extra,
});

it.effect("adds Frames with preset sizes below the sketches and updates them", () =>
  withService({ chrome: true }, (service) =>
    Effect.gen(function* () {
      yield* service.createSketches({
        threadId: threadA,
        projectId: app,
        pages: [page("A", { height: 300 })],
      });
      const desktop = (yield* service.addFrame(frameInput(threadA)))!;
      const mobile = (yield* service.addFrame(
        frameInput(threadA, { device: "mobile", url: "http://localhost:5173/login" }),
      ))!;
      assert.strictEqual(desktop.kind, "frame");
      assert.deepStrictEqual([desktop.width, desktop.height], [1440, 900]);
      assert.deepStrictEqual([mobile.width, mobile.height], [390, 844]);
      assert.strictEqual(desktop.title, "localhost:5173");
      assert.strictEqual(mobile.title, "localhost:5173/login");
      assert.isTrue(desktop.y >= 300);
      assert.strictEqual(desktop.snapshotAttachmentId, null);
      const custom = (yield* service.addFrame(
        frameInput(threadA, { device: "custom", width: 500, height: 600 }),
      ))!;
      assert.deepStrictEqual([custom.width, custom.height], [500, 600]);

      yield* service.updateFrame({
        threadId: threadA,
        nodeId: mobile.id,
        device: "tablet",
        title: "Login",
      });
      const updated = (yield* service.snapshot(threadA)).nodes.find(
        (node) => node.id === mobile.id,
      ) as DesignFrameNode;
      assert.deepStrictEqual(
        [updated.device, updated.width, updated.height],
        ["tablet", 768, 1024],
      );
      assert.strictEqual(updated.title, "Login");
      assert.strictEqual((yield* service.snapshot(threadA)).sketches.length, 1);
    }),
  ),
);

it.effect("refuses a Frame in a thread that does not exist", () =>
  withService({ chrome: true }, (service) =>
    Effect.gen(function* () {
      const refused = yield* service
        .addFrame(frameInput(ThreadId.make("thread:missing")))
        .pipe(Effect.flip);
      assert.include(refused.message, "not found");
    }),
  ),
);

it.effect("makes the automatic Frame once per thread, even after it is removed", () =>
  withService({ chrome: true }, (service) =>
    Effect.gen(function* () {
      const first = yield* service.addFrame(frameInput(threadA, { auto: true }));
      assert.isNotNull(first);
      assert.isNull(yield* service.addFrame(frameInput(threadA, { auto: true })));
      yield* service.removeNode({ threadId: threadA, nodeId: first!.id });
      assert.isNull(yield* service.addFrame(frameInput(threadA, { auto: true })));
      assert.strictEqual((yield* service.snapshot(threadA)).nodes.length, 0);
      // A Frame the user adds is not automatic, and another thread has its own.
      assert.isNotNull(yield* service.addFrame(frameInput(threadA)));
      assert.isNotNull(yield* service.addFrame(frameInput(threadB, { auto: true })));
    }),
  ),
);

it.effect("keeps a Frame print under the thread prefix and replaces it on every save", () =>
  withService({ chrome: true }, (service) =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const config = yield* ServerConfig.ServerConfig;
      const frame = (yield* service.addFrame(frameInput(threadA)))!;
      const pngPath = (id: string | null) => `${config.attachmentsDir}/${id}.png`;

      yield* service.setFrameSnapshot({
        threadId: threadA,
        nodeId: frame.id,
        png: PNG_SIGNATURE_B64,
      });
      const first = ((yield* service.snapshot(threadA)).nodes[0] as DesignFrameNode)
        .snapshotAttachmentId;
      assert.isNotNull(first);
      assert.isFalse(first!.startsWith("design-"));
      assert.isTrue(yield* fileSystem.exists(pngPath(first)));

      yield* service.setFrameSnapshot({
        threadId: threadA,
        nodeId: frame.id,
        png: PNG_SIGNATURE_B64,
      });
      const second = ((yield* service.snapshot(threadA)).nodes[0] as DesignFrameNode)
        .snapshotAttachmentId;
      assert.notStrictEqual(second, first);
      assert.isFalse(yield* fileSystem.exists(pngPath(first)));

      // A new page makes the print wrong, so it goes.
      yield* service.updateFrame({
        threadId: threadA,
        nodeId: frame.id,
        url: "http://localhost:5173/x",
      });
      assert.isNull(
        ((yield* service.snapshot(threadA)).nodes[0] as DesignFrameNode).snapshotAttachmentId,
      );
      assert.isFalse(yield* fileSystem.exists(pngPath(second)));

      yield* service.setFrameSnapshot({
        threadId: threadA,
        nodeId: frame.id,
        png: PNG_SIGNATURE_B64,
      });
      const third = ((yield* service.snapshot(threadA)).nodes[0] as DesignFrameNode)
        .snapshotAttachmentId;
      yield* service.removeNode({ threadId: threadA, nodeId: frame.id });
      assert.isFalse(yield* fileSystem.exists(pngPath(third)));
    }),
  ),
);

it.effect("rejects a print that is not a PNG or belongs to no Frame of the thread", () =>
  withService({ chrome: true }, (service) =>
    Effect.gen(function* () {
      const frame = (yield* service.addFrame(frameInput(threadA)))!;
      const notPng = yield* service
        .setFrameSnapshot({ threadId: threadA, nodeId: frame.id, png: PNG })
        .pipe(Effect.flip);
      assert.include(notPng.message, "PNG");
      const otherThread = yield* service
        .setFrameSnapshot({ threadId: threadB, nodeId: frame.id, png: PNG_SIGNATURE_B64 })
        .pipe(Effect.flip);
      assert.include(otherThread.message, "not found");
    }),
  ),
);

it.effect("deleting a thread drops its Frames and lets the automatic one be made again", () =>
  withService({ chrome: true }, (service) =>
    Effect.gen(function* () {
      yield* service.addFrame(frameInput(threadA, { auto: true }));
      yield* service.cleanupThread(threadA);
      assert.strictEqual((yield* service.snapshot(threadA)).nodes.length, 0);
      assert.isNotNull(yield* service.addFrame(frameInput(threadA, { auto: true })));
    }),
  ),
);

const selection = (comment: string): DesignSelection => ({
  pageUrl: "http://localhost:5173/",
  tagName: "button",
  selector: "main > button",
  htmlPreview: "<button>Buy</button>",
  styles: "color: red",
  comment,
  png: null,
  pickedAt: "2026-11-25T12:00:00.000Z",
});

it.effect("arranges: moves, groups side by side with a label and removes, all or nothing", () =>
  withService({ chrome: true }, (service) =>
    Effect.gen(function* () {
      const created = yield* service.createSketches({
        threadId: threadA,
        projectId: app,
        pages: [page("A", { height: 300 }), page("B", { height: 300 }), page("C", { height: 300 })],
      });
      const [a, b, c] = (yield* service.snapshot(threadA)).nodes;
      const moved = yield* service.arrange({
        threadId: threadA,
        moves: [{ nodeId: a!.id, x: 1000, y: 2000 }],
      });
      const movedA = moved.find((node) => node.id === a!.id)!;
      assert.strictEqual(movedA.x, 1000);
      assert.strictEqual(movedA.y, 2000);

      const grouped = yield* service.arrange({
        threadId: threadA,
        group: { nodeIds: [b!.id, c!.id], label: "Checkout" },
      });
      const [gb, gc] = [b!.id, c!.id].map((id) => grouped.find((node) => node.id === id)!);
      assert.strictEqual(gb!.y, gc!.y);
      assert.isTrue(gc!.x > gb!.x);
      assert.strictEqual(gb!.groupLabel, "Checkout");
      assert.strictEqual(gb!.groupId, gc!.groupId);
      assert.isNotNull(gb!.groupId);

      // A node cannot be moved and removed in the same step, and nothing changes on refusal.
      const conflict = yield* service
        .arrange({
          threadId: threadA,
          moves: [{ nodeId: a!.id, x: 5, y: 5 }],
          remove: [a!.id],
        })
        .pipe(Effect.flip);
      assert.include(conflict.message, "moved and removed");
      assert.strictEqual(
        (yield* service.snapshot(threadA)).nodes.find((node) => node.id === a!.id)!.x,
        1000,
      );

      const blank = yield* service
        .arrange({ threadId: threadA, group: { nodeIds: [b!.id], label: "   " } })
        .pipe(Effect.flip);
      assert.include(blank.message, "needs a label");
      const both = yield* service
        .arrange({
          threadId: threadA,
          moves: [{ nodeId: b!.id, x: 0, y: 0 }],
          group: { nodeIds: [b!.id], label: "Again" },
        })
        .pipe(Effect.flip);
      assert.include(both.message, "moved and grouped");

      const missing = yield* service
        .arrange({ threadId: threadA, remove: ["design-node:missing" as DesignNodeId] })
        .pipe(Effect.flip);
      assert.include(missing.message, "is not on th");

      const removed = yield* service.arrange({ threadId: threadA, remove: [a!.id] });
      assert.isUndefined(removed.find((node) => node.id === a!.id));
      // The sketch stays in the project library and can come back.
      const sketchId = created[0]!.sketchId as DesignSketchId;
      assert.strictEqual((yield* service.snapshot(threadA)).sketches.length, 3);
      yield* service.placeSketch({ threadId: threadA, sketchId });
      assert.strictEqual((yield* service.snapshot(threadA)).nodes.length, 3);
    }),
  ),
);

it.effect(
  "lists the project's sketches with their origin, page by page, even after the thread is gone",
  () =>
    withService({ chrome: true }, (service) =>
      Effect.gen(function* () {
        yield* service.createSketches({
          threadId: threadA,
          projectId: app,
          pages: [page("Home"), page("Login", { label: "Variante Azul" })],
        });
        yield* service.createSketches({
          threadId: threadB,
          projectId: app,
          pages: [page("Settings")],
        });
        yield* service.createSketches({
          threadId: threadSite,
          projectId: site,
          pages: [page("Other project")],
        });
        const all = yield* service.listProjectSketches({ projectId: app });
        assert.deepStrictEqual(all.sketches.map((sketch) => sketch.title).toSorted(), [
          "Home",
          "Login",
          "Settings",
        ]);
        assert.isNull(all.nextCursor);
        assert.isTrue(all.sketches.every((sketch) => !sketch.originThreadDeleted));

        const found = yield* service.listProjectSketches({ projectId: app, query: "logIN" });
        assert.deepStrictEqual(
          found.sketches.map((sketch) => sketch.title),
          ["Login"],
        );
        const byLabel = yield* service.listProjectSketches({ projectId: app, query: "azul" });
        assert.deepStrictEqual(
          byLabel.sketches.map((sketch) => sketch.title),
          ["Login"],
        );

        const original = shells[threadB];
        shells[threadB] = { projectId: app, deletedAt: "2026-11-25T00:00:00.000Z" } as never;
        const afterDelete = yield* service.listProjectSketches({ projectId: app });
        shells[threadB] = original!;
        const settings = afterDelete.sketches.find((sketch) => sketch.title === "Settings")!;
        assert.isTrue(settings.originThreadDeleted);
        assert.isNull(settings.originThreadTitle);

        const first = yield* service.listProjectSketches({ projectId: app });
        assert.strictEqual(first.sketches.length, 3);
      }),
    ),
);

it.effect("pages the project library without repeating or skipping a sketch", () =>
  withService({ chrome: false }, (service) =>
    Effect.gen(function* () {
      const total = DESIGN_PROJECT_SKETCHES_PAGE_SIZE + 5;
      for (let index = 0; index < total; index += 1) {
        yield* service.createSketches({
          threadId: threadA,
          projectId: app,
          pages: [page(`S${index}`, { height: 200 })],
        });
      }
      const first = yield* service.listProjectSketches({ projectId: app });
      assert.strictEqual(first.sketches.length, DESIGN_PROJECT_SKETCHES_PAGE_SIZE);
      assert.isNotNull(first.nextCursor);
      const second = yield* service.listProjectSketches({
        projectId: app,
        cursor: first.nextCursor!,
      });
      assert.strictEqual(second.sketches.length, 5);
      assert.isNull(second.nextCursor);
      const ids = [...first.sketches, ...second.sketches].map((sketch) => sketch.id);
      assert.strictEqual(new Set(ids).size, total);
    }),
  ),
);

it.effect(
  "keeps the last selection and the live Frame tab per thread, and forgets them on cleanup",
  () =>
    withService({ chrome: true }, (service) =>
      Effect.gen(function* () {
        assert.isNull(yield* service.readSelection(threadA));
        yield* service.setSelection({ threadId: threadA, selection: selection("first") });
        yield* service.setSelection({ threadId: threadA, selection: selection("second") });
        assert.strictEqual((yield* service.readSelection(threadA))!.comment, "second");
        assert.isNull(yield* service.readSelection(threadB));

        const frame = (yield* service.addFrame(frameInput(threadA)))!;
        assert.isNull(yield* service.liveFrameTab(threadA, frame.id));
        yield* service.reportLiveFrame({ threadId: threadA, nodeId: frame.id, tabId: "tab-1" });
        assert.strictEqual(yield* service.liveFrameTab(threadA, frame.id), "tab-1");
        assert.isNull(yield* service.liveFrameTab(threadB, frame.id));
        yield* service.reportLiveFrame({ threadId: threadA, nodeId: frame.id, tabId: null });
        assert.isNull(yield* service.liveFrameTab(threadA, frame.id));

        yield* service.reportLiveFrame({ threadId: threadA, nodeId: frame.id, tabId: "tab-2" });
        yield* service.cleanupThread(threadA);
        assert.isNull(yield* service.readSelection(threadA));
        assert.isNull(yield* service.liveFrameTab(threadA, frame.id));
      }),
    ),
);

it.effect("reads the saved Frame print with its size, and null when there is none", () =>
  withService({ chrome: true }, (service) =>
    Effect.gen(function* () {
      const frame = (yield* service.addFrame(frameInput(threadA)))!;
      assert.isNull(yield* service.readFramePrint(threadA, frame.id));
      const header = Buffer.alloc(24);
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header);
      header.writeUInt32BE(640, 16);
      header.writeUInt32BE(480, 20);
      yield* service.setFrameSnapshot({
        threadId: threadA,
        nodeId: frame.id,
        png: header.toString("base64"),
      });
      const print = yield* service.readFramePrint(threadA, frame.id);
      assert.strictEqual(print!.width, 640);
      assert.strictEqual(print!.height, 480);
      assert.strictEqual(print!.png, header.toString("base64"));
    }),
  ),
);
