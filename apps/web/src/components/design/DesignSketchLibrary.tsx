import type { DesignProjectSketch, EnvironmentId, ProjectId } from "@t3tools/contracts";
import { useGT } from "gt-react";
import { FrameIcon, PlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useAtomCommand } from "~/state/use-atom-command";
import { designEnvironment } from "~/state/design";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";
import { DESIGN_SKETCH_DRAG_TYPE, groupSketchesByOrigin } from "./projectSketchLibrary";
import { useSketchThumbnailUrl } from "./sketchAssets";

const SEARCH_DELAY_MS = 250;

interface LibraryPage {
  readonly query: string;
  readonly sketches: ReadonlyArray<DesignProjectSketch>;
  readonly nextCursor: string | null;
  readonly status: "loading" | "ready" | "failed";
}

function LibraryItem(props: {
  readonly environmentId: EnvironmentId;
  readonly sketch: DesignProjectSketch;
  readonly canWrite: boolean;
  readonly onPlace: (sketchId: string) => void;
}) {
  const gt = useGT();
  const { sketch } = props;
  const src = useSketchThumbnailUrl(props.environmentId, sketch.thumbnailAttachmentId);
  return (
    <li
      draggable={props.canWrite}
      onDragStart={(event) => {
        event.dataTransfer.setData(DESIGN_SKETCH_DRAG_TYPE, sketch.id);
        event.dataTransfer.effectAllowed = "copy";
      }}
      data-design-library-item={sketch.id}
      className="group relative overflow-hidden rounded-md bg-card ring-1 ring-border"
    >
      <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
        {src === null ? (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <FrameIcon className="size-6" />
          </div>
        ) : (
          <img
            src={src}
            alt=""
            loading="lazy"
            draggable={false}
            className="size-full object-cover object-top"
          />
        )}
      </div>
      <div className="flex min-w-0 items-center gap-1.5 px-2 py-1.5 text-xs">
        {sketch.label ? (
          <span className="max-w-[50%] shrink-0 truncate rounded bg-muted px-1 font-medium text-muted-foreground">
            {sketch.label}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate">{sketch.title}</span>
        <Button
          aria-label={gt("Add sketch {title} to the canvas", { title: sketch.title })}
          size="icon-xs"
          variant="ghost"
          className="shrink-0"
          disabled={!props.canWrite}
          onClick={() => props.onPlace(sketch.id)}
        >
          <PlusIcon className="size-3" />
        </Button>
      </div>
    </li>
  );
}

/** Every sketch of the project, from any thread, ready to be dragged onto this thread's canvas. */
export function DesignSketchLibrary(props: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly canWrite: boolean;
  readonly onPlace: (sketchId: string) => void;
}) {
  const gt = useGT();
  const listSketches = useAtomCommand(designEnvironment.listProjectSketches, {
    label: "design list project sketches",
    reportFailure: false,
  });
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<LibraryPage>({
    query: "",
    sketches: [],
    nextCursor: null,
    status: "loading",
  });
  const [reloadKey, setReloadKey] = useState(0);
  const handledReloadKey = useRef(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const trimmed = query.trim();

  const fetchPage = (search: string, cursor: string | null) =>
    listSketches({
      environmentId: props.environmentId,
      input: {
        projectId: props.projectId,
        ...(search === "" ? {} : { query: search }),
        ...(cursor === null ? {} : { cursor }),
      },
    });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- loads the first page from the server, an external system, whenever the search text or the project changes; typing waits for a short pause first
  useEffect(() => {
    let cancelled = false;
    const retrying = reloadKey !== handledReloadKey.current;
    handledReloadKey.current = reloadKey;
    const timer = setTimeout(
      () => {
        setPage((current) => ({ ...current, status: "loading" }));
        void listSketches({
          environmentId: props.environmentId,
          input: { projectId: props.projectId, ...(trimmed === "" ? {} : { query: trimmed }) },
        }).then((result) => {
          if (cancelled) return;
          setPage(
            result._tag === "Success"
              ? {
                  query: trimmed,
                  sketches: result.value.sketches,
                  nextCursor: result.value.nextCursor,
                  status: "ready",
                }
              : { query: trimmed, sketches: [], nextCursor: null, status: "failed" },
          );
        });
      },
      trimmed === "" || retrying ? 0 : SEARCH_DELAY_MS,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, listSketches, props.environmentId, props.projectId, reloadKey]);

  const loadMore = async () => {
    if (page.nextCursor === null || loadingMore) return;
    setLoadingMore(true);
    const result = await fetchPage(page.query, page.nextCursor);
    setLoadingMore(false);
    if (result._tag !== "Success") return;
    const { sketches, nextCursor } = result.value;
    setPage((current) =>
      current.query === page.query
        ? { ...current, sketches: [...current.sketches, ...sketches], nextCursor }
        : current,
    );
  };

  const groups = groupSketchesByOrigin(page.sketches);

  return (
    <aside
      aria-label={gt("Project sketches")}
      data-design-library
      className="flex h-full w-64 shrink-0 flex-col border-s bg-background"
    >
      <div className="shrink-0 p-2">
        <Input
          type="search"
          aria-label={gt("Search sketches")}
          placeholder={gt("Search sketches")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {page.status === "loading" && page.sketches.length === 0 ? (
          <div className="flex justify-center py-6 text-muted-foreground">
            <Spinner />
          </div>
        ) : null}
        {page.status === "failed" ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground text-xs">
            <p>{gt("Could not load the project's sketches.")}</p>
            <Button size="xs" variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
              {gt("Try again")}
            </Button>
          </div>
        ) : null}
        {page.status === "ready" && groups.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground text-xs">
            {page.query === ""
              ? gt("No sketches in this project yet.")
              : gt("No sketch matches your search.")}
          </p>
        ) : null}
        {groups.map((group) => (
          <section key={group.threadId} className="mb-3" data-design-library-group={group.threadId}>
            <h3 className="sticky top-0 z-10 truncate bg-background py-1 font-medium text-muted-foreground text-xs">
              {group.deleted ? gt("Deleted thread") : (group.title ?? gt("Untitled thread"))}
            </h3>
            <ul className="flex flex-col gap-2">
              {group.sketches.map((sketch) => (
                <LibraryItem
                  key={sketch.id}
                  environmentId={props.environmentId}
                  sketch={sketch}
                  canWrite={props.canWrite}
                  onPlace={props.onPlace}
                />
              ))}
            </ul>
          </section>
        ))}
        {page.nextCursor !== null ? (
          <Button
            size="xs"
            variant="outline"
            className="w-full"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore ? <Spinner /> : gt("Load more")}
          </Button>
        ) : null}
      </div>
    </aside>
  );
}
