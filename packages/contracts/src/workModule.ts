import * as Schema from "effect/Schema";

import {
  ForwardCompatibleArray,
  IsoDateTime,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
  WorkModuleId,
} from "./baseSchemas.ts";

export const WORK_MODULE_STATUSES = ["idea", "active", "waiting", "done"] as const;
export const WorkModuleStatus = Schema.Literals(WORK_MODULE_STATUSES);
export type WorkModuleStatus = typeof WorkModuleStatus.Type;

export const WorkModuleDueDate = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/));
export type WorkModuleDueDate = typeof WorkModuleDueDate.Type;

const WorkModuleTitle = TrimmedNonEmptyString.check(Schema.isMaxLength(200));
const WorkModuleNote = Schema.String.check(Schema.isMaxLength(20_000));
const WorkModuleWaitingReason = TrimmedNonEmptyString.check(Schema.isMaxLength(200));

export const WorkModule = Schema.Struct({
  id: WorkModuleId,
  projectId: ProjectId,
  parentId: Schema.NullOr(WorkModuleId),
  title: WorkModuleTitle,
  note: WorkModuleNote,
  status: WorkModuleStatus,
  waitingReason: Schema.NullOr(WorkModuleWaitingReason),
  dueDate: Schema.NullOr(WorkModuleDueDate),
  position: Schema.Int,
  statusChangedAt: IsoDateTime,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type WorkModule = typeof WorkModule.Type;

export const WorkModuleThreadLink = Schema.Struct({
  threadId: ThreadId,
  moduleId: WorkModuleId,
  suggested: Schema.Boolean,
  linkedAt: IsoDateTime,
  /** Snapshot only: the thread's title, which shells may omit for archived or older threads. */
  threadTitle: Schema.optionalKey(Schema.String),
  /** Snapshot only. */
  threadArchived: Schema.optionalKey(Schema.Boolean),
});
export type WorkModuleThreadLink = typeof WorkModuleThreadLink.Type;

export const WorkModuleSnapshot = Schema.Struct({
  modules: ForwardCompatibleArray(WorkModule),
  links: ForwardCompatibleArray(WorkModuleThreadLink),
});
export type WorkModuleSnapshot = typeof WorkModuleSnapshot.Type;

export const WorkModuleSubscribeInput = Schema.Struct({});
export type WorkModuleSubscribeInput = typeof WorkModuleSubscribeInput.Type;

export const WorkModuleUpsertInput = Schema.Struct({
  id: Schema.optional(WorkModuleId).annotate({ description: "Absent creates a module." }),
  projectId: ProjectId,
  parentId: Schema.optional(Schema.NullOr(WorkModuleId)).annotate({
    description: "Only read on create; use move to change it.",
  }),
  title: Schema.optional(WorkModuleTitle),
  note: Schema.optional(WorkModuleNote),
  status: Schema.optional(WorkModuleStatus),
  waitingReason: Schema.optional(Schema.NullOr(WorkModuleWaitingReason)),
  dueDate: Schema.optional(Schema.NullOr(WorkModuleDueDate)),
});
export type WorkModuleUpsertInput = typeof WorkModuleUpsertInput.Type;

export const WorkModuleMoveInput = Schema.Struct({
  id: WorkModuleId,
  parentId: Schema.NullOr(WorkModuleId),
  index: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export type WorkModuleMoveInput = typeof WorkModuleMoveInput.Type;

export const WorkModuleDeleteInput = Schema.Struct({ id: WorkModuleId });
export type WorkModuleDeleteInput = typeof WorkModuleDeleteInput.Type;

export const WorkModuleDeleteResult = Schema.Struct({
  deletedIds: ForwardCompatibleArray(WorkModuleId),
});
export type WorkModuleDeleteResult = typeof WorkModuleDeleteResult.Type;

export const WorkModuleLinkThreadInput = Schema.Struct({
  threadId: ThreadId,
  moduleId: WorkModuleId,
});
export type WorkModuleLinkThreadInput = typeof WorkModuleLinkThreadInput.Type;

export const WorkModuleThreadInput = Schema.Struct({ threadId: ThreadId });
export type WorkModuleThreadInput = typeof WorkModuleThreadInput.Type;

export class WorkModuleError extends Schema.TaggedError<WorkModuleError>()("WorkModuleError", {
  message: Schema.String,
  moduleId: Schema.optional(WorkModuleId),
  cause: Schema.optional(Schema.Defect()),
}) {}
