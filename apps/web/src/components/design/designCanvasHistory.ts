import type { DesignCanvasNode, DesignFrameDevice } from "@t3tools/contracts";

/** What it takes to put a removed node back; a new node gets a new id. */
export type DesignPlacedNode =
  | {
      readonly kind: "frame";
      readonly url: string;
      readonly device: DesignFrameDevice;
      readonly title: string;
      readonly width: number;
      readonly height: number;
      readonly x: number;
      readonly y: number;
      readonly z: number;
    }
  | {
      readonly kind: "sketch";
      readonly sketchId: string;
      readonly x: number;
      readonly y: number;
      readonly z: number;
    };

interface Point {
  readonly x: number;
  readonly y: number;
}

export type DesignHistoryEntry =
  | {
      readonly type: "move";
      readonly moves: ReadonlyArray<{
        readonly id: string;
        readonly from: Point;
        readonly to: Point;
      }>;
    }
  | {
      readonly type: "add" | "remove";
      readonly nodes: ReadonlyArray<{ readonly id: string; readonly node: DesignPlacedNode }>;
    }
  | { readonly type: "z"; readonly id: string; readonly from: number; readonly to: number };

export interface DesignHistory {
  readonly undo: ReadonlyArray<DesignHistoryEntry>;
  readonly redo: ReadonlyArray<DesignHistoryEntry>;
}

export const EMPTY_DESIGN_HISTORY: DesignHistory = { undo: [], redo: [] };
const MAX_ENTRIES = 100;

export function placedNode(node: DesignCanvasNode): DesignPlacedNode {
  return node.kind === "frame"
    ? {
        kind: "frame",
        url: node.url,
        device: node.device,
        title: node.title,
        width: node.width,
        height: node.height,
        x: node.x,
        y: node.y,
        z: node.z,
      }
    : { kind: "sketch", sketchId: node.sketchId, x: node.x, y: node.y, z: node.z };
}

export function recordDesignHistory(
  history: DesignHistory,
  entry: DesignHistoryEntry,
): DesignHistory {
  return { undo: [...history.undo, entry].slice(-MAX_ENTRIES), redo: [] };
}

/** The entry that reverses `entry`. */
function invertDesignHistoryEntry(entry: DesignHistoryEntry): DesignHistoryEntry {
  switch (entry.type) {
    case "move":
      return {
        type: "move",
        moves: entry.moves.map((move) => ({ id: move.id, from: move.to, to: move.from })),
      };
    case "add":
      return { type: "remove", nodes: entry.nodes };
    case "remove":
      return { type: "add", nodes: entry.nodes };
    case "z":
      return { type: "z", id: entry.id, from: entry.to, to: entry.from };
  }
}

/** Re-adding a node gives it a new id; older entries that name the old one follow it. */
function remapDesignHistory(
  entries: ReadonlyArray<DesignHistoryEntry>,
  ids: ReadonlyMap<string, string>,
): ReadonlyArray<DesignHistoryEntry> {
  if (ids.size === 0) return entries;
  const id = (value: string) => ids.get(value) ?? value;
  return entries.map((entry) => {
    switch (entry.type) {
      case "move":
        return { ...entry, moves: entry.moves.map((move) => ({ ...move, id: id(move.id) })) };
      case "add":
      case "remove":
        return { ...entry, nodes: entry.nodes.map((node) => ({ ...node, id: id(node.id) })) };
      case "z":
        return { ...entry, id: id(entry.id) };
    }
  });
}

/**
 * Moves the last entry of one stack to the other once `apply` has run its reverse (undo) or
 * itself again (redo). `apply` resolves the old→new ids of nodes it re-created, or null on failure.
 */
export async function stepDesignHistory(
  history: DesignHistory,
  direction: "undo" | "redo",
  apply: (entry: DesignHistoryEntry) => Promise<ReadonlyMap<string, string> | null>,
): Promise<DesignHistory | null> {
  const from = direction === "undo" ? history.undo : history.redo;
  const entry = from.at(-1);
  if (entry === undefined) return null;
  const ids = await apply(direction === "undo" ? invertDesignHistoryEntry(entry) : entry);
  if (ids === null) return null;
  const [moved] = remapDesignHistory([entry], ids);
  const rest = remapDesignHistory(from.slice(0, -1), ids);
  const other = remapDesignHistory(direction === "undo" ? history.redo : history.undo, ids);
  return direction === "undo"
    ? { undo: rest, redo: [...other, moved!] }
    : { undo: [...other, moved!], redo: rest };
}
