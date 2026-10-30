import type { OrchestrationV2RunStatus } from "@t3tools/contracts";
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

export type MascotGesture = "cube" | "coffee" | "glasses" | "stretch";

export interface MascotSprite {
  readonly file: string;
  readonly frames: number;
  readonly fps: number;
  readonly mode: "loop" | "once";
  readonly gestures: readonly MascotGesture[];
}

// Os gestos continuam a pose do estado: com notebook (working) ou sem (idle, welcome, thinking).
export const MASCOT_MANIFEST: Record<MascotState, MascotSprite> = {
  working: {
    file: "working.png",
    frames: 8,
    fps: 6,
    mode: "loop",
    gestures: ["coffee", "glasses", "stretch"],
  },
  thinking: { file: "thinking.png", frames: 8, fps: 6, mode: "loop", gestures: ["cube"] },
  needsYou: { file: "needs-you.png", frames: 8, fps: 8, mode: "once", gestures: [] },
  error: { file: "error.png", frames: 8, fps: 8, mode: "once", gestures: [] },
  done: { file: "done.png", frames: 8, fps: 8, mode: "once", gestures: [] },
  welcome: { file: "welcome.png", frames: 8, fps: 6, mode: "once", gestures: ["cube"] },
  offline: { file: "offline.png", frames: 8, fps: 2, mode: "loop", gestures: [] },
  idle: { file: "idle.png", frames: 6, fps: 2, mode: "loop", gestures: ["cube"] },
};

export const MASCOT_GESTURES: Record<MascotGesture, MascotSprite> = {
  cube: { file: "gesture-cube.png", frames: 10, fps: 8, mode: "once", gestures: [] },
  coffee: { file: "gesture-coffee.png", frames: 8, fps: 6, mode: "once", gestures: [] },
  glasses: { file: "gesture-glasses.png", frames: 6, fps: 6, mode: "once", gestures: [] },
  stretch: { file: "gesture-stretch.png", frames: 6, fps: 6, mode: "once", gestures: [] },
};

const MASCOT_GESTURE_DELAY_MS = { min: 15_000, max: 30_000 } as const;

export function pickMascotGesture(state: MascotState, random: number): MascotGesture | null {
  const options = MASCOT_MANIFEST[state].gestures;
  if (options.length === 0) return null;
  return options[Math.min(options.length - 1, Math.floor(random * options.length))] ?? null;
}

export function mascotGestureDelayMs(random: number): number {
  const { min, max } = MASCOT_GESTURE_DELAY_MS;
  return min + Math.floor(random * (max - min));
}

export interface MascotInput {
  readonly connectionPhase: EnvironmentConnectionPhase;
  readonly hasThread: boolean;
  readonly hasPendingRequest: boolean;
  readonly runStatus: OrchestrationV2RunStatus | null;
  readonly hasVisibleError: boolean;
  readonly justCompleted: boolean;
}

const STARTING_RUN_STATUSES: ReadonlySet<OrchestrationV2RunStatus> = new Set([
  "preparing",
  "queued",
  "starting",
]);
const ACTIVE_RUN_STATUSES: ReadonlySet<OrchestrationV2RunStatus> = new Set(["running", "waiting"]);

export function isMascotLiveRunStatus(status: OrchestrationV2RunStatus): boolean {
  return STARTING_RUN_STATUSES.has(status) || ACTIVE_RUN_STATUSES.has(status);
}

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
