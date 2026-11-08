import {
  type ThreadId,
  type WorkModule,
  WorkModuleError,
  WorkModuleId,
  type WorkModuleMoveInput,
  type WorkModuleSnapshot,
  type WorkModuleStatus,
  type WorkModuleThreadLink,
  type WorkModuleUpsertInput,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";

import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";

export class WorkModuleService extends Context.Service<
  WorkModuleService,
  {
    readonly snapshot: () => Effect.Effect<WorkModuleSnapshot, WorkModuleError>;
    readonly subscribe: () => Stream.Stream<WorkModuleSnapshot, WorkModuleError>;
    readonly upsert: (input: WorkModuleUpsertInput) => Effect.Effect<WorkModule, WorkModuleError>;
    readonly move: (input: WorkModuleMoveInput) => Effect.Effect<WorkModule, WorkModuleError>;
    readonly delete: (id: WorkModuleId) => Effect.Effect<ReadonlyArray<WorkModuleId>, WorkModuleError>;
    readonly linkThread: (input: {
      readonly threadId: ThreadId;
      readonly moduleId: WorkModuleId;
      readonly suggested: boolean;
    }) => Effect.Effect<WorkModuleThreadLink, WorkModuleError>;
    readonly unlinkThreads: (threadIds: ReadonlyArray<ThreadId>) => Effect.Effect<void, WorkModuleError>;
    readonly confirmSuggestion: (threadId: ThreadId) => Effect.Effect<WorkModuleThreadLink, WorkModuleError>;
    readonly appendAgentNote: (input: {
      readonly moduleId: WorkModuleId;
      readonly text: string;
    }) => Effect.Effect<WorkModule, WorkModuleError>;
    readonly moduleForThread: (
      threadId: ThreadId,
    ) => Effect.Effect<{ readonly module: WorkModule; readonly link: WorkModuleThreadLink } | null, WorkModuleError>;
  }
>()("t3/workModules/WorkModuleService") {}

interface ModuleRow {
  readonly module_id: string;
  readonly project_id: string;
  readonly parent_module_id: string | null;
  readonly title: string;
  readonly note: string;
  readonly status: WorkModuleStatus;
  readonly waiting_reason: string | null;
  readonly due_date: string | null;
  readonly position: number;
  readonly status_changed_at: string;
  readonly created_at: string;
  readonly updated_at: string;
}

interface LinkRow {
  readonly thread_id: string;
  readonly module_id: string;
  readonly suggested: number;
  readonly linked_at: string;
}

const fail = (message: string, input?: { moduleId?: WorkModuleId; cause?: unknown }) =>
  new WorkModuleError({
    message,
    ...(input?.moduleId === undefined ? {} : { moduleId: input.moduleId }),
    ...(input?.cause === undefined ? {} : { cause: input.cause }),
  });

const storage = (cause: unknown) => fail("Work modules could not be saved or read.", { cause });

// Rows were written by this service from decoded inputs, so they are trusted here.
const toModule = (row: ModuleRow): WorkModule =>
  ({
    id: row.module_id,
    projectId: row.project_id,
    parentId: row.parent_module_id,
    title: row.title,
    note: row.note,
    status: row.status,
    waitingReason: row.waiting_reason,
    dueDate: row.due_date,
    position: row.position,
    statusChangedAt: row.status_changed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }) as WorkModule;

const toLink = (row: LinkRow): WorkModuleThreadLink =>
  ({
    threadId: row.thread_id,
    moduleId: row.module_id,
    suggested: row.suggested === 1,
    linkedAt: row.linked_at,
  }) as WorkModuleThreadLink;

const iso = (value: DateTime.DateTime) => DateTime.formatIso(DateTime.toUtc(value));

export const layer = Layer.effect(
  WorkModuleService,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const random = yield* SecureRandom.SecureRandom;
    const threads = yield* ThreadManagementService.ThreadManagementService;
    // Each notification re-reads the whole snapshot, so only the newest signal matters.
    const changes = yield* PubSub.sliding<void>(1);
    const notify = PubSub.publish(changes, undefined).pipe(Effect.asVoid);

    const readModule = (id: WorkModuleId) =>
      sql<ModuleRow>`SELECT * FROM work_modules WHERE module_id = ${id}`.pipe(
        Effect.mapError(storage),
        Effect.flatMap((rows) =>
          rows[0] === undefined
            ? Effect.fail(fail("The module was not found.", { moduleId: id }))
            : Effect.succeed(toModule(rows[0])),
        ),
      );

    const subtreeIds = (id: WorkModuleId) =>
      sql<{ id: string }>`
        WITH RECURSIVE subtree(id) AS (
          SELECT ${id}
          UNION ALL
          SELECT m.module_id FROM work_modules m JOIN subtree ON m.parent_module_id = subtree.id
        )
        SELECT id FROM subtree
      `.pipe(
        Effect.mapError(storage),
        Effect.map((rows) => rows.map((row) => row.id as WorkModuleId)),
      );

    const snapshot = Effect.fn("WorkModuleService.snapshot")(function* () {
      const modules = yield* sql<ModuleRow>`
        SELECT * FROM work_modules ORDER BY project_id, parent_module_id, position
      `.pipe(Effect.mapError(storage));
      const links = yield* sql<LinkRow>`SELECT * FROM work_module_threads`.pipe(Effect.mapError(storage));
      return { modules: modules.map(toModule), links: links.map(toLink) };
    });

    const subscribe = () =>
      Stream.unwrap(
        Effect.gen(function* () {
          // Subscribe before reading to buffer concurrent changes.
          const subscription = yield* PubSub.subscribe(changes);
          return Stream.concat(
            Stream.fromEffect(snapshot()),
            Stream.fromSubscription(subscription).pipe(Stream.mapEffect(() => snapshot())),
          );
        }),
      );

    const upsert = Effect.fn("WorkModuleService.upsert")(function* (input: WorkModuleUpsertInput) {
      const now = iso(yield* DateTime.now);
      if (input.id === undefined) {
        if (input.title === undefined) return yield* fail("A new module needs a title.");
        const parentId = input.parentId ?? null;
        if (parentId !== null) {
          const parent = yield* readModule(parentId);
          if (parent.projectId !== input.projectId) {
            return yield* fail("Modules can only move within their project.", { moduleId: parentId });
          }
        }
        const status = input.status ?? "idea";
        const waitingReason = status === "waiting" ? (input.waitingReason ?? null) : null;
        if (status === "waiting" && waitingReason === null) {
          return yield* fail("A waiting module needs a reason.");
        }
        const uuid = yield* random.uuidV4().pipe(Effect.mapError(storage));
        const id = WorkModuleId.make(`work-module:${uuid}`);
        const next = yield* sql<{ next: number }>`
          SELECT COALESCE(MAX(position) + 1, 0) AS next FROM work_modules
          WHERE project_id = ${input.projectId} AND parent_module_id IS ${parentId}
        `.pipe(Effect.mapError(storage));
        yield* sql`
          INSERT INTO work_modules ${sql.insert({
            module_id: id,
            project_id: input.projectId,
            parent_module_id: parentId,
            title: input.title,
            note: input.note ?? "",
            status,
            waiting_reason: waitingReason,
            due_date: input.dueDate ?? null,
            position: next[0]?.next ?? 0,
            status_changed_at: now,
            created_at: now,
            updated_at: now,
          })}
        `.pipe(Effect.mapError(storage));
        yield* notify;
        return yield* readModule(id);
      }
      const existing = yield* readModule(input.id);
      if (existing.projectId !== input.projectId) {
        return yield* fail("Modules can only move within their project.", { moduleId: input.id });
      }
      const status = input.status ?? existing.status;
      const waitingReason =
        status === "waiting"
          ? input.waitingReason === undefined
            ? existing.waitingReason
            : input.waitingReason
          : null;
      if (status === "waiting" && waitingReason === null) {
        return yield* fail("A waiting module needs a reason.", { moduleId: input.id });
      }
      yield* sql`
        UPDATE work_modules SET
          title = ${input.title ?? existing.title},
          note = ${input.note ?? existing.note},
          status = ${status},
          waiting_reason = ${waitingReason},
          due_date = ${input.dueDate === undefined ? existing.dueDate : input.dueDate},
          status_changed_at = ${status === existing.status ? existing.statusChangedAt : now},
          updated_at = ${now}
        WHERE module_id = ${input.id}
      `.pipe(Effect.mapError(storage));
      yield* notify;
      return yield* readModule(input.id);
    });

    const move = Effect.fn("WorkModuleService.move")(function* (input: WorkModuleMoveInput) {
      const target = yield* readModule(input.id);
      if (input.parentId !== null) {
        const parent = yield* readModule(input.parentId);
        if (parent.projectId !== target.projectId) {
          return yield* fail("Modules can only move within their project.", { moduleId: input.id });
        }
        const inside = yield* subtreeIds(input.id);
        if (inside.includes(input.parentId)) {
          return yield* fail("A module cannot move inside itself.", { moduleId: input.id });
        }
      }
      const now = iso(yield* DateTime.now);
      yield* sql
        .withTransaction(
          Effect.gen(function* () {
            const siblings = yield* sql<{ module_id: string }>`
              SELECT module_id FROM work_modules
              WHERE project_id = ${target.projectId} AND parent_module_id IS ${input.parentId}
                AND module_id != ${input.id}
              ORDER BY position
            `;
            const order = siblings.map((row) => row.module_id);
            order.splice(Math.min(input.index, order.length), 0, input.id);
            for (const [position, id] of order.entries()) {
              yield* sql`
                UPDATE work_modules SET position = ${position},
                  parent_module_id = CASE WHEN module_id = ${input.id} THEN ${input.parentId} ELSE parent_module_id END,
                  updated_at = CASE WHEN module_id = ${input.id} THEN ${now} ELSE updated_at END
                WHERE module_id = ${id}
              `;
            }
          }),
        )
        .pipe(Effect.mapError(storage));
      yield* notify;
      return yield* readModule(input.id);
    });

    const deleteModule = Effect.fn("WorkModuleService.delete")(function* (id: WorkModuleId) {
      yield* readModule(id);
      const ids = yield* subtreeIds(id);
      yield* sql
        .withTransaction(
          Effect.gen(function* () {
            yield* sql`DELETE FROM work_module_threads WHERE module_id IN ${sql.in(ids)}`;
            yield* sql`DELETE FROM work_modules WHERE module_id IN ${sql.in(ids)}`;
          }),
        )
        .pipe(Effect.mapError(storage));
      yield* notify;
      return ids;
    });

    const readLink = (threadId: ThreadId) =>
      sql<LinkRow>`SELECT * FROM work_module_threads WHERE thread_id = ${threadId}`.pipe(
        Effect.mapError(storage),
        Effect.map((rows) => (rows[0] === undefined ? null : toLink(rows[0]))),
      );

    const linkThread = Effect.fn("WorkModuleService.linkThread")(function* (input: {
      readonly threadId: ThreadId;
      readonly moduleId: WorkModuleId;
      readonly suggested: boolean;
    }) {
      const module = yield* readModule(input.moduleId);
      const shell = yield* threads.getThreadShell(input.threadId).pipe(Effect.mapError(storage));
      if (shell === null || shell.deletedAt !== null) return yield* fail("The thread was not found.");
      if (shell.projectId !== module.projectId) {
        return yield* fail("The thread belongs to another project.", { moduleId: input.moduleId });
      }
      if (input.suggested) {
        const current = yield* readLink(input.threadId);
        if (current !== null && !current.suggested) {
          return yield* fail("The user already linked this thread; a suggestion cannot replace it.");
        }
      }
      const now = iso(yield* DateTime.now);
      yield* sql`
        INSERT INTO work_module_threads ${sql.insert({
          thread_id: input.threadId,
          module_id: input.moduleId,
          suggested: input.suggested ? 1 : 0,
          linked_at: now,
        })}
        ON CONFLICT(thread_id) DO UPDATE SET
          module_id = excluded.module_id,
          suggested = excluded.suggested,
          linked_at = excluded.linked_at
      `.pipe(Effect.mapError(storage));
      yield* notify;
      return { threadId: input.threadId, moduleId: input.moduleId, suggested: input.suggested, linkedAt: now };
    });

    const unlinkThreads = Effect.fn("WorkModuleService.unlinkThreads")(function* (
      threadIds: ReadonlyArray<ThreadId>,
    ) {
      if (threadIds.length === 0) return;
      const removed = yield* sql<{ thread_id: string }>`
        DELETE FROM work_module_threads WHERE thread_id IN ${sql.in(threadIds)} RETURNING thread_id
      `.pipe(Effect.mapError(storage));
      if (removed.length > 0) yield* notify;
    });

    const confirmSuggestion = Effect.fn("WorkModuleService.confirmSuggestion")(function* (
      threadId: ThreadId,
    ) {
      const rows = yield* sql<LinkRow>`
        UPDATE work_module_threads SET suggested = 0 WHERE thread_id = ${threadId} RETURNING *
      `.pipe(Effect.mapError(storage));
      if (rows[0] === undefined) return yield* fail("There is no suggestion for this thread.");
      yield* notify;
      return toLink(rows[0]);
    });

    const appendAgentNote = Effect.fn("WorkModuleService.appendAgentNote")(function* (input: {
      readonly moduleId: WorkModuleId;
      readonly text: string;
    }) {
      const module = yield* readModule(input.moduleId);
      const now = yield* DateTime.now;
      const line = `${iso(now).slice(0, 10)} · agent: ${input.text.trim()}`;
      const note = module.note.length === 0 ? line : `${module.note}\n${line}`;
      yield* sql`
        UPDATE work_modules SET note = ${note}, updated_at = ${iso(now)} WHERE module_id = ${input.moduleId}
      `.pipe(Effect.mapError(storage));
      yield* notify;
      return yield* readModule(input.moduleId);
    });

    const moduleForThread = Effect.fn("WorkModuleService.moduleForThread")(function* (
      threadId: ThreadId,
    ) {
      const link = yield* readLink(threadId);
      if (link === null) return null;
      return { module: yield* readModule(link.moduleId), link };
    });

    return WorkModuleService.of({
      snapshot,
      subscribe,
      upsert,
      move,
      delete: deleteModule,
      linkThread,
      unlinkThreads,
      confirmSuggestion,
      appendAgentNote,
      moduleForThread,
    });
  }),
);
