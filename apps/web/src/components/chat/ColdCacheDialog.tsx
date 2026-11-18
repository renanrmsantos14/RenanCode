import { T, useGT } from "gt-react";

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
  const gt = useGT();
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
            {prompt?.costUsd == null
              ? gt("Cache expired")
              : gt("Cache expired · estimated re-read {cost}", {
                  cost: formatContextWindowCost({ amount: prompt.costUsd, currency: "USD" }),
                })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {gt(
              "This thread has about {tokens} tokens and its prompt cache expired, so sending re-reads the whole history at full price. The cost is an estimate.",
              { tokens: prompt?.usedTokens.toLocaleString("en-US") ?? "" },
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onChoose("cancel")}>
            <T>Cancel</T>
          </Button>
          {prompt?.canHandoff ? (
            <Button variant="outline" onClick={() => onChoose("handoff")}>
              <T>Handoff</T>
            </Button>
          ) : null}
          {prompt?.canCompact ? (
            <Button variant="outline" onClick={() => onChoose("compact")}>
              <T>Compact</T>
            </Button>
          ) : null}
          <Button onClick={() => onChoose("send")}>
            <T>Send anyway</T>
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
