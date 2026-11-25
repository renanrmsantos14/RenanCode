import {
  type DesignAddFrameInput,
  type DesignCanvasNode,
  type DesignCanvasSnapshot,
  DesignError,
  type DesignFrameNode,
  type DesignListProjectSketchesInput,
  DesignNodeId,
  DESIGN_PROJECT_SKETCHES_PAGE_SIZE,
  type DesignProjectSketchesPage,
  type DesignReportLiveFrameInput,
  type DesignSelection,
  type DesignSetFrameSnapshotInput,
  type DesignSetSelectionInput,
  type DesignSketch,
  DesignSketchId,
  type DesignUpdateFrameInput,
  type DesignViewport,
  type ProjectId,
  type ThreadId,
} from "@t3tools/contracts";
import {
  clampDesignSketchHeight,
  clampDesignSketchWidth,
  DESIGN_SKETCH_DEFAULT_MAX_HEIGHT,
  designFrameSize,
  designSketchReference,
  type DesignRect,
  type DesignSketchReference,
  placeSketches,
} from "@t3tools/shared/design";
import * as Context from "effect/Context";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";

import { resolveAttachmentRelativePath } from "../attachmentPaths.ts";
import { createAttachmentId } from "../attachmentStore.ts";
import * as ServerConfig from "../config.ts";
import * as HtmlRender from "../htmlRender/HtmlRender.ts";
import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";
import { deleteThreadCanvas } from "./deleteThreadCanvas.ts";

/** Used when Chrome is missing and the agent gave no height, so the page could not be measured. */
const FALLBACK_SKETCH_HEIGHT = 800;
const MAX_VARIANT_LABEL_LENGTH = 40;

export interface DesignSketchPage {
  readonly html: string;
  readonly title: string;
  readonly label?: string | undefined;
  readonly width: number;
  readonly height?: number | undefined;
}

export interface DesignArrangeInput {
  readonly threadId: ThreadId;
  readonly moves?: ReadonlyArray<{
    readonly nodeId: DesignNodeId;
    readonly x: number;
    readonly y: number;
  }>;
  /** Placed side by side in a new row below the rest, under one label. */
  readonly group?: { readonly nodeIds: ReadonlyArray<DesignNodeId>; readonly label: string };
  /** Taken off the canvas; sketches stay in the project library. */
  readonly remove?: ReadonlyArray<DesignNodeId>;
}

export class DesignService extends Context.Service<
  DesignService,
  {
    readonly snapshot: (threadId: ThreadId) => Effect.Effect<DesignCanvasSnapshot, DesignError>;
    readonly subscribe: (threadId: ThreadId) => Stream.Stream<DesignCanvasSnapshot, DesignError>;
    /** Saves the pages as sketches and places them on the thread's canvas as one group. */
    // HtmlRender is needed per call, not to build the service: its browser only exists in the HTTP layer.
    readonly createSketches: (input: {
      readonly threadId: ThreadId;
      readonly projectId: ProjectId;
      readonly groupId?: string | undefined;
      readonly basedOn?: DesignSketchId | undefined;
      readonly pages: ReadonlyArray<DesignSketchPage>;
    }) => Effect.Effect<
      ReadonlyArray<DesignSketchReference>,
      DesignError | HtmlRender.HtmlRenderPrepareError,
      HtmlRender.HtmlRender
    >;
    readonly moveNodes: (input: {
      readonly threadId: ThreadId;
      readonly nodes: ReadonlyArray<{
        readonly nodeId: DesignNodeId;
        readonly x: number;
        readonly y: number;
      }>;
    }) => Effect.Effect<void, DesignError>;
    readonly setViewport: (input: {
      readonly threadId: ThreadId;
      readonly viewport: DesignViewport;
    }) => Effect.Effect<void, DesignError>;
    readonly removeNode: (input: {
      readonly threadId: ThreadId;
      readonly nodeId: DesignNodeId;
    }) => Effect.Effect<void, DesignError>;
    /** Puts a saved sketch of the thread's project back on its canvas; a no-op when already there. */
    readonly placeSketch: (input: {
      readonly threadId: ThreadId;
      readonly sketchId: DesignSketchId;
    }) => Effect.Effect<DesignCanvasNode, DesignError>;
    /** Places a running page on the thread's canvas. Null when `auto` found the automatic Frame already made. */
    readonly addFrame: (
      input: DesignAddFrameInput,
    ) => Effect.Effect<DesignFrameNode | null, DesignError>;
    /** Changes a Frame's page or size; the saved print is dropped because it no longer matches. */
    readonly updateFrame: (input: DesignUpdateFrameInput) => Effect.Effect<void, DesignError>;
    /** Replaces the print a Frame shows while it is not the live one. */
    readonly setFrameSnapshot: (
      input: DesignSetFrameSnapshotInput,
    ) => Effect.Effect<void, DesignError>;
    /** Moves, groups and removes several nodes of the thread's canvas in one step. */
    readonly arrange: (
      input: DesignArrangeInput,
    ) => Effect.Effect<ReadonlyArray<DesignCanvasNode>, DesignError>;
    /** Every sketch of the project, newest first, with where it came from. No HTML. */
    readonly listProjectSketches: (
      input: DesignListProjectSketchesInput,
    ) => Effect.Effect<DesignProjectSketchesPage, DesignError>;
    /** Remembers which preview tab runs a Frame while it is live; null forgets it. */
    readonly reportLiveFrame: (input: DesignReportLiveFrameInput) => Effect.Effect<void>;
    readonly liveFrameTab: (
      threadId: ThreadId,
      nodeId: DesignNodeId,
    ) => Effect.Effect<string | null>;
    /** The last element the user picked in a Frame of this thread. */
    readonly setSelection: (input: DesignSetSelectionInput) => Effect.Effect<void>;
    readonly readSelection: (threadId: ThreadId) => Effect.Effect<DesignSelection | null>;
    /** The saved print of a Frame, or null when it has none. */
    readonly readFramePrint: (
      threadId: ThreadId,
      nodeId: DesignNodeId,
    ) => Effect.Effect<
      { readonly png: string; readonly width: number; readonly height: number } | null,
      DesignError
    >;
    /** Drops the thread's canvas. Sketches stay: they belong to the project. */
    readonly cleanupThread: (threadId: ThreadId) => Effect.Effect<void, DesignError>;
  }
>()("t3/design/DesignService") {}

interface SketchRow {
  readonly sketch_id: string;
  readonly project_id: string;
  readonly origin_thread_id: string;
  readonly group_id: string | null;
  readonly based_on_sketch_id: string | null;
  readonly title: string;
  readonly label: string | null;
  readonly html_attachment_id: string;
  readonly thumbnail_attachment_id: string | null;
  readonly width: number;
  readonly height: number;
  readonly created_at: string;
}

interface NodeRow {
  readonly node_id: string;
  readonly thread_id: string;
  readonly kind: string;
  readonly sketch_id: string | null;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly z: number;
  readonly url: string | null;
  readonly device: string | null;
  readonly title: string | null;
  readonly snapshot_attachment_id: string | null;
  readonly group_id: string | null;
  readonly group_label: string | null;
}

const fail = (message: string, cause?: unknown) =>
  new DesignError({ message, ...(cause === undefined ? {} : { cause }) });

const storage = (cause: unknown) => fail("The design canvas could not be saved or read.", cause);

// Rows were written by this service from decoded inputs, so they are trusted here.
const toSketch = (row: SketchRow): DesignSketch =>
  ({
    id: row.sketch_id,
    projectId: row.project_id,
    originThreadId: row.origin_thread_id,
    groupId: row.group_id,
    basedOnSketchId: row.based_on_sketch_id,
    title: row.title,
    label: row.label,
    htmlAttachmentId: row.html_attachment_id,
    thumbnailAttachmentId: row.thumbnail_attachment_id,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
  }) as DesignSketch;

const grouping = (row: NodeRow) => ({
  ...(row.group_id === null ? {} : { groupId: row.group_id }),
  ...(row.group_label === null ? {} : { groupLabel: row.group_label }),
});

const toNode = (row: NodeRow): DesignCanvasNode =>
  row.kind === "frame"
    ? ({
        id: row.node_id,
        kind: "frame",
        url: row.url,
        device: row.device,
        title: row.title,
        snapshotAttachmentId: row.snapshot_attachment_id,
        x: row.x,
        y: row.y,
        width: row.width,
        height: row.height,
        z: row.z,
        ...grouping(row),
      } as DesignCanvasNode)
    : ({
        id: row.node_id,
        kind: "sketch",
        sketchId: row.sketch_id,
        x: row.x,
        y: row.y,
        width: row.width,
        height: row.height,
        z: row.z,
        ...grouping(row),
      } as DesignCanvasNode);

const frameTitle = (url: string) => {
  try {
    const { host, pathname } = new URL(url);
    return `${host}${pathname === "/" ? "" : pathname}`.slice(0, 200);
  } catch {
    return url.slice(0, 200);
  }
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const iso = (value: DateTime.DateTime) => DateTime.formatIso(DateTime.toUtc(value));

const rect = (node: DesignCanvasNode): DesignRect => ({
  x: node.x,
  y: node.y,
  width: node.width,
  height: node.height,
});

export const layer = Layer.effect(
  DesignService,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const random = yield* SecureRandom.SecureRandom;
    const threads = yield* ThreadManagementService.ThreadManagementService;
    const fileSystem = yield* FileSystem.FileSystem;
    const config = yield* ServerConfig.ServerConfig;
    // Items are tiny and each subscriber re-reads its own thread, so nothing is dropped.
    const changes = yield* PubSub.unbounded<ThreadId>();
    const notify = (threadId: ThreadId) => PubSub.publish(changes, threadId).pipe(Effect.asVoid);

    const snapshot = Effect.fn("DesignService.snapshot")(function* (threadId: ThreadId) {
      const nodes = yield* sql<NodeRow>`
        SELECT * FROM design_canvas_nodes
        WHERE thread_id = ${threadId}
        ORDER BY z, created_at
      `;
      // The thread's own sketches stay listed after their node is removed, so they can be placed again.
      const sketches = yield* sql<SketchRow>`
        SELECT * FROM design_sketches
        WHERE origin_thread_id = ${threadId}
          OR sketch_id IN (
            SELECT sketch_id FROM design_canvas_nodes WHERE thread_id = ${threadId}
          )
        ORDER BY created_at, rowid
      `;
      const viewports = yield* sql<{ x: number; y: number; zoom: number }>`
        SELECT x, y, zoom FROM design_canvas_viewports WHERE thread_id = ${threadId}
      `;
      const viewport = viewports[0];
      return {
        threadId,
        viewport: viewport ?? null,
        nodes: nodes.map(toNode),
        sketches: sketches.map(toSketch),
      } satisfies DesignCanvasSnapshot;
    }, Effect.mapError(storage));

    const subscribe = (threadId: ThreadId) =>
      Stream.unwrap(
        Effect.gen(function* () {
          // Subscribe before reading to buffer concurrent changes.
          const subscription = yield* PubSub.subscribe(changes);
          return Stream.concat(
            Stream.fromEffect(snapshot(threadId)),
            Stream.fromSubscription(subscription).pipe(
              Stream.filter((changed) => changed === threadId),
              Stream.mapEffect(() => snapshot(threadId)),
            ),
          );
        }),
      );

    const readNodes = (threadId: ThreadId) =>
      sql<NodeRow>`
        SELECT * FROM design_canvas_nodes WHERE thread_id = ${threadId}
      `.pipe(Effect.map((rows) => rows.map(toNode)));

    const readSketch = (sketchId: DesignSketchId) =>
      sql<SketchRow>`SELECT * FROM design_sketches WHERE sketch_id = ${sketchId}`.pipe(
        Effect.map((rows) => (rows[0] === undefined ? null : toSketch(rows[0]))),
      );

    const nextZ = (threadId: ThreadId) =>
      sql<{ z: number | null }>`
        SELECT MAX(z) AS z FROM design_canvas_nodes WHERE thread_id = ${threadId}
      `.pipe(Effect.map((rows) => (rows[0]?.z ?? -1) + 1));

    const attachmentPath = (attachmentId: string, extension: string) =>
      resolveAttachmentRelativePath({
        attachmentsDir: config.attachmentsDir,
        relativePath: `${attachmentId}.${extension}`,
      });

    // The project prefix keeps thread deletion from sweeping a sketch's files away.
    // A Frame print is the thread's own, so it takes the thread prefix and goes with the thread.
    const newAttachment = (prefix: string, extension: "html" | "png") => {
      const attachmentId = createAttachmentId(prefix, extension);
      const filePath = attachmentId === null ? null : attachmentPath(attachmentId, extension);
      return attachmentId === null || filePath === null
        ? Effect.fail(fail("The project id cannot name an attachment."))
        : Effect.succeed({ attachmentId, filePath });
    };

    const writeThumbnail = Effect.fn("DesignService.writeThumbnail")(function* (input: {
      readonly projectId: ProjectId;
      readonly page: DesignSketchPage;
      readonly written: Array<string>;
    }) {
      const htmlRender = yield* HtmlRender.HtmlRender;
      const preview = yield* htmlRender.preview({ html: input.page.html, width: input.page.width });
      const target = yield* newAttachment(`design-${input.projectId}`, "png");
      yield* fileSystem
        .writeFile(target.filePath, Buffer.from(preview.png, "base64"))
        .pipe(Effect.mapError(storage));
      input.written.push(target.filePath);
      return { attachmentId: target.attachmentId, contentHeight: preview.contentHeight };
    });

    const createSketches = Effect.fn("DesignService.createSketches")(function* (input: {
      readonly threadId: ThreadId;
      readonly projectId: ProjectId;
      readonly groupId?: string | undefined;
      readonly basedOn?: DesignSketchId | undefined;
      readonly pages: ReadonlyArray<DesignSketchPage>;
    }) {
      if (input.pages.length === 0) return yield* fail("A sketch needs at least one page.");
      const htmlRender = yield* HtmlRender.HtmlRender;
      const prepared = yield* Effect.forEach(input.pages, (page) => htmlRender.prepare(page.html));
      const basedOn =
        input.basedOn === undefined
          ? null
          : yield* readSketch(input.basedOn).pipe(Effect.mapError(storage));
      if (
        input.basedOn !== undefined &&
        (basedOn === null || basedOn.projectId !== input.projectId)
      ) {
        return yield* fail("The sketch to build on was not found in this project.");
      }
      const groupId =
        input.groupId ??
        (input.pages.length > 1
          ? `group:${yield* random.uuidV4().pipe(Effect.mapError(storage))}`
          : null);
      const now = iso(yield* DateTime.now);
      const written: Array<string> = [];
      yield* fileSystem
        .makeDirectory(config.attachmentsDir, { recursive: true })
        .pipe(Effect.mapError(storage));

      return yield* Effect.gen(function* () {
        const pages = yield* Effect.forEach(input.pages, (page, index) =>
          Effect.gen(function* () {
            const width = clampDesignSketchWidth(page.width);
            const html = yield* newAttachment(`design-${input.projectId}`, "html");
            yield* fileSystem
              .writeFileString(html.filePath, prepared[index]!)
              .pipe(Effect.mapError(storage));
            written.push(html.filePath);
            // A missing Chrome or a page that will not render only costs the thumbnail.
            const thumbnail = yield* writeThumbnail({
              projectId: input.projectId,
              page: { ...page, width },
              written,
            }).pipe(
              Effect.catch((cause) =>
                Effect.logWarning("Could not capture a design sketch thumbnail.", { cause }).pipe(
                  Effect.as(null),
                ),
              ),
            );
            const height = clampDesignSketchHeight(
              page.height ??
                Math.min(
                  thumbnail?.contentHeight ?? FALLBACK_SKETCH_HEIGHT,
                  DESIGN_SKETCH_DEFAULT_MAX_HEIGHT,
                ),
            );
            const uuid = yield* random.uuidV4().pipe(Effect.mapError(storage));
            const label = page.label?.trim().slice(0, MAX_VARIANT_LABEL_LENGTH) ?? "";
            return {
              id: DesignSketchId.make(`design-sketch:${uuid}`),
              nodeId: DesignNodeId.make(
                `design-node:${yield* random.uuidV4().pipe(Effect.mapError(storage))}`,
              ),
              width,
              height,
              title: page.title.trim().slice(0, 200) || "Sketch",
              label: label === "" ? null : label,
              htmlAttachmentId: html.attachmentId,
              thumbnailAttachmentId: thumbnail?.attachmentId ?? null,
            };
          }),
        );

        const created = yield* sql
          .withTransaction(
            Effect.gen(function* () {
              const existing = yield* readNodes(input.threadId);
              const original =
                basedOn === null
                  ? undefined
                  : existing.find((node) => node.kind === "sketch" && node.sketchId === basedOn.id);
              const positions = placeSketches(
                existing.map(rect),
                pages.map((page) => ({ width: page.width, height: page.height })),
                original === undefined ? undefined : rect(original),
              );
              const baseZ = yield* nextZ(input.threadId);
              for (const [index, page] of pages.entries()) {
                const position = positions[index]!;
                yield* sql`
                  INSERT INTO design_sketches ${sql.insert({
                    sketch_id: page.id,
                    project_id: input.projectId,
                    origin_thread_id: input.threadId,
                    group_id: groupId,
                    based_on_sketch_id: basedOn?.id ?? null,
                    title: page.title,
                    label: page.label,
                    html_attachment_id: page.htmlAttachmentId,
                    thumbnail_attachment_id: page.thumbnailAttachmentId,
                    width: page.width,
                    height: page.height,
                    created_at: now,
                  })}
                `;
                yield* sql`
                  INSERT INTO design_canvas_nodes ${sql.insert({
                    node_id: page.nodeId,
                    thread_id: input.threadId,
                    kind: "sketch",
                    sketch_id: page.id,
                    x: position.x,
                    y: position.y,
                    width: page.width,
                    height: page.height,
                    z: baseZ + index,
                    created_at: now,
                    updated_at: now,
                  })}
                `;
              }
              const rows = yield* sql<SketchRow>`
                SELECT * FROM design_sketches WHERE sketch_id IN ${sql.in(pages.map((page) => page.id))}
                ORDER BY created_at, rowid
              `;
              const byId = new Map(rows.map((row) => [row.sketch_id, toSketch(row)]));
              return pages.map((page) => designSketchReference(byId.get(page.id)!));
            }),
          )
          .pipe(Effect.mapError(storage));
        yield* notify(input.threadId);
        return created;
      }).pipe(
        // An interrupted or failed save must not leave files nobody references.
        Effect.onError(() =>
          Effect.forEach(
            written,
            (filePath) => fileSystem.remove(filePath, { force: true }).pipe(Effect.ignore),
            {
              discard: true,
            },
          ),
        ),
      );
    });

    const moveNodes = Effect.fn("DesignService.moveNodes")(function* (input: {
      readonly threadId: ThreadId;
      readonly nodes: ReadonlyArray<{
        readonly nodeId: DesignNodeId;
        readonly x: number;
        readonly y: number;
      }>;
    }) {
      if (input.nodes.length === 0) return;
      const now = iso(yield* DateTime.now);
      yield* sql
        .withTransaction(
          Effect.forEach(
            input.nodes,
            (node) => sql`
              UPDATE design_canvas_nodes SET x = ${node.x}, y = ${node.y}, updated_at = ${now}
              WHERE node_id = ${node.nodeId} AND thread_id = ${input.threadId}
            `,
            { discard: true },
          ),
        )
        .pipe(Effect.mapError(storage));
      yield* notify(input.threadId);
    });

    const setViewport = Effect.fn("DesignService.setViewport")(function* (input: {
      readonly threadId: ThreadId;
      readonly viewport: DesignViewport;
    }) {
      const now = iso(yield* DateTime.now);
      // Only the client that panned changes it, so no echo is published.
      yield* sql`
        INSERT INTO design_canvas_viewports (thread_id, x, y, zoom, updated_at)
        VALUES (${input.threadId}, ${input.viewport.x}, ${input.viewport.y}, ${input.viewport.zoom}, ${now})
        ON CONFLICT(thread_id) DO UPDATE SET
          x = excluded.x, y = excluded.y, zoom = excluded.zoom, updated_at = excluded.updated_at
      `.pipe(Effect.mapError(storage));
    });

    const removePrint = (attachmentId: string | null) => {
      const filePath = attachmentId === null ? null : attachmentPath(attachmentId, "png");
      return filePath === null
        ? Effect.void
        : fileSystem.remove(filePath, { force: true }).pipe(Effect.ignore);
    };

    const requireThread = Effect.fn("DesignService.requireThread")(function* (threadId: ThreadId) {
      const shell = yield* threads.getThreadShell(threadId).pipe(Effect.mapError(storage));
      if (shell === null || shell.deletedAt !== null)
        return yield* fail("The thread was not found.");
      return shell;
    });

    const readFrame = (threadId: ThreadId, nodeId: DesignNodeId) =>
      sql<NodeRow>`
        SELECT * FROM design_canvas_nodes
        WHERE node_id = ${nodeId} AND thread_id = ${threadId} AND kind = 'frame'
      `.pipe(Effect.map((rows) => rows[0] ?? null));

    const addFrame = Effect.fn("DesignService.addFrame")(function* (input: DesignAddFrameInput) {
      yield* requireThread(input.threadId);
      const uuid = yield* random.uuidV4().pipe(Effect.mapError(storage));
      const now = iso(yield* DateTime.now);
      const size = designFrameSize(input.device, input);
      const created = yield* sql
        .withTransaction(
          Effect.gen(function* () {
            if (input.auto === true) {
              const done = yield* sql`
                SELECT 1 FROM design_canvas_auto_frames WHERE thread_id = ${input.threadId}
              `;
              if (done.length > 0) return null;
              yield* sql`
                INSERT INTO design_canvas_auto_frames (thread_id, created_at)
                VALUES (${input.threadId}, ${now})
              `;
            }
            const existing = yield* readNodes(input.threadId);
            const [position] = placeSketches(existing.map(rect), [size]);
            const row: NodeRow = {
              node_id: `design-node:${uuid}`,
              thread_id: input.threadId,
              kind: "frame",
              sketch_id: null,
              x: position!.x,
              y: position!.y,
              width: size.width,
              height: size.height,
              z: yield* nextZ(input.threadId),
              url: input.url,
              device: input.device,
              title: input.title?.trim().slice(0, 200) || frameTitle(input.url),
              snapshot_attachment_id: null,
              group_id: null,
              group_label: null,
            };
            yield* sql`
              INSERT INTO design_canvas_nodes ${sql.insert({
                ...row,
                created_at: now,
                updated_at: now,
              })}
            `;
            return toNode(row) as DesignFrameNode;
          }),
        )
        .pipe(Effect.mapError(storage));
      if (created !== null) yield* notify(input.threadId);
      return created;
    });

    const updateFrame = Effect.fn("DesignService.updateFrame")(function* (
      input: DesignUpdateFrameInput,
    ) {
      const frame = yield* readFrame(input.threadId, input.nodeId).pipe(Effect.mapError(storage));
      if (frame === null) return yield* fail("The frame was not found.");
      const device = (input.device ?? frame.device) as DesignFrameNode["device"];
      const resized =
        input.device !== undefined || input.width !== undefined || input.height !== undefined;
      const size = resized
        ? designFrameSize(device, {
            width: input.width ?? frame.width,
            height: input.height ?? frame.height,
          })
        : { width: frame.width, height: frame.height };
      const url = input.url ?? frame.url;
      const changedPage =
        url !== frame.url || size.width !== frame.width || size.height !== frame.height;
      const now = iso(yield* DateTime.now);
      yield* sql`
        UPDATE design_canvas_nodes SET
          url = ${url}, device = ${device}, width = ${size.width}, height = ${size.height},
          title = ${input.title?.trim().slice(0, 200) || frame.title},
          snapshot_attachment_id = ${changedPage ? null : frame.snapshot_attachment_id},
          updated_at = ${now}
        WHERE node_id = ${input.nodeId} AND thread_id = ${input.threadId}
      `.pipe(Effect.mapError(storage));
      if (changedPage) yield* removePrint(frame.snapshot_attachment_id);
      yield* notify(input.threadId);
    });

    const setFrameSnapshot = Effect.fn("DesignService.setFrameSnapshot")(function* (
      input: DesignSetFrameSnapshotInput,
    ) {
      const png = Buffer.from(input.png, "base64");
      if (png.length < PNG_SIGNATURE.length || !png.subarray(0, 4).equals(PNG_SIGNATURE)) {
        return yield* fail("The frame print is not a PNG.");
      }
      const frame = yield* readFrame(input.threadId, input.nodeId).pipe(Effect.mapError(storage));
      if (frame === null) return yield* fail("The frame was not found.");
      const target = yield* newAttachment(input.threadId, "png");
      yield* fileSystem
        .makeDirectory(config.attachmentsDir, { recursive: true })
        .pipe(Effect.mapError(storage));
      yield* fileSystem.writeFile(target.filePath, png).pipe(Effect.mapError(storage));
      const now = iso(yield* DateTime.now);
      const updated = yield* sql`
        UPDATE design_canvas_nodes
        SET snapshot_attachment_id = ${target.attachmentId}, updated_at = ${now}
        WHERE node_id = ${input.nodeId} AND thread_id = ${input.threadId} AND kind = 'frame'
        RETURNING node_id
      `.pipe(
        Effect.mapError(storage),
        Effect.onError(() => removePrint(target.attachmentId)),
      );
      if (updated.length === 0) {
        yield* removePrint(target.attachmentId);
        return yield* fail("The frame was not found.");
      }
      yield* removePrint(frame.snapshot_attachment_id);
      yield* notify(input.threadId);
    });

    const removeNode = Effect.fn("DesignService.removeNode")(function* (input: {
      readonly threadId: ThreadId;
      readonly nodeId: DesignNodeId;
    }) {
      const rows = yield* sql<{ snapshot_attachment_id: string | null }>`
        SELECT snapshot_attachment_id FROM design_canvas_nodes
        WHERE node_id = ${input.nodeId} AND thread_id = ${input.threadId}
      `.pipe(Effect.mapError(storage));
      yield* sql`
        DELETE FROM design_canvas_nodes
        WHERE node_id = ${input.nodeId} AND thread_id = ${input.threadId}
      `.pipe(Effect.mapError(storage));
      yield* removePrint(rows[0]?.snapshot_attachment_id ?? null);
      yield* notify(input.threadId);
    });

    const placeSketch = Effect.fn("DesignService.placeSketch")(function* (input: {
      readonly threadId: ThreadId;
      readonly sketchId: DesignSketchId;
    }) {
      const shell = yield* threads.getThreadShell(input.threadId).pipe(Effect.mapError(storage));
      if (shell === null || shell.deletedAt !== null) {
        return yield* fail("The thread was not found.");
      }
      const sketch = yield* readSketch(input.sketchId).pipe(Effect.mapError(storage));
      if (sketch === null || sketch.projectId !== shell.projectId) {
        return yield* fail("The sketch was not found in this thread's project.");
      }
      const uuid = yield* random.uuidV4().pipe(Effect.mapError(storage));
      const now = iso(yield* DateTime.now);
      const node = yield* sql
        .withTransaction(
          Effect.gen(function* () {
            const existing = yield* readNodes(input.threadId);
            const placed = existing.find(
              (node) => node.kind === "sketch" && node.sketchId === sketch.id,
            );
            if (placed !== undefined) return { node: placed, created: false };
            const [position] = placeSketches(existing.map(rect), [
              { width: sketch.width, height: sketch.height },
            ]);
            const z = yield* nextZ(input.threadId);
            const row: NodeRow = {
              node_id: `design-node:${uuid}`,
              thread_id: input.threadId,
              kind: "sketch",
              sketch_id: sketch.id,
              x: position!.x,
              y: position!.y,
              width: sketch.width,
              height: sketch.height,
              z,
              url: null,
              device: null,
              title: null,
              snapshot_attachment_id: null,
              group_id: null,
              group_label: null,
            };
            yield* sql`
              INSERT INTO design_canvas_nodes ${sql.insert({
                ...row,
                created_at: now,
                updated_at: now,
              })}
            `;
            return { node: toNode(row), created: true };
          }),
        )
        .pipe(Effect.mapError(storage));
      if (node.created) yield* notify(input.threadId);
      return node.node;
    });

    const arrange = Effect.fn("DesignService.arrange")(function* (input: DesignArrangeInput) {
      yield* requireThread(input.threadId);
      const moves = input.moves ?? [];
      const remove = input.remove ?? [];
      const group = input.group;
      const groupIds = group?.nodeIds ?? [];
      if (new Set(groupIds).size !== groupIds.length || new Set(remove).size !== remove.length) {
        return yield* fail("A node can be listed only once per list.");
      }
      const moved = new Set(moves.map((move) => move.nodeId));
      if (moved.size !== moves.length) return yield* fail("A node can be moved only once.");
      const removed = new Set<string>(remove);
      const clash = [...moved, ...groupIds].find((id) => removed.has(id));
      if (clash !== undefined) return yield* fail(`Node ${clash} cannot be moved and removed.`);
      const now = iso(yield* DateTime.now);
      const outcome = yield* sql
        .withTransaction(
          Effect.gen(function* () {
            const rows = yield* sql<NodeRow>`
              SELECT * FROM design_canvas_nodes WHERE thread_id = ${input.threadId}
            `;
            const byId = new Map(rows.map((row) => [row.node_id, row]));
            const missing = [...moved, ...groupIds, ...removed].find((id) => !byId.has(id));
            if (missing !== undefined) return { missing } as const;
            const positions = new Map<string, { x: number; y: number }>();
            for (const move of moves) positions.set(move.nodeId, { x: move.x, y: move.y });
            if (group !== undefined && groupIds.length > 0) {
              const members = new Set<string>(groupIds);
              const others = rows
                .filter((row) => !members.has(row.node_id) && !removed.has(row.node_id))
                .map((row) => ({
                  ...(positions.get(row.node_id) ?? { x: row.x, y: row.y }),
                  width: row.width,
                  height: row.height,
                }));
              const placed = placeSketches(
                others,
                groupIds.map((id) => ({
                  width: byId.get(id)!.width,
                  height: byId.get(id)!.height,
                })),
              );
              groupIds.forEach((id, index) => positions.set(id, placed[index]!));
            }
            for (const [nodeId, position] of positions) {
              yield* sql`
                UPDATE design_canvas_nodes SET
                  x = ${position.x}, y = ${position.y}, updated_at = ${now}
                WHERE node_id = ${nodeId} AND thread_id = ${input.threadId}
              `;
            }
            if (group !== undefined && groupIds.length > 0) {
              const uuid = yield* random.uuidV4();
              const label = group.label.trim().slice(0, 200);
              for (const id of groupIds) {
                yield* sql`
                  UPDATE design_canvas_nodes SET
                    group_id = ${`group:${uuid}`}, group_label = ${label}, updated_at = ${now}
                  WHERE node_id = ${id} AND thread_id = ${input.threadId}
                `;
              }
            }
            for (const id of removed) {
              yield* sql`
                DELETE FROM design_canvas_nodes
                WHERE node_id = ${id} AND thread_id = ${input.threadId}
              `;
            }
            return {
              prints: [...removed].map((id) => byId.get(id)!.snapshot_attachment_id),
            } as const;
          }),
        )
        .pipe(Effect.mapError(storage));
      if ("missing" in outcome)
        return yield* fail(`Node ${outcome.missing} is not on this canvas.`);
      yield* Effect.forEach(outcome.prints, removePrint, { discard: true });
      yield* notify(input.threadId);
      return yield* readNodes(input.threadId).pipe(Effect.mapError(storage));
    });

    const listProjectSketches = Effect.fn("DesignService.listProjectSketches")(function* (
      input: DesignListProjectSketchesInput,
    ) {
      const [cursorAt, cursorRowid] = (input.cursor ?? "").split("|");
      const hasCursor = cursorAt !== undefined && cursorAt !== "" && cursorRowid !== undefined;
      const query = input.query?.trim() ?? "";
      const rows = yield* sql<SketchRow & { readonly rid: number }>`
        SELECT s.*, s.rowid AS rid FROM design_sketches s
        WHERE s.project_id = ${input.projectId}
          AND (${query} = '' OR instr(lower(s.title), lower(${query})) > 0)
          AND (
            ${hasCursor ? 1 : 0} = 0
            OR s.created_at < ${cursorAt ?? ""}
            OR (s.created_at = ${cursorAt ?? ""} AND s.rowid < ${Number(cursorRowid ?? 0)})
          )
        ORDER BY s.created_at DESC, s.rowid DESC
        LIMIT ${DESIGN_PROJECT_SKETCHES_PAGE_SIZE + 1}
      `.pipe(Effect.mapError(storage));
      const page = rows.slice(0, DESIGN_PROJECT_SKETCHES_PAGE_SIZE);
      const last = page.at(-1);
      const origins = new Map<string, { title: string | null; deleted: boolean }>();
      yield* Effect.forEach(
        new Set(page.map((row) => row.origin_thread_id)),
        (threadId) =>
          threads.getThreadShell(threadId as ThreadId).pipe(
            Effect.orElseSucceed(() => null),
            Effect.map((shell) =>
              origins.set(
                threadId,
                shell === null || shell.deletedAt !== null
                  ? { title: null, deleted: true }
                  : { title: shell.title, deleted: false },
              ),
            ),
          ),
        { discard: true },
      );
      return {
        sketches: page.map((row) => {
          const origin = origins.get(row.origin_thread_id);
          return {
            ...toSketch(row),
            originThreadTitle: origin?.title ?? null,
            originThreadDeleted: origin?.deleted ?? true,
          };
        }),
        nextCursor: rows.length > page.length && last ? `${last.created_at}|${last.rid}` : null,
      } as DesignProjectSketchesPage;
    });

    // The server cannot see which desktop tab runs a Frame, so the client reports it while live.
    const liveFrames = new Map<string, string>();
    const liveKey = (threadId: string, nodeId: string) => `${threadId}\u0000${nodeId}`;
    const reportLiveFrame = (input: DesignReportLiveFrameInput) =>
      Effect.sync(() => {
        const key = liveKey(input.threadId, input.nodeId);
        if (input.tabId === null) liveFrames.delete(key);
        else liveFrames.set(key, input.tabId);
      });
    const liveFrameTab = (threadId: ThreadId, nodeId: DesignNodeId) =>
      Effect.sync(() => liveFrames.get(liveKey(threadId, nodeId)) ?? null);

    const selections = new Map<string, DesignSelection>();
    const setSelection = (input: DesignSetSelectionInput) =>
      Effect.sync(() => {
        selections.set(input.threadId, input.selection);
      });
    const readSelection = (threadId: ThreadId) =>
      Effect.sync(() => selections.get(threadId) ?? null);

    const readFramePrint = Effect.fn("DesignService.readFramePrint")(function* (
      threadId: ThreadId,
      nodeId: DesignNodeId,
    ) {
      const frame = yield* readFrame(threadId, nodeId).pipe(Effect.mapError(storage));
      if (frame === null) return yield* fail("The frame was not found.");
      const filePath =
        frame.snapshot_attachment_id === null
          ? null
          : attachmentPath(frame.snapshot_attachment_id, "png");
      if (filePath === null) return null;
      const bytes = yield* fileSystem.readFile(filePath).pipe(Effect.orElseSucceed(() => null));
      if (bytes === null || bytes.length < 24) return null;
      const view = Buffer.from(bytes);
      return {
        png: view.toString("base64"),
        width: view.readUInt32BE(16),
        height: view.readUInt32BE(20),
      };
    });

    const cleanupThread = Effect.fn("DesignService.cleanupThread")(function* (threadId: ThreadId) {
      selections.delete(threadId);
      for (const key of liveFrames.keys()) {
        if (key.startsWith(`${threadId}\u0000`)) liveFrames.delete(key);
      }
      yield* deleteThreadCanvas(threadId).pipe(
        Effect.provideService(SqlClient.SqlClient, sql),
        Effect.mapError(storage),
      );
      yield* notify(threadId);
    });

    return DesignService.of({
      snapshot,
      subscribe,
      createSketches,
      moveNodes,
      setViewport,
      removeNode,
      placeSketch,
      addFrame,
      updateFrame,
      setFrameSnapshot,
      arrange,
      listProjectSketches,
      reportLiveFrame,
      liveFrameTab,
      setSelection,
      readSelection,
      readFramePrint,
      cleanupThread,
    });
  }),
);
