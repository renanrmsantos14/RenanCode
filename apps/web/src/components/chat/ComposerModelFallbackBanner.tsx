import type { TimestampFormat } from "@t3tools/contracts/settings";
import { GaugeIcon } from "lucide-react";
import { msg } from "gt-react";

import type { MessageResolver } from "../../i18n/messages";

import { formatUpcomingTimestamp } from "../../timestampFormat";
import { Button } from "../ui/button";
import type { ComposerBannerStackItem } from "./ComposerBannerStack";

export function modelFallbackBannerItem(
  {
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
  },
  m: MessageResolver,
): ComposerBannerStackItem {
  return {
    id: "fallback-model",
    variant: "info",
    icon: <GaugeIcon />,
    title: m(msg("Using {model}"), { model: fallbackModelName }),
    description: resetsAt
      ? m(msg("{provider} is out of usage · resets {time}"), {
          provider: defaultProviderName,
          time: formatUpcomingTimestamp(resetsAt, timestampFormat),
        })
      : m(msg("{provider} is out of usage"), { provider: defaultProviderName }),
    actions: (
      <Button size="xs" variant="ghost" onClick={onUseDefault}>
        {m(msg("Use {model}"), { model: defaultModelName })}
      </Button>
    ),
    dismissLabel: m(msg("Dismiss fallback model notice")),
    onDismiss,
  };
}
