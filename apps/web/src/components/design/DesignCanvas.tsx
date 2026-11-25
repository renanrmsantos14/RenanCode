import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { type DesignCanvasSnapshot, DesignNodeId, type DesignSketch } from "@t3tools/contracts";
import { type DesignSketchReference, designSketchReference } from "@t3tools/shared/design";
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
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { EnvironmentSketchViewer } from "./DesignSketchCard";
import { useDesignFocusStore } from "./designFocusStore";
import { useSketchPageUrl, useSketchThumbnailUrl } from "./sketchAssets";

/** Below this zoom a node is a thumbnail: a live page this small is unreadable and costs a frame each. */
const LIVE_PAGE_MIN_ZOOM = 0.35;
const VIEWPORT_SAVE_DELAY_MS = 400;

type SketchFlowNode = Node<{ readonly sketch: DesignSketch }, "sketch">;

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
    <div className="flex size-full items-center justify-center text-muted-foreground">
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
  const live = useViewportStore((state) => state.transform[2] >= LIVE_PAGE_MIN_ZOOM);
  const { sketch } = data;
  return (
    <div
      className={`relative size-full rounded-sm bg-card ring-1 ${selected ? "ring-2 ring-primary" : "ring-border"}`}
    >
      <div className="absolute inset-x-0 -top-7 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        {sketch.label ? (
          <span className="shrink-0 rounded bg-muted px-1 font-medium">{sketch.label}</span>
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

const NODE_TYPES = { sketch: SketchNode };

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
  const [dragging, setDragging] = useState<Readonly<Record<string, { x: number; y: number }>>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{
    readonly sketches: ReadonlyArray<DesignSketchReference>;
    readonly index: number;
  } | null>(null);
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const sketchesById = new Map(snapshot.sketches.map((sketch) => [sketch.id, sketch]));
  const nodes: SketchFlowNode[] = snapshot.nodes.flatMap((node) => {
    const sketch = sketchesById.get(node.sketchId);
    if (sketch === undefined) return [];
    return [
      {
        id: node.id,
        type: "sketch" as const,
        position: dragging[node.id] ?? { x: node.x, y: node.y },
        width: node.width,
        height: node.height,
        zIndex: node.z,
        selected: node.id === selectedId,
        draggable: props.canWrite,
        data: { sketch },
      },
    ];
  });

  const onNodesChange: OnNodesChange<SketchFlowNode> = (changes) => {
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
  const focusNodeId = snapshot.nodes.find((node) => node.sketchId === focusSketchId)?.id;
  const [handledFocusId, setHandledFocusId] = useState<string | undefined>(undefined);
  if (focusNodeId !== handledFocusId) {
    setHandledFocusId(focusNodeId);
    if (focusNodeId !== undefined) setSelectedId(focusNodeId);
  }
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- moves the React Flow viewport, an external system, to the node a chat card asked for
  useEffect(() => {
    if (focusNodeId === undefined) return;
    useDesignFocusStore.getState().consume(threadRef);
    void flow.fitView({ nodes: [{ id: focusNodeId }], maxZoom: 1, padding: "25%", duration: 200 });
  }, [focusNodeId, threadRef, flow]);

  const selectedNode = snapshot.nodes.find((node) => node.id === selectedId);

  return (
    <DesignCanvasContext value={{ environmentId: props.environmentId, threadRef, onOpenSketch }}>
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={NODE_TYPES}
        defaultViewport={snapshot.viewport ?? { x: 0, y: 0, zoom: 1 }}
        fitView={snapshot.viewport === null}
        fitViewOptions={{ maxZoom: 1, padding: "20%" }}
        minZoom={0.05}
        maxZoom={2}
        onlyRenderVisibleElements
        nodesConnectable={false}
        deleteKeyCode={null}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => setSelectedId(node.id)}
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
            onClick={() => void flow.fitView({ maxZoom: 1, padding: "20%" })}
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
      {nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center text-muted-foreground">
          <FrameIcon className="size-7" />
          <p className="max-w-xs text-sm">
            <T>
              No sketches yet. Ask the agent to design a screen and it will place it here with
              design_sketch.
            </T>
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
