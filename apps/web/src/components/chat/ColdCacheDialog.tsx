import {
  AlertDialog,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { formatContextWindowCost } from "./ContextWindowMeter.logic";

export type ColdCacheChoice = "send" | "compact" | "handoff" | "cancel";

export interface ColdCachePrompt {
  readonly usedTokens: number;
  readonly costUsd: number | null;
  readonly canCompact: boolean;
  readonly canHandoff: boolean;
}

export function ColdCacheDialog(props: {
  readonly prompt: ColdCachePrompt | null;
  readonly onChoose: (choice: ColdCacheChoice) => void;
}) {
  const { prompt, onChoose } = props;
  return (
    <AlertDialog
      open={prompt !== null}
      onOpenChange={(open) => {
        if (!open) onChoose("cancel");
      }}
    >
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Cache expired
            {prompt?.costUsd == null
              ? ""
              : ` · estimated re-read ${formatContextWindowCost({ amount: prompt.costUsd, currency: "USD" })}`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            This thread has about {prompt?.usedTokens.toLocaleString("en-US")} tokens and its prompt
            cache expired, so sending re-reads the whole history at full price. The cost is an
            estimate.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onChoose("cancel")}>
            Cancel
          </Button>
          {prompt?.canHandoff ? (
            <Button variant="outline" onClick={() => onChoose("handoff")}>
              Handoff
            </Button>
          ) : null}
          {prompt?.canCompact ? (
            <Button variant="outline" onClick={() => onChoose("compact")}>
              Compact
            </Button>
          ) : null}
          <Button onClick={() => onChoose("send")}>Send anyway</Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
