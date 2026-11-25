import { DesignSketchId, ProjectId, ThreadId, type DesignProjectSketch } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { groupSketchesByOrigin } from "./projectSketchLibrary";

const sketch = (id: string, thread: string, deleted = false): DesignProjectSketch => ({
  id: DesignSketchId.make(id),
  projectId: ProjectId.make("project"),
  originThreadId: ThreadId.make(thread),
  groupId: null,
  basedOnSketchId: null,
  title: id,
  label: null,
  htmlAttachmentId: `${id}.html`,
  thumbnailAttachmentId: null,
  width: 390,
  height: 844,
  createdAt: "2026-11-25T12:00:00.000Z",
  originThreadTitle: deleted ? null : `Thread ${thread}`,
  originThreadDeleted: deleted,
});

describe("groupSketchesByOrigin", () => {
  it("groups by origin thread in first-seen order and keeps deleted threads", () => {
    const groups = groupSketchesByOrigin([
      sketch("a", "one"),
      sketch("b", "gone", true),
      sketch("c", "one"),
    ]);
    expect(groups.map((group) => [group.threadId, group.deleted, group.sketches.length])).toEqual([
      ["one", false, 2],
      ["gone", true, 1],
    ]);
    expect(groups[0]?.title).toBe("Thread one");
    expect(groups[1]?.title).toBeNull();
  });
});
