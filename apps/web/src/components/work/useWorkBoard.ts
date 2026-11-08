import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { buildWorkModuleForest, type WorkModuleNode } from "@t3tools/client-runtime/workModuleTree";
import type { WorkModuleId, WorkModuleUpsertInput } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";

import { environmentIdsKey } from "~/state/environmentAtomList";
import { useEnvironments } from "~/state/environments";
import { useProjects } from "~/state/entities";
import { workModulesLiveListAtom, workModuleWritePermissionsAtom } from "~/state/workModules";

export interface WorkBoardProject {
  readonly project: EnvironmentProject;
  readonly nodes: WorkModuleNode[];
  readonly connected: boolean;
  /** The environment is connected but its server has no work modules. */
  readonly unavailable: boolean;
  readonly canWrite: boolean;
}

export interface WorkBoardHandlers {
  readonly onUpdate: (
    project: WorkBoardProject,
    input: Omit<WorkModuleUpsertInput, "projectId">,
  ) => void;
  readonly onCreate: (
    project: WorkBoardProject,
    parentId: WorkModuleId | null,
    title: string,
  ) => void;
  /** Resolves false when the server rejected the move. */
  readonly onMove: (
    project: WorkBoardProject,
    id: WorkModuleId,
    parentId: WorkModuleId | null,
    index: number,
  ) => Promise<boolean>;
  readonly onDelete: (project: WorkBoardProject, node: WorkModuleNode) => void;
  readonly onOpen: (project: WorkBoardProject, node: WorkModuleNode) => void;
  readonly onNewThread: (project: WorkBoardProject, node: WorkModuleNode) => void;
}

export function useWorkBoard(): { projects: WorkBoardProject[]; loading: boolean } {
  const { environments } = useEnvironments();
  const projects = useProjects();
  const connectedIds = environments.flatMap((environment) =>
    environment.connection.phase === "connected" && environment.serverConfig !== null
      ? [environment.environmentId]
      : [],
  );
  const key = environmentIdsKey(connectedIds);
  const queries = useAtomValue(workModulesLiveListAtom(key));
  const permissions = useAtomValue(workModuleWritePermissionsAtom(key));
  const forests = new Map(
    connectedIds.map((id, index) => {
      const snapshot = AsyncResult.getOrElse(queries[index]!, () => null);
      return [id, snapshot === null ? null : buildWorkModuleForest(snapshot)] as const;
    }),
  );
  return {
    loading: queries.some((query) => query._tag === "Initial"),
    projects: projects
      .filter((project) => project.isScratch !== true)
      .map((project) => {
        const index = connectedIds.indexOf(project.environmentId);
        return {
          project,
          nodes: forests.get(project.environmentId)?.get(project.id) ?? [],
          connected: index >= 0,
          unavailable: index >= 0 && queries[index]!._tag === "Failure",
          canWrite:
            index >= 0 && queries[index]!._tag === "Success" && permissions[index] === true,
        };
      }),
  };
}
