import { T, useGT } from "gt-react";
import { use } from "react";

import { MermaidDiagram } from "../chat/MermaidDiagram";
import { MediaReviewContext } from "../chat/review/useReviewMode";

export default function MermaidViewer(props: { readonly text: string }) {
  const gt = useGT();
  const openMedia = use(MediaReviewContext);
  // Mermaid lays out DOM before sanitizing its SVG. Refuse resource and config
  // syntax before that pass so standalone files cannot initiate requests. Node
  // metadata is YAML, whose escaped/aliased image keys cannot be checked lexically.
  if (
    /%%\s*\{|^\s*---|<\/?[A-Za-z]|<[!?]|@\s*\{|\b(?:img|image)\s*:|url\s*\(|@import|(?:https?|data|blob|file):/im.test(
      props.text,
    )
  )
    return (
      <div role="alert" className="p-6 text-xs text-muted-foreground">
        <T>
          This diagram contains resource URLs, markup, node metadata, or custom configuration. Show
          Mermaid source to inspect it safely.
        </T>
      </div>
    );
  return (
    <div className="scrollbar-gutter-both min-h-0 flex-1 overflow-auto p-6 [&_*]:animate-none!">
      <MermaidDiagram
        source={props.text}
        onExpand={(src) => openMedia({ images: [{ src, name: gt("Mermaid diagram") }], index: 0 })}
      />
    </div>
  );
}
