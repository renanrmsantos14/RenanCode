import { useViewportStore } from "@xyflow/react";
import { useGT } from "gt-react";
import {
  HandIcon,
  LocateFixedIcon,
  MousePointer2Icon,
  PlayIcon,
  SquareDashedIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { isMacPlatform } from "~/lib/utils";

import { Button } from "../ui/button";
import { Dialog, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "../ui/dialog";
import { Kbd, KbdGroup } from "../ui/kbd";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  DESIGN_CANVAS_SHORTCUT_GROUPS,
  type DesignCanvasMode,
  type DesignCanvasTool,
} from "./designCanvasControls";

const SURFACE =
  "pointer-events-auto flex items-center gap-1 rounded-xl border border-border/60 p-1 shadow-md surface-glass";

function ToolButton(props: {
  readonly label: string;
  readonly shortcut: string;
  readonly pressed: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={props.label}
            aria-pressed={props.pressed}
            size="icon-sm"
            variant={props.pressed ? "secondary" : "ghost"}
            onClick={props.onClick}
          />
        }
      >
        {props.children}
      </TooltipTrigger>
      <TooltipPopup side="top">
        {props.label} · {props.shortcut}
      </TooltipPopup>
    </Tooltip>
  );
}

/** Bottom-centre tools, as in RenanDesign: Select and Pan, then what adds to the canvas. */
export function DesignCanvasToolbar(props: {
  readonly tool: DesignCanvasTool;
  /** Space held: shown as Pan without changing the chosen tool. */
  readonly panHeld: boolean;
  readonly onToolChange: (tool: DesignCanvasTool) => void;
  /** The add tools; left out in Preview. */
  readonly children?: ReactNode;
}) {
  const gt = useGT();
  const shown = props.panHeld ? "pan" : props.tool;
  return (
    <div role="toolbar" aria-label={gt("Canvas tools")} className={SURFACE} data-design-toolbar>
      <ToolButton
        label={gt("Select")}
        shortcut="V"
        pressed={shown === "select"}
        onClick={() => props.onToolChange("select")}
      >
        <MousePointer2Icon className="size-4" />
      </ToolButton>
      <ToolButton
        label={gt("Pan")}
        shortcut="H"
        pressed={shown === "pan"}
        onClick={() => props.onToolChange("pan")}
      >
        <HandIcon className="size-4" />
      </ToolButton>
      {props.children !== undefined ? (
        <>
          <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
          {props.children}
        </>
      ) : null}
    </div>
  );
}

/** Top-centre Design/Preview switch: Preview locks the canvas so the pages can be used. */
export function DesignCanvasModeSwitch(props: {
  readonly mode: DesignCanvasMode;
  readonly onModeChange: (mode: DesignCanvasMode) => void;
}) {
  const gt = useGT();
  return (
    <div className={SURFACE}>
      <ToggleGroup
        aria-label={gt("Canvas mode")}
        value={[props.mode]}
        onValueChange={(value) => {
          if (value[0] === "design" || value[0] === "preview") props.onModeChange(value[0]);
        }}
        data-design-mode-switch
      >
        <Toggle value="design" aria-label={`${gt("Design")} (D)`}>
          <SquareDashedIcon className="size-3.5" />
          {gt("Design")}
        </Toggle>
        <Toggle value="preview" aria-label={`${gt("Preview")} (P)`}>
          <PlayIcon className="size-3.5" />
          {gt("Preview")}
        </Toggle>
      </ToggleGroup>
    </div>
  );
}

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Shown when the canvas has nodes but the view has drifted away from all of them. */
export function DesignRecenterButton(props: {
  readonly rects: ReadonlyArray<Rect>;
  readonly onRecenter: () => void;
}) {
  const gt = useGT();
  // A boolean selector, so panning re-renders only when the answer flips.
  const lost = useViewportStore((state) => {
    const [tx, ty, zoom] = state.transform;
    if (props.rects.length === 0 || state.width === 0 || state.height === 0) return false;
    return !props.rects.some(
      (rect) =>
        rect.x * zoom + tx < state.width &&
        (rect.x + rect.width) * zoom + tx > 0 &&
        rect.y * zoom + ty < state.height &&
        (rect.y + rect.height) * zoom + ty > 0,
    );
  });
  if (!lost) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <Button className="pointer-events-auto" variant="glass" onClick={props.onRecenter}>
        <LocateFixedIcon className="size-4" />
        {gt("Back to designs")}
      </Button>
    </div>
  );
}

function comboKeys(combo: string, isMac: boolean): string[] {
  if (combo === "shift++") return [isMac ? "⇧" : "Shift", "+"];
  return combo.split("+").map((part) => {
    if (part === "mod") return isMac ? "⌘" : "Ctrl";
    if (part === "shift") return isMac ? "⇧" : "Shift";
    return part;
  });
}

export function DesignShortcutsDialog(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const gt = useGT();
  const isMac = isMacPlatform(navigator.platform);
  const groupLabels: Record<(typeof DESIGN_CANVAS_SHORTCUT_GROUPS)[number]["id"], string> = {
    general: gt("General"),
    tools: gt("Tools"),
    modes: gt("Modes"),
    edit: gt("Edit"),
    view: gt("View"),
  };
  const rowLabels: Record<
    (typeof DESIGN_CANVAS_SHORTCUT_GROUPS)[number]["rows"][number]["id"],
    string
  > = {
    shortcuts: gt("Show shortcuts"),
    fullScreen: gt("Full screen"),
    select: gt("Select"),
    pan: gt("Pan"),
    addFrame: gt("Add Frame"),
    design: gt("Design mode"),
    preview: gt("Preview mode"),
    undo: gt("Undo"),
    redo: gt("Redo"),
    duplicate: gt("Duplicate Frame"),
    selectAll: gt("Select all"),
    front: gt("Bring to front"),
    back: gt("Send to back"),
    nudge: gt("Nudge 1 px / 10 px"),
    remove: gt("Remove from canvas"),
    zoomIn: gt("Zoom in"),
    zoomOut: gt("Zoom out"),
    fitAll: gt("Zoom to fit"),
    fitSelection: gt("Zoom to selection"),
    actualSize: gt("Zoom to 100%"),
  };
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{gt("Canvas shortcuts")}</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <div className="grid gap-4 sm:grid-cols-2">
            {DESIGN_CANVAS_SHORTCUT_GROUPS.map((group) => (
              <section key={group.id} className="flex flex-col gap-1.5">
                <h3 className="font-medium text-muted-foreground text-xs">
                  {groupLabels[group.id]}
                </h3>
                {group.rows.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>{rowLabels[row.id]}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {row.combos.map((combo) => (
                        <KbdGroup key={combo}>
                          {comboKeys(combo, isMac).map((key) => (
                            <Kbd key={key}>{key}</Kbd>
                          ))}
                        </KbdGroup>
                      ))}
                    </span>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
