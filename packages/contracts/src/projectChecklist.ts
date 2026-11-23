import * as Schema from "effect/Schema";

import {
  ForwardCompatibleArray,
  IsoDateTime,
  ProjectChecklistItemId,
  ProjectId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import { WorkModuleDueDate } from "./workModule.ts";

const ProjectChecklistTitle = TrimmedNonEmptyString.check(Schema.isMaxLength(200));

/** Two levels only: a module (`parentId` null) holds items, and an item holds nothing. */
export const ProjectChecklistItem = Schema.Struct({
  id: ProjectChecklistItemId,
  projectId: ProjectId,
  parentId: Schema.NullOr(ProjectChecklistItemId),
  title: ProjectChecklistTitle,
  done: Schema.Boolean,
  dueDate: Schema.NullOr(WorkModuleDueDate),
  position: Schema.Int,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ProjectChecklistItem = typeof ProjectChecklistItem.Type;

export const ProjectChecklistSnapshot = Schema.Struct({
  items: ForwardCompatibleArray(ProjectChecklistItem),
});
export type ProjectChecklistSnapshot = typeof ProjectChecklistSnapshot.Type;

export const ProjectChecklistSubscribeInput = Schema.Struct({ projectId: ProjectId });
export type ProjectChecklistSubscribeInput = typeof ProjectChecklistSubscribeInput.Type;

export const ProjectChecklistUpsertInput = Schema.Struct({
  id: Schema.optional(ProjectChecklistItemId).annotate({
    description: "Absent creates an item.",
  }),
  projectId: ProjectId,
  parentId: Schema.optional(Schema.NullOr(ProjectChecklistItemId)).annotate({
    description: "Only read on create. Must be a module of the same project, or null.",
  }),
  title: Schema.optional(ProjectChecklistTitle),
  done: Schema.optional(Schema.Boolean),
  dueDate: Schema.optional(Schema.NullOr(WorkModuleDueDate)),
});
export type ProjectChecklistUpsertInput = typeof ProjectChecklistUpsertInput.Type;

/** Reorders within the current parent; the checklist has no cross-parent moves. */
export const ProjectChecklistMoveInput = Schema.Struct({
  id: ProjectChecklistItemId,
  index: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export type ProjectChecklistMoveInput = typeof ProjectChecklistMoveInput.Type;

export const ProjectChecklistDeleteInput = Schema.Struct({ id: ProjectChecklistItemId });
export type ProjectChecklistDeleteInput = typeof ProjectChecklistDeleteInput.Type;

export const ProjectChecklistDeleteResult = Schema.Struct({
  deletedIds: ForwardCompatibleArray(ProjectChecklistItemId),
});
export type ProjectChecklistDeleteResult = typeof ProjectChecklistDeleteResult.Type;

export class ProjectChecklistError extends Schema.TaggedError<ProjectChecklistError>()(
  "ProjectChecklistError",
  {
    message: Schema.String,
    itemId: Schema.optional(ProjectChecklistItemId),
    cause: Schema.optional(Schema.Defect()),
  },
) {}
