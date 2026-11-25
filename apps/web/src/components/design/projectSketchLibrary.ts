import type { DesignProjectSketch, ThreadId } from "@t3tools/contracts";

export const DESIGN_SKETCH_DRAG_TYPE = "application/x-t3-design-sketch";

export interface SketchOriginGroup {
  readonly threadId: ThreadId;
  readonly title: string | null;
  readonly deleted: boolean;
  readonly sketches: ReadonlyArray<DesignProjectSketch>;
}

/** Groups the library by the thread that made each sketch, in the order each thread first appears. */
export function groupSketchesByOrigin(
  sketches: ReadonlyArray<DesignProjectSketch>,
): ReadonlyArray<SketchOriginGroup> {
  const groups = new Map<ThreadId, { group: SketchOriginGroup; sketches: DesignProjectSketch[] }>();
  for (const sketch of sketches) {
    const entry = groups.get(sketch.originThreadId);
    if (entry !== undefined) {
      entry.sketches.push(sketch);
      continue;
    }
    const list = [sketch];
    groups.set(sketch.originThreadId, {
      group: {
        threadId: sketch.originThreadId,
        title: sketch.originThreadTitle,
        deleted: sketch.originThreadDeleted,
        sketches: list,
      },
      sketches: list,
    });
  }
  return [...groups.values()].map((entry) => entry.group);
}

export function readDroppedSketchId(dataTransfer: DataTransfer): string | null {
  const id = dataTransfer.getData(DESIGN_SKETCH_DRAG_TYPE);
  return id === "" ? null : id;
}
