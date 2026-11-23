import {
  type ProjectChecklistItem,
  ProjectChecklistError,
  ProjectChecklistItemId,
  type ProjectChecklistMoveInput,
  type ProjectChecklistSnapshot,
  type ProjectChecklistUpsertInput,
  type ProjectId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";

export class ProjectChecklistService extends Context.Service<
  ProjectChecklistService,
  {
    readonly snapshot: (
      projectId: ProjectId,
    ) => Effect.Effect<ProjectChecklistSnapshot, ProjectChecklistError>;
    readonly subscribe: (
      projectId: ProjectId,
    ) => Stream.Stream<ProjectChecklistSnapshot, ProjectChecklistError>;
    readonly upsert: (
      input: ProjectChecklistUpsertInput,
    ) => Effect.Effect<ProjectChecklistItem, ProjectChecklistError>;
    readonly move: (
      input: ProjectChecklistMoveInput,
    ) => Effect.Effect<ProjectChecklistItem, ProjectChecklistError>;
    readonly delete: (
      id: ProjectChecklistItemId,
    ) => Effect.Effect<ReadonlyArray<ProjectChecklistItemId>, ProjectChecklistError>;
    readonly deleteForProject: (projectId: ProjectId) => Effect.Effect<void, ProjectChecklistError>;
  }
>()("t3/projectChecklist/ProjectChecklistService") {}

interface ItemRow {
  readonly id: string;
  readonly project_id: string;
  readonly parent_id: string | null;
  readonly title: string;
  readonly done: number;
  readonly due_date: string | null;
  readonly position: number;
  readonly created_at: string;
  readonly updated_at: string;
}

const fail = (message: string, input?: { itemId?: ProjectChecklistItemId; cause?: unknown }) =>
  new ProjectChecklistError({
    message,
    ...(input?.itemId === undefined ? {} : { itemId: input.itemId }),
    ...(input?.cause === undefined ? {} : { cause: input.cause }),
  });

const storage = (cause: unknown) => fail("The checklist could not be saved or read.", { cause });

// Rows were written by this service from decoded inputs, so they are trusted here.
const toItem = (row: ItemRow): ProjectChecklistItem =>
  ({
    id: row.id,
    projectId: row.project_id,
    parentId: row.parent_id,
    title: row.title,
    done: row.done === 1,
    dueDate: row.due_date,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }) as ProjectChecklistItem;

const iso = (value: DateTime.DateTime) => DateTime.formatIso(DateTime.toUtc(value));

export const layer = Layer.effect(
  ProjectChecklistService,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const random = yield* SecureRandom.SecureRandom;
    // Subscribers re-read their project on any signal, so a dropped signal only costs a re-read.
    const changes = yield* PubSub.sliding<ProjectId>(256);
    const notify = (projectId: ProjectId) => PubSub.publish(changes, projectId).pipe(Effect.asVoid);

    const readItem = (id: ProjectChecklistItemId) =>
      sql<ItemRow>`SELECT * FROM project_checklist_items WHERE id = ${id}`.pipe(
        Effect.mapError(storage),
        Effect.flatMap((rows) =>
          rows[0] === undefined
            ? Effect.fail(fail("The checklist item was not found.", { itemId: id }))
            : Effect.succeed(toItem(rows[0])),
        ),
      );

    const snapshot = Effect.fn("ProjectChecklistService.snapshot")(function* (
      projectId: ProjectId,
    ) {
      const rows = yield* sql<ItemRow>`
        SELECT * FROM project_checklist_items
        WHERE project_id = ${projectId}
        ORDER BY parent_id, position
      `;
      return { items: rows.map(toItem) };
    }, Effect.mapError(storage));

    const subscribe = (projectId: ProjectId) =>
      Stream.unwrap(
        Effect.gen(function* () {
          // Subscribe before reading to buffer concurrent changes.
          const subscription = yield* PubSub.subscribe(changes);
          return Stream.concat(
            Stream.fromEffect(snapshot(projectId)),
            Stream.fromSubscription(subscription).pipe(
              Stream.filter((changed) => changed === projectId),
              Stream.mapEffect(() => snapshot(projectId)),
            ),
          );
        }),
      );

    const nextPosition = (projectId: ProjectId, parentId: ProjectChecklistItemId | null) =>
      sql<{ next: number }>`
        SELECT COALESCE(MAX(position) + 1, 0) AS next FROM project_checklist_items
        WHERE project_id = ${projectId} AND parent_id IS ${parentId}
      `.pipe(
        Effect.mapError(storage),
        Effect.map((rows) => rows[0]?.next ?? 0),
      );

    const create = Effect.fn("ProjectChecklistService.create")(function* (
      input: ProjectChecklistUpsertInput,
      now: string,
    ) {
      if (input.title === undefined) return yield* fail("A new checklist item needs a title.");
      const parentId = input.parentId ?? null;
      if (parentId !== null) {
        const parent = yield* readItem(parentId);
        if (parent.projectId !== input.projectId) {
          return yield* fail("The module belongs to another project.", { itemId: parentId });
        }
        if (parent.parentId !== null) {
          return yield* fail("Items cannot hold other items.", { itemId: parentId });
        }
      }
      const uuid = yield* random.uuidV4().pipe(Effect.mapError(storage));
      const id = ProjectChecklistItemId.make(`checklist-item:${uuid}`);
      const position = yield* nextPosition(input.projectId, parentId);
      yield* sql
        .withTransaction(
          Effect.gen(function* () {
            yield* sql`
              INSERT INTO project_checklist_items ${sql.insert({
                id,
                project_id: input.projectId,
                parent_id: parentId,
                title: input.title,
                done: input.done === true ? 1 : 0,
                due_date: input.dueDate ?? null,
                position,
                created_at: now,
                updated_at: now,
              })}
            `;
            // A finished module with a new open item is no longer finished.
            if (parentId !== null && input.done !== true) {
              yield* sql`
                UPDATE project_checklist_items SET done = 0, updated_at = ${now}
                WHERE id = ${parentId} AND done = 1
              `;
            }
          }),
        )
        .pipe(Effect.mapError(storage));
      yield* notify(input.projectId);
      return yield* readItem(id);
    });

    const update = Effect.fn("ProjectChecklistService.update")(function* (
      id: ProjectChecklistItemId,
      input: ProjectChecklistUpsertInput,
      now: string,
    ) {
      const existing = yield* readItem(id);
      if (existing.projectId !== input.projectId) {
        return yield* fail("The item belongs to another project.", { itemId: id });
      }
      const done = input.done ?? existing.done;
      yield* sql
        .withTransaction(
          Effect.gen(function* () {
            yield* sql`
              UPDATE project_checklist_items SET
                title = ${input.title ?? existing.title},
                due_date = ${input.dueDate === undefined ? existing.dueDate : input.dueDate},
                done = ${done ? 1 : 0},
                updated_at = ${now}
              WHERE id = ${id}
            `;
            if (done === existing.done) return;
            if (existing.parentId === null) {
              yield* sql`
                UPDATE project_checklist_items SET done = ${done ? 1 : 0}, updated_at = ${now}
                WHERE parent_id = ${id}
              `;
            } else if (!done) {
              yield* sql`
                UPDATE project_checklist_items SET done = 0, updated_at = ${now}
                WHERE id = ${existing.parentId} AND done = 1
              `;
            }
          }),
        )
        .pipe(Effect.mapError(storage));
      yield* notify(existing.projectId);
      return yield* readItem(id);
    });

    const upsert = Effect.fn("ProjectChecklistService.upsert")(function* (
      input: ProjectChecklistUpsertInput,
    ) {
      const now = iso(yield* DateTime.now);
      return input.id === undefined
        ? yield* create(input, now)
        : yield* update(input.id, input, now);
    });

    const move = Effect.fn("ProjectChecklistService.move")(function* (
      input: ProjectChecklistMoveInput,
    ) {
      const target = yield* readItem(input.id);
      const now = iso(yield* DateTime.now);
      yield* sql
        .withTransaction(
          Effect.gen(function* () {
            const siblings = yield* sql<{ id: string }>`
              SELECT id FROM project_checklist_items
              WHERE project_id = ${target.projectId} AND parent_id IS ${target.parentId}
                AND id != ${input.id}
              ORDER BY position
            `;
            const order = siblings.map((row) => row.id);
            order.splice(Math.min(input.index, order.length), 0, input.id);
            for (const [position, id] of order.entries()) {
              yield* sql`
                UPDATE project_checklist_items SET position = ${position},
                  updated_at = CASE WHEN id = ${input.id} THEN ${now} ELSE updated_at END
                WHERE id = ${id}
              `;
            }
          }),
        )
        .pipe(Effect.mapError(storage));
      yield* notify(target.projectId);
      return yield* readItem(input.id);
    });

    const deleteItem = Effect.fn("ProjectChecklistService.delete")(function* (
      id: ProjectChecklistItemId,
    ) {
      const target = yield* readItem(id);
      const children = yield* sql<{ id: string }>`
        SELECT id FROM project_checklist_items WHERE parent_id = ${id}
      `.pipe(Effect.mapError(storage));
      const ids = [id, ...children.map((row) => row.id as ProjectChecklistItemId)];
      yield* sql`DELETE FROM project_checklist_items WHERE id IN ${sql.in(ids)}`.pipe(
        Effect.mapError(storage),
      );
      yield* notify(target.projectId);
      return ids;
    });

    const deleteForProject = Effect.fn("ProjectChecklistService.deleteForProject")(function* (
      projectId: ProjectId,
    ) {
      yield* sql`DELETE FROM project_checklist_items WHERE project_id = ${projectId}`.pipe(
        Effect.mapError(storage),
      );
      yield* notify(projectId);
    });

    return ProjectChecklistService.of({
      snapshot,
      subscribe,
      upsert,
      move,
      delete: deleteItem,
      deleteForProject,
    });
  }),
);
