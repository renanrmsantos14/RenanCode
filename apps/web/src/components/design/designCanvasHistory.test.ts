import { describe, expect, it } from "vite-plus/test";

import {
  type DesignHistoryEntry,
  EMPTY_DESIGN_HISTORY,
  recordDesignHistory,
  stepDesignHistory,
} from "./designCanvasHistory";

const sketch = { kind: "sketch", sketchId: "s1", x: 0, y: 0, z: 1 } as const;

describe("design canvas history", () => {
  it("undoes a move by applying its reverse and redoes it", async () => {
    const applied: DesignHistoryEntry[] = [];
    const apply = async (entry: DesignHistoryEntry) => {
      applied.push(entry);
      return new Map<string, string>();
    };
    const move: DesignHistoryEntry = {
      type: "move",
      moves: [{ id: "a", from: { x: 0, y: 0 }, to: { x: 5, y: 5 } }],
    };
    const recorded = recordDesignHistory(EMPTY_DESIGN_HISTORY, move);
    const undone = await stepDesignHistory(recorded, "undo", apply);
    expect(undone).toEqual({ undo: [], redo: [move] });
    expect(applied[0]).toEqual({
      type: "move",
      moves: [{ id: "a", from: { x: 5, y: 5 }, to: { x: 0, y: 0 } }],
    });
    const redone = await stepDesignHistory(undone!, "redo", apply);
    expect(redone).toEqual({ undo: [move], redo: [] });
  });

  it("follows a re-created node to its new id in every entry", async () => {
    const remove: DesignHistoryEntry = { type: "remove", nodes: [{ id: "a", node: sketch }] };
    const z: DesignHistoryEntry = { type: "z", id: "a", from: 1, to: 2 };
    const history = recordDesignHistory(recordDesignHistory(EMPTY_DESIGN_HISTORY, z), remove);
    const undone = await stepDesignHistory(history, "undo", async () => new Map([["a", "b"]]));
    expect(undone).toEqual({
      undo: [{ type: "z", id: "b", from: 1, to: 2 }],
      redo: [{ type: "remove", nodes: [{ id: "b", node: sketch }] }],
    });
  });

  it("leaves the history alone when the step fails or there is nothing to step", async () => {
    const history = recordDesignHistory(EMPTY_DESIGN_HISTORY, {
      type: "z",
      id: "a",
      from: 1,
      to: 2,
    });
    expect(await stepDesignHistory(history, "undo", async () => null)).toBeNull();
    expect(await stepDesignHistory(history, "redo", async () => new Map())).toBeNull();
  });

  it("drops redo once something new is recorded", () => {
    const z: DesignHistoryEntry = { type: "z", id: "a", from: 1, to: 2 };
    expect(recordDesignHistory({ undo: [], redo: [z] }, z)).toEqual({ undo: [z], redo: [] });
  });
});
