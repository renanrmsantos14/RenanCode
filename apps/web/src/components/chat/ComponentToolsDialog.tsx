import { useAtomValue } from "@effect/atom-react";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { Atom } from "effect/reactivity";
import { useId, useState } from "react";

import { useComposerDraftStore } from "~/composerDraftStore";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { buildThreadRouteParams } from "~/threadRoutes";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Toggle, ToggleGroup } from "../ui/toggle-group";

type ComponentToolMode = "find" | "replace" | "web";

interface ComponentToolRequest {
  readonly threadRef: ScopedThreadRef;
  readonly mode: ComponentToolMode;
}

/** The thread menus close as their command runs, so one host in the root renders the dialog. */
const componentToolsDialogAtom = Atom.make<ComponentToolRequest | null>(null).pipe(
  Atom.keepAlive,
  Atom.withLabel("component-tools:dialog"),
);

export function openComponentToolsDialog(threadRef: ScopedThreadRef, mode: ComponentToolMode) {
  appAtomRegistry.set(componentToolsDialogAtom, { threadRef, mode });
}

interface ComponentToolFields {
  readonly name: string;
  readonly replacement: string;
  readonly notes: string;
}

function buildComponentToolPrompt(
  mode: ComponentToolMode,
  fields: ComponentToolFields,
): string | null {
  const name = fields.name.trim();
  const replacement = fields.replacement.trim();
  const notes = fields.notes.trim();
  const extra = notes.length > 0 ? `\n\nContexto: ${notes}` : "";
  switch (mode) {
    case "find":
      if (name.length === 0) return null;
      return (
        `Procure no código deste projeto o componente "${name}". ` +
        "Liste onde ele é definido e todos os lugares onde é usado (caminho:linha), " +
        "e resuma as props e variantes dele. Não altere nenhum arquivo." +
        extra
      );
    case "replace":
      if (name.length === 0 || replacement.length === 0) return null;
      return (
        `Substitua em todo o projeto o componente "${name}" por "${replacement}". ` +
        "Antes de editar, liste todos os usos encontrados. Ajuste imports e props para a API nova, " +
        "preserve o comportamento e, no final, rode o typecheck dos pacotes afetados." +
        extra
      );
    case "web":
      if (name.length === 0) return null;
      return (
        `Procure na web componentes prontos para: ${name}. ` +
        "Veja a stack deste projeto (package.json, biblioteca de UI e estilos já usados) " +
        "e considere só opções compatíveis. " +
        "Compare de 3 a 5 opções com link, licença, tamanho, acessibilidade e encaixe no design atual, " +
        "e recomende uma. Não instale nada ainda." +
        extra
      );
  }
}

const MODE_COPY: Record<
  ComponentToolMode,
  { readonly description: string; readonly nameLabel: string; readonly placeholder: string }
> = {
  find: {
    description: "Find where a component is defined and used in this project.",
    nameLabel: "Component",
    placeholder: "e.g. Button, SidebarThreadRow",
  },
  replace: {
    description: "Replace a component everywhere it is used in this project.",
    nameLabel: "Replace",
    placeholder: "e.g. OldModal",
  },
  web: {
    description: "Look for ready-made components on the web that fit this project.",
    nameLabel: "What do you need?",
    placeholder: "e.g. date range picker, data table with sorting",
  },
};

export function ComponentToolsDialogHost() {
  const request = useAtomValue(componentToolsDialogAtom);
  if (request === null) return null;
  return (
    <ComponentToolsDialog
      key={scopedThreadKey(request.threadRef)}
      request={request}
      onClose={() => appAtomRegistry.set(componentToolsDialogAtom, null)}
    />
  );
}

function ComponentToolsDialog({
  request,
  onClose,
}: {
  readonly request: ComponentToolRequest;
  readonly onClose: () => void;
}) {
  const id = useId();
  const navigate = useNavigate();
  const [mode, setMode] = useState<ComponentToolMode>(request.mode);
  const [name, setName] = useState("");
  const [replacement, setReplacement] = useState("");
  const [notes, setNotes] = useState("");
  const prompt = buildComponentToolPrompt(mode, { name, replacement, notes });
  const copy = MODE_COPY[mode];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup className="sm:max-w-md">
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (prompt === null) return;
            const store = useComposerDraftStore.getState();
            const current = store.getComposerDraft(request.threadRef)?.prompt.trim() ?? "";
            store.setPrompt(
              request.threadRef,
              current.length > 0 ? `${current}\n\n${prompt}` : prompt,
            );
            onClose();
            void navigate({
              to: "/$environmentId/$threadId",
              params: buildThreadRouteParams(request.threadRef),
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Components</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-4">
              <ToggleGroup
                aria-label="Component action"
                className="w-full *:flex-1"
                value={[mode]}
                onValueChange={(next) => {
                  const value = next[0];
                  if (value === "find" || value === "replace" || value === "web") setMode(value);
                }}
              >
                <Toggle value="find">Find in app</Toggle>
                <Toggle value="replace">Replace all</Toggle>
                <Toggle value="web">Find on web</Toggle>
              </ToggleGroup>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${id}-name`}>{copy.nameLabel}</Label>
                <Input
                  nativeInput
                  autoFocus
                  id={`${id}-name`}
                  placeholder={copy.placeholder}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              {mode === "replace" ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`${id}-replacement`}>With</Label>
                  <Input
                    nativeInput
                    id={`${id}-replacement`}
                    placeholder="e.g. Dialog from components/ui"
                    value={replacement}
                    onChange={(event) => setReplacement(event.target.value)}
                  />
                </div>
              ) : null}
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${id}-notes`}>Notes (optional)</Label>
                <Textarea
                  id={`${id}-notes`}
                  rows={3}
                  placeholder="Anything the agent should know"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={prompt === null}>
              Add to composer
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
