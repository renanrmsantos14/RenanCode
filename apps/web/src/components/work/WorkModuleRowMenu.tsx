import type { WorkModuleId } from "@t3tools/contracts";
import type { WorkModuleNode } from "@t3tools/client-runtime/workModuleTree";
import { EllipsisIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "~/components/ui/menu";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

const ROOT = "__root__";

export function WorkTitleDialog(props: {
  title: string;
  submitLabel: string;
  initialValue?: string;
  canSubmit?: boolean;
  children?: ReactNode;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(props.initialValue ?? "");
  const trimmed = value.trim();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogPopup className="sm:max-w-sm">
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmed === "" || props.canSubmit === false) return;
            props.onClose();
            props.onSubmit(trimmed);
          }}
        >
          <DialogHeader>
            <DialogTitle>{props.title}</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            {props.children}
            <Input
              aria-label="Título"
              placeholder="Título do módulo"
              maxLength={200}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoFocus
            />
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
            <Button type="submit" disabled={trimmed === "" || props.canSubmit === false}>
              {props.submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

const countDescendants = (node: WorkModuleNode): number =>
  node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);

function moveTargets(nodes: WorkModuleNode[], excluded: WorkModuleId): WorkModuleNode[] {
  return nodes.flatMap((node) =>
    node.module.id === excluded ? [] : [node, ...moveTargets(node.children, excluded)],
  );
}

function MoveDialog(props: {
  node: WorkModuleNode;
  projectNodes: WorkModuleNode[];
  onMove: (parentId: WorkModuleId | null, index: number) => void;
  onClose: () => void;
}) {
  const targets = moveTargets(props.projectNodes, props.node.module.id);
  const [target, setTarget] = useState<string>(props.node.module.parentId ?? ROOT);
  const labels = new Map<string, string>([[ROOT, "Nível principal"]]);
  for (const candidate of targets) {
    labels.set(
      candidate.module.id,
      [...candidate.ancestorTitles, candidate.module.title].join(" › "),
    );
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogPopup className="sm:max-w-sm">
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            const parent = targets.find((candidate) => candidate.module.id === target);
            props.onClose();
            props.onMove(
              parent?.module.id ?? null,
              (parent?.children ?? props.projectNodes).length,
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Mover {props.node.module.title}</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <Select
              value={target}
              onValueChange={(value) => {
                if (typeof value === "string") setTarget(value);
              }}
            >
              <SelectTrigger aria-label="Novo módulo pai">
                <SelectValue>{labels.get(target)}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {[...labels].map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
            <Button type="submit">Mover</Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

export function WorkModuleRowMenu(props: {
  node: WorkModuleNode;
  projectNodes: WorkModuleNode[];
  canWrite: boolean;
  onAddChild: (title: string) => void;
  onRename: (title: string) => void;
  onMove: (parentId: WorkModuleId | null, index: number) => void;
  onNewThread: () => void;
  onDelete: () => void;
}) {
  const [dialog, setDialog] = useState<"add" | "rename" | "move" | "delete" | null>(null);
  const close = () => setDialog(null);
  const title = props.node.module.title;
  const descendants = countDescendants(props.node);
  return (
    <>
      <Menu>
        <MenuTrigger
          render={<Button variant="ghost" size="icon-xs" aria-label={`Ações de ${title}`} />}
        >
          <EllipsisIcon />
        </MenuTrigger>
        <MenuPopup align="end">
          {props.canWrite ? (
            <>
              <MenuItem onClick={() => setDialog("add")}>Adicionar submódulo</MenuItem>
              <MenuItem onClick={() => setDialog("rename")}>Renomear</MenuItem>
              <MenuItem onClick={() => setDialog("move")}>Mover para…</MenuItem>
            </>
          ) : null}
          <MenuItem onClick={props.onNewThread}>Nova thread aqui</MenuItem>
          {props.canWrite ? (
            <>
              <MenuSeparator />
              <MenuItem variant="destructive" onClick={() => setDialog("delete")}>
                Excluir
              </MenuItem>
            </>
          ) : null}
        </MenuPopup>
      </Menu>
      {dialog === "add" ? (
        <WorkTitleDialog
          title={`Novo submódulo em ${title}`}
          submitLabel="Criar"
          onSubmit={props.onAddChild}
          onClose={close}
        />
      ) : null}
      {dialog === "rename" ? (
        <WorkTitleDialog
          title="Renomear módulo"
          submitLabel="Salvar"
          initialValue={title}
          onSubmit={props.onRename}
          onClose={close}
        />
      ) : null}
      {dialog === "move" ? (
        <MoveDialog
          node={props.node}
          projectNodes={props.projectNodes}
          onMove={props.onMove}
          onClose={close}
        />
      ) : null}
      <AlertDialog
        open={dialog === "delete"}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {descendants === 0
                ? `Excluir ${title}?`
                : `Excluir ${title} e ${descendants} submódulos?`}
            </AlertDialogTitle>
            <AlertDialogDescription>As threads ligadas continuam existindo.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>Cancelar</AlertDialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                close();
                props.onDelete();
              }}
            >
              Excluir
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
