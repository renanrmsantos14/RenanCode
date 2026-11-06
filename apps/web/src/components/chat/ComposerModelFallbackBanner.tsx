import type { TimestampFormat } from "@t3tools/contracts/settings";
import { GaugeIcon } from "lucide-react";

import { formatUpcomingTimestamp } from "../../timestampFormat";
import { Button } from "../ui/button";
import type { ComposerBannerStackItem } from "./ComposerBannerStack";

export function modelFallbackBannerItem({
  fallbackModelName,
  defaultProviderName,
  defaultModelName,
  resetsAt,
  timestampFormat,
  onUseDefault,
  onDismiss,
}: {
  readonly fallbackModelName: string;
  readonly defaultProviderName: string;
  readonly defaultModelName: string;
  readonly resetsAt: string | null;
  readonly timestampFormat: TimestampFormat;
  readonly onUseDefault: () => void;
  readonly onDismiss: () => void;
}): ComposerBannerStackItem {
  return {
    id: "fallback-model",
    variant: "info",
    icon: <GaugeIcon />,
    title: `Using ${fallbackModelName}`,
    description: `${defaultProviderName} is out of usage${resetsAt ? ` · resets ${formatUpcomingTimestamp(resetsAt, timestampFormat)}` : ""}`,
    actions: (
      <Button size="xs" variant="ghost" onClick={onUseDefault}>
        Use {defaultModelName}
      </Button>
    ),
    dismissLabel: "Dismiss fallback model notice",
    onDismiss,
  };
}
