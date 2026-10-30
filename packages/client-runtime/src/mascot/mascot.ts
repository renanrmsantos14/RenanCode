import type { EnvironmentConnectionPhase } from "../connection/presentation.ts";

export type MascotState =
  | "offline"
  | "needsYou"
  | "error"
  | "thinking"
  | "working"
  | "done"
  | "welcome"
  | "idle";

export const MASCOT_DONE_VISIBLE_MS = 3000;

export interface MascotSprite {
  readonly file: string;
  readonly frames: number;
  readonly fps: number;
  readonly mode: "loop" | "once";
}

export const MASCOT_MANIFEST: Record<Exclude<MascotState, "idle">, MascotSprite> = {
  working: { file: "working.png", frames: 4, fps: 4, mode: "loop" },
  thinking: { file: "thinking.png", frames: 4, fps: 6, mode: "once" },
  needsYou: { file: "needs-you.png", frames: 4, fps: 6, mode: "once" },
  error: { file: "error.png", frames: 4, fps: 6, mode: "once" },
  done: { file: "done.png", frames: 6, fps: 8, mode: "once" },
  welcome: { file: "welcome.png", frames: 6, fps: 6, mode: "once" },
  offline: { file: "offline.png", frames: 4, fps: 1, mode: "loop" },
};

export interface MascotInput {
  readonly connectionPhase: EnvironmentConnectionPhase;
  readonly hasThread: boolean;
  readonly hasPendingRequest: boolean;
  readonly runStatus: string | null;
  readonly hasVisibleError: boolean;
  readonly justCompleted: boolean;
}

const STARTING_RUN_STATUSES = new Set(["preparing", "queued", "starting"]);
const ACTIVE_RUN_STATUSES = new Set(["running", "waiting"]);

export function deriveMascotState(input: MascotInput): MascotState {
  if (input.connectionPhase === "offline" || input.connectionPhase === "reconnecting") {
    return "offline";
  }
  if (input.hasPendingRequest) return "needsYou";
  if (input.hasVisibleError) return "error";
  if (input.runStatus !== null && STARTING_RUN_STATUSES.has(input.runStatus)) return "thinking";
  if (input.runStatus !== null && ACTIVE_RUN_STATUSES.has(input.runStatus)) return "working";
  if (input.justCompleted) return "done";
  if (!input.hasThread) return "welcome";
  return "idle";
}
