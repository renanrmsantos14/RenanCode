import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { settlePromise } from "@t3tools/client-runtime/state/runtime";
import type { ContextMenuItem, EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import {
  type DesignCanvasSnapshot,
  DesignNodeId,
  type DesignSketch,
  DesignSketchId,
} from "@t3tools/contracts";
import { type DesignSketchReference, designSketchReference } from "@t3tools/shared/design";
import { htmlVariantLetter } from "@t3tools/shared/htmlRender";
import {
  Background,
  type Node,
  type NodeProps,
  type OnNodesChange,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
  useViewportStore,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import { T, useGT } from "gt-react";
import { FrameIcon, KeyboardIcon, LibraryIcon, Maximize2Icon, Minimize2Icon } from "lucide-react";
import {
  createContext,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  use,
  useEffect,
  useRef,
  useState,
} from "react";

import { contextMenuSourceOf } from "~/contextMenuSource";
import { readLocalApi } from "~/localApi";
import { isMacPlatform } from "~/lib/utils";

import { useAtomCommand } from "~/state/use-atom-command";
import { designEnvironment } from "~/state/design";

import { HtmlRenderDocument } from "../files/BrowserDocumentFrame";
import { previewBridge } from "../preview/previewBridge";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { AddFrameMenu } from "./AddFrameMenu";
import {
  DesignCanvasModeSwitch,
  DesignCanvasToolbar,
  DesignRecenterButton,
  DesignShortcutsDialog,
} from "./DesignCanvasChrome";
import {
  type DesignCanvasAction,
  type DesignCanvasMode,
  type DesignCanvasTool,
  resolveDesignCanvasKey,
} from "./designCanvasControls";
import {
  type DesignHistory,
  type DesignHistoryEntry,
  type DesignPlacedNode,
  EMPTY_DESIGN_HISTORY,
  placedNode,
  recordDesignHistory,
  stepDesignHistory,
} from "./designCanvasHistory";
import { useDesignCanvasNavigation } from "./designCanvasNavigation";
import { isEditableFocused } from "~/lib/editableFocus";
import { DesignFrameContext, FrameNode, type FrameFlowNode } from "./DesignFrameNode";
import { EnvironmentSketchViewer } from "./DesignSketchCard";
import { useDesignFocusStore } from "./designFocusStore";
import { useDesignFrameStore } from "./designFrameStore";
import { useSketchPageUrl, useSketchThumbnailUrl } from "./sketchAssets";

/** Below this zoom a node is a thumbnail: a live page this small is unreadable and costs a frame each. */
const LIVE_PAGE_MIN_ZOOM = 0.35;
const VIEWPORT_SAVE_DELAY_MS = 400;
const FIT_OPTIONS = { maxZoom: 1, padding: "10%" } as const;

type SketchFlowNode = Node<
  { readonly sketch: DesignSketch; readonly letter: string | undefined },
  "sketch"
>;

interface DesignCanvasContextValue {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly onOpenSketch: (sketch: DesignSketch) => void;
}

const DesignCanvasContext = createContext<DesignCanvasContextValue | null>(null);

function SketchThumbnail(props: { readonly sketch: DesignSketch }) {
  const ctx = use(DesignCanvasContext)!;
  const src = useSketchThumbnailUrl(ctx.environmentId, props.sketch.thumbnailAttachmentId);
  return src === null ? (
    <div className="flex size-full items-center justify-center bg-muted text-muted-foreground">
      <FrameIcon className="size-1/6 max-h-24 max-w-24" />
    </div>
  ) : (
    <img src={src} alt="" draggable={false} className="size-full object-cover object-top" />
  );
}

function LiveSketchPage(props: { readonly sketch: DesignSketch }) {
  const ctx = use(DesignCanvasContext)!;
  const src = useSketchPageUrl(ctx.environmentId, {
    attachmentId: props.sketch.htmlAttachmentId,
    title: props.sketch.title,
  });
  if (src === null) return null;
  return (
    <HtmlRenderDocument
      src={src}
      title={props.sketch.title}
      threadRef={ctx.threadRef}
      className="pointer-events-none absolute inset-0 block size-full bg-background"
      containScroll
    />
  );
}

function SketchNode({ data, selected }: NodeProps<SketchFlowNode>) {
  const gt = useGT();
  const ctx = use(DesignCanvasContext)!;
  const zoom = useViewportStore((state) => state.transform[2]);
  const live = zoom >= LIVE_PAGE_MIN_ZOOM;
  const { sketch, letter } = data;
  return (
    <div
      className={`relative size-full rounded-sm bg-card ring-1 ${selected ? "ring-2 ring-primary" : "ring-border"}`}
    >
      <div
        className="absolute start-0 bottom-full flex min-w-0 items-center gap-1.5 pb-1 text-xs text-foreground/80"
        style={{
          width: `${zoom * 100}%`,
          transform: `scale(${1 / zoom})`,
          transformOrigin: "bottom left",
        }}
      >
        {letter ? (
          <span className="shrink-0 rounded bg-muted px-1 font-medium text-muted-foreground">
            {letter}
          </span>
        ) : null}
        {sketch.label ? (
          <span className="max-w-[60%] min-w-0 shrink-0 truncate rounded bg-muted px-1 font-medium">
            {sketch.label}
          </span>
        ) : null}
        <span className="min-w-0 truncate">{sketch.title}</span>
        <Button
          aria-label={gt("Open sketch {title}", { title: sketch.title })}
          size="icon-xs"
          variant="ghost"
          className="ms-auto shrink-0"
          onClick={() => ctx.onOpenSketch(sketch)}
        >
          <Maximize2Icon className="size-3" />
        </Button>
      </div>
      <div className="relative size-full overflow-hidden rounded-sm">
        <SketchThumbnail sketch={sketch} />
        {live ? <LiveSketchPage sketch={sketch} /> : null}
      </div>
    </div>
  );
}

function variantLetter(sketches: ReadonlyArray<DesignSketch>, sketch: DesignSketch) {
  if (sketch.groupId === null) return undefined;
  const siblings = sketches.filter((entry) => entry.groupId === sketch.groupId);
  return siblings.length > 1 ? htmlVariantLetter(siblings.indexOf(sketch)) : undefined;
}

type GroupFlowNode = Node<{ readonly label: string }, "group">;

const GROUP_PADDING = 16;
/** Screen height of a node's own label row, which sits right above the node. */
const NODE_LABEL_ROW_PX = 24;

/** A dashed outline behind the nodes the agent grouped, with the group's label above the nodes' labels. */
function GroupNode({ data }: NodeProps<GroupFlowNode>) {
  const zoom = useViewportStore((state) => state.transform[2]);
  return (
    <div className="pointer-events-none relative size-full rounded-md border border-dashed border-border">
      <span
        className="absolute start-0 truncate pb-1 font-medium text-muted-foreground text-xs"
        style={{
          bottom: `calc(100% + ${Math.max(0, NODE_LABEL_ROW_PX / zoom - GROUP_PADDING)}px)`,
          width: `${zoom * 100}%`,
          transform: `scale(${1 / zoom})`,
          transformOrigin: "bottom left",
        }}
      >
        {data.label}
      </span>
    </div>
  );
}

const NODE_TYPES = { sketch: SketchNode, frame: FrameNode, group: GroupNode };

/** One outline per group id, around its nodes as they are now (a node being dragged included). */
function groupOutlines(
  nodes: ReadonlyArray<{
    readonly id: string;
    readonly position: { readonly x: number; readonly y: number };
    readonly width: number;
    readonly height: number;
    readonly groupId?: string | undefined;
    readonly groupLabel?: string | undefined;
  }>,
): Array<GroupFlowNode> {
  const boxes = new Map<
    string,
    { label: string; left: number; top: number; right: number; bottom: number }
  >();
  for (const node of nodes) {
    if (node.groupId === undefined || node.groupLabel === undefined) continue;
    const box = boxes.get(node.groupId) ?? {
      label: node.groupLabel,
      left: Infinity,
      top: Infinity,
      right: -Infinity,
      bottom: -Infinity,
    };
    box.left = Math.min(box.left, node.position.x);
    box.top = Math.min(box.top, node.position.y);
    box.right = Math.max(box.right, node.position.x + node.width);
    box.bottom = Math.max(box.bottom, node.position.y + node.height);
    boxes.set(node.groupId, box);
  }
  return [...boxes].map(([groupId, box]) => ({
    id: `group:${groupId}`,
    type: "group" as const,
    position: { x: box.left - GROUP_PADDING, y: box.top - GROUP_PADDING },
    width: box.right - box.left + GROUP_PADDING * 2,
    height: box.bottom - box.top + GROUP_PADDING * 2,
    zIndex: -1,
    selectable: false,
    draggable: false,
    focusable: false,
    data: { label: box.label },
  }));
}

function ToolbarButton(props: {
  readonly label: string;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button aria-label={props.label} size="icon-xs" variant="glass" onClick={props.onClick} />
        }
      >
        {props.children}
      </TooltipTrigger>
      <TooltipPopup side="bottom">{props.label}</TooltipPopup>
    </Tooltip>
  );
}

interface Point {
  readonly x: number;
  readonly y: number;
}

type CanvasNode = DesignCanvasSnapshot["nodes"][number];

const ZOOM_DURATION_MS = 250;
const NUDGE_SAVE_DELAY_MS = 400;
const DUPLICATE_GAP = 40;
// ⌘ stays: this prop replaces React Flow's default; Ctrl is the hand, as in RenanDesign.
const MULTI_SELECTION_KEYS = ["Shift", "Meta"];
const NO_SELECTION: ReadonlySet<string> = new Set();
const clampFrameSize = (value: number) => Math.min(2400, Math.max(240, Math.round(value)));

function DesignCanvasInner(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly snapshot: DesignCanvasSnapshot;
  readonly canWrite: boolean;
  readonly maximized: boolean;
  readonly onToggleMaximized: () => void;
  /** Only where the project's sketch library can be shown (desktop). */
  readonly library?: { readonly open: boolean; readonly onToggle: () => void };
}) {
  const gt = useGT();
  const flow = useReactFlow();
  const { snapshot, threadRef, environmentId } = props;
  const threadId = threadRef.threadId;
  const moveNodes = useAtomCommand(designEnvironment.moveNodes, { label: "design move nodes" });
  const setViewport = useAtomCommand(designEnvironment.setViewport, {
    label: "design set viewport",
    reportFailure: false,
  });
  const removeNode = useAtomCommand(designEnvironment.removeNode, { label: "design remove node" });
  const placeSketch = useAtomCommand(designEnvironment.placeSketch, {
    label: "design place sketch",
  });
  const addFrame = useAtomCommand(designEnvironment.addFrame, { label: "design add frame" });
  const setNodeZ = useAtomCommand(designEnvironment.setNodeZ, { label: "design set node z" });
  const [dragging, setDragging] = useState<Readonly<Record<string, Point>>>({});
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(NO_SELECTION);
  const [tool, setTool] = useState<DesignCanvasTool>("select");
  const [mode, setMode] = useState<DesignCanvasMode>("design");
  const [history, setHistory] = useState<DesignHistory>(EMPTY_DESIGN_HISTORY);
  const historyBusy = useRef(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const nudge = useRef<{
    readonly from: Map<string, Point>;
    readonly to: Map<string, Point>;
  } | null>(null);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [viewing, setViewing] = useState<{
    readonly sketches: ReadonlyArray<DesignSketchReference>;
    readonly index: number;
  } | null>(null);
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const viewportTouched = useRef(snapshot.viewport !== null);
  const saveViewportSoon = (viewport: Viewport) => {
    if (!props.canWrite) return;
    clearTimeout(viewportTimer.current);
    viewportTimer.current = setTimeout(() => {
      void setViewport({
        environmentId: props.environmentId,
        input: { threadId: threadRef.threadId, viewport },
      });
    }, VIEWPORT_SAVE_DELAY_MS);
  };
  // A Ctrl-drag pan moves the viewport programmatically, which React Flow's move events skip.
  const { panHeld, zoomHeld } = useDesignCanvasNavigation(wrapperRef, () => {
    viewportTouched.current = true;
    saveViewportSoon(flow.getViewport());
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- cancels the pending viewport and nudge saves, timers outside React, when the canvas unmounts
  useEffect(
    () => () => {
      clearTimeout(viewportTimer.current);
      clearTimeout(nudgeTimer.current);
    },
    [],
  );
  const containerWidth = useViewportStore((state) => state.width);
  const containerHeight = useViewportStore((state) => state.height);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- refits the React Flow viewport, an external system, when the container resizes (full screen) before the user has moved the view
  useEffect(() => {
    if (viewportTouched.current || containerWidth === 0 || containerHeight === 0) return;
    void flow.fitView(FIT_OPTIONS);
  }, [containerWidth, containerHeight, flow]);

  const designing = mode === "design";
  const editable = props.canWrite && designing;
  // Not while panning: d3-drag would take the press the pan needs (RenanDesign ONL-1864).
  const movable = editable && tool !== "pan" && !panHeld;
  const sketchesById = new Map(snapshot.sketches.map((sketch) => [sketch.id, sketch]));
  const flowNodes: Array<SketchFlowNode | FrameFlowNode> = snapshot.nodes.flatMap<
    SketchFlowNode | FrameFlowNode
  >((node) => {
    const base = {
      id: node.id,
      position: dragging[node.id] ?? { x: node.x, y: node.y },
      width: node.width,
      height: node.height,
      zIndex: node.z,
      selected: selectedIds.has(node.id),
      draggable: movable,
    };
    if (node.kind === "frame") {
      // Frames run in a desktop webview; every other client leaves them out.
      return previewBridge === null
        ? []
        : [{ ...base, type: "frame" as const, data: { frame: node } }];
    }
    const sketch = sketchesById.get(node.sketchId);
    if (sketch === undefined) return [];
    return [
      {
        ...base,
        type: "sketch" as const,
        data: { sketch, letter: variantLetter(snapshot.sketches, sketch) },
      },
    ];
  });

  const nodesById = new Map<string, (typeof snapshot.nodes)[number]>(
    snapshot.nodes.map((node) => [node.id, node]),
  );
  const nodes: Array<SketchFlowNode | FrameFlowNode | GroupFlowNode> = [
    ...groupOutlines(
      flowNodes.map((node) => {
        const source = nodesById.get(node.id);
        return {
          id: node.id,
          position: node.position,
          width: node.width ?? 0,
          height: node.height ?? 0,
          groupId: source?.groupId,
          groupLabel: source?.groupLabel,
        };
      }),
    ),
    ...flowNodes,
  ];
  const visibleIds = new Set(flowNodes.map((node) => node.id));
  const selectedNodes = snapshot.nodes.filter(
    (node) => selectedIds.has(node.id) && visibleIds.has(node.id),
  );

  const record = (entry: DesignHistoryEntry) =>
    setHistory((current) => recordDesignHistory(current, entry));

  const move = async (moves: ReadonlyArray<{ readonly id: string } & Point>) => {
    const result = await moveNodes({
      environmentId,
      input: {
        threadId,
        nodes: moves.map((entry) => ({
          nodeId: DesignNodeId.make(entry.id),
          x: entry.x,
          y: entry.y,
        })),
      },
    });
    return result._tag === "Success";
  };

  const restack = async (id: string, z: number) => {
    const result = await setNodeZ({
      environmentId,
      input: { threadId, nodeId: DesignNodeId.make(id), z },
    });
    return result._tag === "Success";
  };

  const recreate = async (node: DesignPlacedNode): Promise<string | null> => {
    let id: string;
    if (node.kind === "frame") {
      const result = await addFrame({
        environmentId,
        input: {
          threadId,
          url: node.url,
          device: node.device,
          ...(node.title.length > 0 ? { title: node.title } : {}),
          ...(node.device === "custom"
            ? { width: clampFrameSize(node.width), height: clampFrameSize(node.height) }
            : {}),
        },
      });
      if (result._tag !== "Success" || result.value === null) return null;
      id = result.value.id;
    } else {
      const result = await placeSketch({
        environmentId,
        input: { threadId, sketchId: DesignSketchId.make(node.sketchId) },
      });
      if (result._tag !== "Success") return null;
      id = result.value.id;
    }
    const placed = (await move([{ id, x: node.x, y: node.y }])) && (await restack(id, node.z));
    return placed ? id : null;
  };

  const remove = async (ids: ReadonlyArray<string>) => {
    for (const id of ids) {
      const result = await removeNode({
        environmentId,
        input: { threadId, nodeId: DesignNodeId.make(id) },
      });
      if (result._tag !== "Success") return false;
    }
    return true;
  };

  const applyHistoryEntry = async (
    entry: DesignHistoryEntry,
  ): Promise<ReadonlyMap<string, string> | null> => {
    switch (entry.type) {
      case "move":
        return (await move(entry.moves.map((m) => ({ id: m.id, ...m.to })))) ? new Map() : null;
      case "z":
        return (await restack(entry.id, entry.to)) ? new Map() : null;
      case "remove":
        return (await remove(entry.nodes.map((node) => node.id))) ? new Map() : null;
      case "add": {
        const ids = new Map<string, string>();
        for (const { id, node } of entry.nodes) {
          const next = await recreate(node);
          if (next === null) return null;
          ids.set(id, next);
        }
        return ids;
      }
    }
  };

  const stepHistory = async (direction: "undo" | "redo") => {
    if (historyBusy.current) return;
    historyBusy.current = true;
    // Commands resolve to a result instead of throwing, so the flag always clears.
    const next = await stepDesignHistory(history, direction, applyHistoryEntry);
    historyBusy.current = false;
    // A step that no longer applies (the agent changed the canvas) is dropped, not retried forever.
    setHistory(
      next ??
        (direction === "undo"
          ? { ...history, undo: history.undo.slice(0, -1) }
          : { ...history, redo: history.redo.slice(0, -1) }),
    );
  };

  const removeSelection = async (targets: ReadonlyArray<CanvasNode> = selectedNodes) => {
    if (targets.length === 0) return;
    setSelectedIds(NO_SELECTION);
    record({
      type: "remove",
      nodes: targets.map((node) => ({
        id: node.id,
        node: { ...placedNode(node), ...dragging[node.id] },
      })),
    });
    await remove(targets.map((node) => node.id));
  };

  const maxZ = Math.max(0, ...snapshot.nodes.map((node) => node.z));
  const minZ = Math.min(0, ...snapshot.nodes.map((node) => node.z));

  const duplicateSelection = async (targets: ReadonlyArray<CanvasNode> = selectedNodes) => {
    const frames = targets.filter((node) => node.kind === "frame");
    const added: Array<{ id: string; node: DesignPlacedNode }> = [];
    for (const [index, frame] of frames.entries()) {
      const node = {
        ...placedNode(frame),
        x: frame.x + frame.width + DUPLICATE_GAP,
        z: maxZ + 1 + index,
      };
      const id = await recreate(node);
      if (id === null) break;
      added.push({ id, node });
    }
    if (added.length === 0) return;
    record({ type: "add", nodes: added });
    setSelectedIds(new Set(added.map((entry) => entry.id)));
  };

  const restackSelection = async (
    edge: "front" | "back",
    targets: ReadonlyArray<CanvasNode> = selectedNodes,
  ) => {
    const [node] = targets;
    if (node === undefined || targets.length !== 1) return;
    const z = edge === "front" ? maxZ + 1 : minZ - 1;
    if ((edge === "front" && node.z === maxZ) || (edge === "back" && node.z === minZ)) {
      if (snapshot.nodes.filter((entry) => entry.z === node.z).length === 1) return;
    }
    record({ type: "z", id: node.id, from: node.z, to: z });
    await restack(node.id, z);
  };

  const commitNudge = async () => {
    const burst = nudge.current;
    if (burst === null) return;
    nudge.current = null;
    const moves = [...burst.to].map(([id, to]) => ({ id, from: burst.from.get(id)!, to }));
    record({ type: "move", moves });
    await move(moves.map((entry) => ({ id: entry.id, ...entry.to })));
    setDragging({});
  };

  const nudgeSelection = (dx: number, dy: number) => {
    if (selectedNodes.length === 0) return;
    const burst = nudge.current ?? { from: new Map<string, Point>(), to: new Map<string, Point>() };
    for (const node of selectedNodes) {
      const at = burst.to.get(node.id) ?? { x: node.x, y: node.y };
      if (!burst.from.has(node.id)) burst.from.set(node.id, { x: node.x, y: node.y });
      burst.to.set(node.id, { x: at.x + dx, y: at.y + dy });
    }
    setDragging(Object.fromEntries(burst.to));
    clearTimeout(nudgeTimer.current);
    nudgeTimer.current = setTimeout(() => void commitNudge(), NUDGE_SAVE_DELAY_MS);
    nudge.current = burst;
  };

  const fitAll = () => {
    viewportTouched.current = true;
    void flow.fitView({ ...FIT_OPTIONS, duration: ZOOM_DURATION_MS });
  };
  const fitSelection = () => {
    if (selectedNodes.length === 0) return fitAll();
    viewportTouched.current = true;
    void flow.fitView({
      nodes: selectedNodes.map((node) => ({ id: node.id })),
      maxZoom: 4,
      padding: "10%",
      duration: ZOOM_DURATION_MS,
    });
  };
  const zoom = (how: "in" | "out" | "actual") => {
    viewportTouched.current = true;
    const options = { duration: ZOOM_DURATION_MS };
    if (how === "in") void flow.zoomIn(options);
    else if (how === "out") void flow.zoomOut(options);
    else void flow.zoomTo(1, options);
  };

  const changeMode = (next: DesignCanvasMode) => {
    setMode(next);
    if (next === "preview") {
      setTool("select");
      setSelectedIds(NO_SELECTION);
    }
  };

  const threadKey = scopedThreadKey(threadRef);
  const canAddFrame = previewBridge !== null && editable;
  const openAddFrame = () => {
    if (canAddFrame) useDesignFrameStore.getState().setAddMenuOpen(threadRef, true);
  };

  // `targets` is for a menu that picked its own nodes: its selection update has not rendered yet.
  const run = (action: DesignCanvasAction, targets: ReadonlyArray<CanvasNode> = selectedNodes) => {
    switch (action.type) {
      case "tool":
        if (designing || action.tool === "select") setTool(action.tool);
        return;
      case "mode":
        return changeMode(action.mode);
      case "addFrame":
        return openAddFrame();
      case "zoomIn":
        return zoom("in");
      case "zoomOut":
        return zoom("out");
      case "actualSize":
        return zoom("actual");
      case "fitAll":
        return fitAll();
      case "fitSelection":
        return fitSelection();
      case "selectAll":
        if (designing) setSelectedIds(visibleIds);
        return;
      case "escape":
        if (tool === "pan") setTool("select");
        else setSelectedIds(NO_SELECTION);
        return;
      case "toggleFullScreen":
        return props.onToggleMaximized();
      case "shortcuts":
        return setShortcutsOpen(true);
    }
    if (!editable) return;
    // A nudge saves after a pause; any other edit first settles it so history stays in order.
    if (nudge.current !== null && action.type !== "nudge") {
      if (action.type === "redo") return;
      clearTimeout(nudgeTimer.current);
      if (action.type === "undo") {
        nudge.current = null;
        setDragging({});
        return;
      }
      void commitNudge();
    }
    switch (action.type) {
      case "remove":
        return void removeSelection(targets);
      case "duplicate":
        return void duplicateSelection(targets);
      case "front":
      case "back":
        return void restackSelection(action.type, targets);
      case "undo":
      case "redo":
        return void stepHistory(action.type);
      case "nudge":
        return nudgeSelection(action.dx, action.dy);
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // Keys from portalled popups (the shortcut list, the Add Frame form) bubble through React too.
    if (!(event.target instanceof Element) || !event.currentTarget.contains(event.target)) return;
    if (isEditableFocused(event.target)) return;
    const action = resolveDesignCanvasKey(event.nativeEvent, isMacPlatform(navigator.platform));
    if (action === null) return;
    event.preventDefault();
    run(action);
  };

  const onNodesChange: OnNodesChange<SketchFlowNode | FrameFlowNode | GroupFlowNode> = (
    changes,
  ) => {
    for (const change of changes.getByType("position")) {
      if (change.dragging === true && change.position) {
        const { id, position } = change;
        setDragging((current) => ({ ...current, [id]: position }));
      }
    }
    const selects = changes.getByType("select");
    if (selects.length === 0) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const change of selects) {
        if (change.selected) next.add(change.id);
        else next.delete(change.id);
      }
      return next;
    });
  };

  const showMenu = async (
    event: ReactMouseEvent,
    items: ReadonlyArray<ContextMenuItem<string>>,
  ): Promise<string | null> => {
    event.preventDefault();
    const api = readLocalApi();
    if (!api) return null;
    const clicked = await settlePromise(() =>
      api.contextMenu.show(
        items,
        { x: event.clientX, y: event.clientY },
        contextMenuSourceOf(event),
      ),
    );
    return clicked._tag === "Success" ? clicked.value : null;
  };

  const onNodeContextMenu = async (event: ReactMouseEvent, node: { readonly id: string }) => {
    if (!designing || !visibleIds.has(node.id)) return event.preventDefault();
    if (!selectedIds.has(node.id)) setSelectedIds(new Set([node.id]));
    const targets = selectedIds.has(node.id)
      ? selectedNodes
      : snapshot.nodes.filter((entry) => entry.id === node.id);
    const hasFrame = targets.some((entry) => entry.kind === "frame");
    const single = targets.length === 1;
    const clicked = await showMenu(event, [
      {
        id: "duplicate",
        label: gt("Duplicate Frame"),
        disabled: !props.canWrite || !hasFrame,
      },
      { id: "front", label: gt("Bring to front"), disabled: !props.canWrite || !single },
      { id: "back", label: gt("Send to back"), disabled: !props.canWrite || !single },
      {
        id: "remove",
        label: gt("Remove from canvas"),
        destructive: true,
        separatorBefore: true,
        disabled: !props.canWrite,
      },
    ]);
    if (
      clicked === "duplicate" ||
      clicked === "front" ||
      clicked === "back" ||
      clicked === "remove"
    )
      run({ type: clicked }, targets);
  };

  const onPaneContextMenu = async (event: ReactMouseEvent | MouseEvent) => {
    if (!("nativeEvent" in event)) return;
    const clicked = await showMenu(event, [
      { id: "selectAll", label: gt("Select all"), disabled: !designing || visibleIds.size === 0 },
      { id: "fitAll", label: gt("Zoom to fit") },
    ]);
    if (clicked === "selectAll" || clicked === "fitAll") run({ type: clicked });
  };

  const onOpenSketch = (sketch: DesignSketch) => {
    const siblings =
      sketch.groupId === null
        ? [sketch]
        : snapshot.sketches.filter((entry) => entry.groupId === sketch.groupId);
    setViewing({
      sketches: siblings.map(designSketchReference),
      index: Math.max(
        0,
        siblings.findIndex((entry) => entry.id === sketch.id),
      ),
    });
  };

  const focusSketchId = useDesignFocusStore((state) => state.pending[scopedThreadKey(threadRef)]);
  const focusNodeId = snapshot.nodes.find(
    (node) => node.kind === "sketch" && node.sketchId === focusSketchId,
  )?.id;
  const [handledFocusId, setHandledFocusId] = useState<string | undefined>(undefined);
  if (focusNodeId !== handledFocusId) {
    setHandledFocusId(focusNodeId);
    if (focusNodeId !== undefined) setSelectedIds(new Set([focusNodeId]));
  }
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- moves the React Flow viewport, an external system, to the node a chat card asked for
  useEffect(() => {
    if (focusNodeId === undefined) return;
    useDesignFocusStore.getState().consume(threadRef);
    viewportTouched.current = true;
    void flow.fitView({
      nodes: [{ id: focusNodeId }],
      maxZoom: 1.5,
      padding: "12%",
      duration: 200,
    });
  }, [focusNodeId, threadRef, flow]);

  const focusSketchKnown = snapshot.sketches.some((sketch) => sketch.id === focusSketchId);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- a request for a sketch with no node can never focus: place it when it exists and may be placed, otherwise drop the request
  useEffect(() => {
    if (focusSketchId === undefined || focusNodeId !== undefined) return;
    if (!focusSketchKnown || !props.canWrite) {
      useDesignFocusStore.getState().consume(threadRef);
      return;
    }
    void placeSketch({
      environmentId: props.environmentId,
      input: { threadId: threadRef.threadId, sketchId: DesignSketchId.make(focusSketchId) },
    }).then((result) => {
      if (result._tag !== "Success") useDesignFocusStore.getState().consume(threadRef);
    });
  }, [
    focusSketchId,
    focusNodeId,
    focusSketchKnown,
    props.canWrite,
    props.environmentId,
    threadRef,
    placeSketch,
  ]);

  const storedFrameId = useDesignFrameStore((state) => state.focusedByThread[threadKey]);
  const focusedFrameId = flowNodes.some(
    (node) => node.type === "frame" && node.id === storedFrameId,
  )
    ? storedFrameId
    : undefined;
  const addMenuOpen = useDesignFrameStore((state) => state.addMenuOpen[threadKey] === true);
  const focusFrame = (nodeId: string) => useDesignFrameStore.getState().focus(threadRef, nodeId);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- moves the React Flow viewport, an external system, onto the focused Frame: its native webview only runs while the whole Frame is in view
  useEffect(() => {
    if (focusedFrameId === undefined) return;
    viewportTouched.current = true;
    void flow.fitView({
      nodes: [{ id: focusedFrameId }],
      maxZoom: 1,
      padding: "8%",
      duration: 200,
    });
  }, [focusedFrameId, flow]);

  const panning = tool === "pan";
  return (
    <DesignCanvasContext value={{ environmentId: props.environmentId, threadRef, onOpenSketch }}>
      <DesignFrameContext
        value={{
          environmentId: props.environmentId,
          threadRef,
          canWrite: props.canWrite,
          focusedId: focusedFrameId,
        }}
      >
        <div
          ref={wrapperRef}
          tabIndex={-1}
          aria-label={gt("Design canvas")}
          className="size-full outline-none"
          data-design-canvas
          onKeyDown={onKeyDown}
          onPointerDownCapture={(event) => {
            if (isEditableFocused(event.target)) return;
            wrapperRef.current?.focus({ preventScroll: true });
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={[]}
            nodeTypes={NODE_TYPES}
            defaultViewport={snapshot.viewport ?? { x: 0, y: 0, zoom: 1 }}
            fitView={snapshot.viewport === null}
            fitViewOptions={FIT_OPTIONS}
            proOptions={{ hideAttribution: true }}
            minZoom={0.05}
            maxZoom={4}
            onlyRenderVisibleElements
            nodesConnectable={false}
            nodesDraggable={movable}
            elementsSelectable={designing}
            deleteKeyCode={null}
            selectionKeyCode={designing && panning ? "Shift" : null}
            multiSelectionKeyCode={MULTI_SELECTION_KEYS}
            panOnScroll={!zoomHeld}
            zoomOnScroll={zoomHeld}
            zoomActivationKeyCode={null}
            panOnDrag={panning}
            selectionOnDrag={designing && !panning}
            selectionMode={SelectionMode.Partial}
            className={panning || panHeld ? "cursor-grab" : undefined}
            onNodesChange={onNodesChange}
            onNodeClick={(_, node) => {
              if (node.type === "frame" && node.id !== focusedFrameId) focusFrame(node.id);
            }}
            onNodeContextMenu={(event, node) => void onNodeContextMenu(event, node)}
            onPaneContextMenu={(event) => void onPaneContextMenu(event)}
            onNodeDragStop={async (_, __, dragged) => {
              const moves = dragged.flatMap((node) => {
                const from = nodesById.get(node.id);
                if (
                  from === undefined ||
                  (from.x === node.position.x && from.y === node.position.y)
                )
                  return [];
                return [{ id: node.id, from: { x: from.x, y: from.y }, to: node.position }];
              });
              if (moves.length > 0) {
                record({ type: "move", moves });
                await move(moves.map((entry) => ({ id: entry.id, ...entry.to })));
              }
              setDragging({});
            }}
            onMoveStart={(event) => {
              if (event !== null) viewportTouched.current = true;
            }}
            onMoveEnd={(event, viewport) => {
              if (event !== null) saveViewportSoon(viewport);
            }}
          >
            <Background />
            <Panel position="top-center">
              <DesignCanvasModeSwitch mode={mode} onModeChange={changeMode} />
            </Panel>
            <Panel position="top-right" className="flex gap-1">
              {props.library !== undefined ? (
                <ToolbarButton
                  label={props.library.open ? gt("Hide project sketches") : gt("Project sketches")}
                  onClick={props.library.onToggle}
                >
                  <LibraryIcon className="size-3.5" />
                </ToolbarButton>
              ) : null}
              <ToolbarButton label={gt("Canvas shortcuts")} onClick={() => setShortcutsOpen(true)}>
                <KeyboardIcon className="size-3.5" />
              </ToolbarButton>
              <ToolbarButton
                label={props.maximized ? gt("Exit full screen") : gt("Full screen")}
                onClick={props.onToggleMaximized}
              >
                {props.maximized ? (
                  <Minimize2Icon className="size-3.5" />
                ) : (
                  <Maximize2Icon className="size-3.5" />
                )}
              </ToolbarButton>
            </Panel>
            <Panel position="bottom-center">
              <DesignCanvasToolbar
                tool={tool}
                panHeld={panHeld}
                onToolChange={(next) => run({ type: "tool", tool: next })}
              >
                {previewBridge !== null && designing ? (
                  <AddFrameMenu
                    environmentId={props.environmentId}
                    threadRef={threadRef}
                    canWrite={props.canWrite}
                    open={addMenuOpen && props.canWrite}
                    onOpenChange={(open) =>
                      useDesignFrameStore.getState().setAddMenuOpen(threadRef, open)
                    }
                    onAdded={(nodeId) => {
                      setSelectedIds(new Set([nodeId]));
                      focusFrame(nodeId);
                    }}
                  />
                ) : undefined}
              </DesignCanvasToolbar>
            </Panel>
          </ReactFlow>
        </div>
        <DesignRecenterButton rects={flowNodes.map(nodeRect)} onRecenter={fitAll} />
      </DesignFrameContext>
      {flowNodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center text-muted-foreground">
          <FrameIcon className="size-7" />
          <p className="max-w-xs text-sm">
            {previewBridge !== null ? (
              <T>
                Nothing here yet. Ask the agent to design a screen with design_sketch, or add a
                Frame to see your running app.
              </T>
            ) : (
              <T>
                No sketches yet. Ask the agent to design a screen and it will place it here with
                design_sketch.
              </T>
            )}
          </p>
        </div>
      ) : null}
      <DesignShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      {viewing !== null ? (
        <EnvironmentSketchViewer
          environmentId={props.environmentId}
          threadRef={threadRef}
          sketches={viewing.sketches}
          initialIndex={viewing.index}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </DesignCanvasContext>
  );
}

function nodeRect(node: SketchFlowNode | FrameFlowNode) {
  return { ...node.position, width: node.width ?? 0, height: node.height ?? 0 };
}

export function DesignCanvas(props: Parameters<typeof DesignCanvasInner>[0]) {
  return (
    <ReactFlowProvider>
      <DesignCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
