import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
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
  useReactFlow,
  useViewportStore,
} from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import { T, useGT } from "gt-react";
import {
  FrameIcon,
  Maximize2Icon,
  Minimize2Icon,
  MinusIcon,
  PlusIcon,
  ScanIcon,
  Trash2Icon,
} from "lucide-react";
import { createContext, type ReactNode, use, useEffect, useRef, useState } from "react";

import { useAtomCommand } from "~/state/use-atom-command";
import { designEnvironment } from "~/state/design";

import { HtmlRenderDocument } from "../files/BrowserDocumentFrame";
import { previewBridge } from "../preview/previewBridge";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { AddFrameMenu } from "./AddFrameMenu";
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

const NODE_TYPES = { sketch: SketchNode, frame: FrameNode };

function ToolbarButton(props: {
  readonly label: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={props.label}
            size="icon-xs"
            variant="glass"
            disabled={props.disabled ?? false}
            onClick={props.onClick}
          />
        }
      >
        {props.children}
      </TooltipTrigger>
      <TooltipPopup side="bottom">{props.label}</TooltipPopup>
    </Tooltip>
  );
}

function DesignCanvasInner(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly snapshot: DesignCanvasSnapshot;
  readonly canWrite: boolean;
  readonly maximized: boolean;
  readonly onToggleMaximized: () => void;
}) {
  const gt = useGT();
  const flow = useReactFlow();
  const { snapshot, threadRef } = props;
  const moveNodes = useAtomCommand(designEnvironment.moveNodes, { label: "design move nodes" });
  const setViewport = useAtomCommand(designEnvironment.setViewport, {
    label: "design set viewport",
    reportFailure: false,
  });
  const removeNode = useAtomCommand(designEnvironment.removeNode, { label: "design remove node" });
  const placeSketch = useAtomCommand(designEnvironment.placeSketch, {
    label: "design place sketch",
  });
  const [dragging, setDragging] = useState<Readonly<Record<string, { x: number; y: number }>>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{
    readonly sketches: ReadonlyArray<DesignSketchReference>;
    readonly index: number;
  } | null>(null);
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const viewportTouched = useRef(snapshot.viewport !== null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- cancels the pending viewport save, a timer outside React, when the canvas unmounts
  useEffect(() => () => clearTimeout(viewportTimer.current), []);
  const containerWidth = useViewportStore((state) => state.width);
  const containerHeight = useViewportStore((state) => state.height);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- refits the React Flow viewport, an external system, when the container resizes (full screen) before the user has moved the view
  useEffect(() => {
    if (viewportTouched.current || containerWidth === 0 || containerHeight === 0) return;
    void flow.fitView(FIT_OPTIONS);
  }, [containerWidth, containerHeight, flow]);

  const sketchesById = new Map(snapshot.sketches.map((sketch) => [sketch.id, sketch]));
  const nodes: Array<SketchFlowNode | FrameFlowNode> = snapshot.nodes.flatMap<
    SketchFlowNode | FrameFlowNode
  >((node) => {
    const base = {
      id: node.id,
      position: dragging[node.id] ?? { x: node.x, y: node.y },
      width: node.width,
      height: node.height,
      zIndex: node.z,
      selected: node.id === selectedId,
      draggable: props.canWrite,
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

  const onNodesChange: OnNodesChange<SketchFlowNode | FrameFlowNode> = (changes) => {
    for (const change of changes.getByType("position")) {
      if (change.dragging === true && change.position) {
        const { id, position } = change;
        setDragging((current) => ({ ...current, [id]: position }));
      }
    }
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
    if (focusNodeId !== undefined) setSelectedId(focusNodeId);
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

  const selectedNode = snapshot.nodes.find((node) => node.id === selectedId);

  const threadKey = scopedThreadKey(threadRef);
  const storedFrameId = useDesignFrameStore((state) => state.focusedByThread[threadKey]);
  const focusedFrameId = nodes.some((node) => node.type === "frame" && node.id === storedFrameId)
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
        <ReactFlow
          nodes={nodes}
          edges={[]}
          nodeTypes={NODE_TYPES}
          defaultViewport={snapshot.viewport ?? { x: 0, y: 0, zoom: 1 }}
          fitView={snapshot.viewport === null}
          fitViewOptions={FIT_OPTIONS}
          proOptions={{ hideAttribution: true }}
          minZoom={0.05}
          maxZoom={2}
          onlyRenderVisibleElements
          nodesConnectable={false}
          deleteKeyCode={null}
          onNodesChange={onNodesChange}
          onNodeClick={(_, node) => {
            setSelectedId(node.id);
            if (node.type === "frame" && node.id !== focusedFrameId) focusFrame(node.id);
          }}
          onPaneClick={() => setSelectedId(null)}
          onNodeDragStop={async (_, __, dragged) => {
            const moved = dragged.map((node) => ({
              nodeId: DesignNodeId.make(node.id),
              x: node.position.x,
              y: node.position.y,
            }));
            await moveNodes({
              environmentId: props.environmentId,
              input: { threadId: threadRef.threadId, nodes: moved },
            });
            setDragging({});
          }}
          onMoveStart={(event) => {
            if (event !== null) viewportTouched.current = true;
          }}
          onMoveEnd={(event, viewport) => {
            if (event === null || !props.canWrite) return;
            clearTimeout(viewportTimer.current);
            viewportTimer.current = setTimeout(() => {
              void setViewport({
                environmentId: props.environmentId,
                input: { threadId: threadRef.threadId, viewport },
              });
            }, VIEWPORT_SAVE_DELAY_MS);
          }}
        >
          <Background />
          <Panel position="top-right" className="flex gap-1">
            {previewBridge !== null ? (
              <AddFrameMenu
                environmentId={props.environmentId}
                threadRef={threadRef}
                canWrite={props.canWrite}
                open={addMenuOpen && props.canWrite}
                onOpenChange={(open) =>
                  useDesignFrameStore.getState().setAddMenuOpen(threadRef, open)
                }
                onAdded={(nodeId) => {
                  setSelectedId(nodeId);
                  focusFrame(nodeId);
                }}
              />
            ) : null}
            <ToolbarButton
              label={gt("Remove from canvas")}
              disabled={!props.canWrite || selectedNode === undefined}
              onClick={async () => {
                if (selectedNode === undefined) return;
                setSelectedId(null);
                await removeNode({
                  environmentId: props.environmentId,
                  input: { threadId: threadRef.threadId, nodeId: selectedNode.id },
                });
              }}
            >
              <Trash2Icon className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton label={gt("Zoom out")} onClick={() => void flow.zoomOut()}>
              <MinusIcon className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton label={gt("Zoom in")} onClick={() => void flow.zoomIn()}>
              <PlusIcon className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
              label={gt("Fit to screen")}
              onClick={() => void flow.fitView(FIT_OPTIONS)}
            >
              <ScanIcon className="size-3.5" />
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
        </ReactFlow>
      </DesignFrameContext>
      {nodes.length === 0 ? (
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

export function DesignCanvas(props: Parameters<typeof DesignCanvasInner>[0]) {
  return (
    <ReactFlowProvider>
      <DesignCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
