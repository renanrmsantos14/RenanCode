import { mcpServerRequestDisplay } from "@t3tools/client-runtime/mcp-server-request";
import { isAtomCommandInterrupted } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, OrchestrationV2ProjectedTurnItem } from "@t3tools/contracts";
import { useRef, useState } from "react";
import { View, type ColorValue } from "react-native";

import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";

/** Feed card for an agent asking the user to switch on an MCP server its thread has off. */
export function McpServerRequestCard(props: {
  readonly environmentId: EnvironmentId;
  readonly projectedItem: OrchestrationV2ProjectedTurnItem;
  readonly iconColor: ColorValue;
}) {
  const { item, visibility } = props.projectedItem;
  const answer = useAtomCommand(threadEnvironment.answerMcpServerRequest, {
    label: "answer MCP server request",
  });
  const [answering, setAnswering] = useState(false);
  const [failed, setFailed] = useState(false);
  // A second tap can land before the re-render that disables the buttons.
  const inFlight = useRef(false);
  if (item.type !== "mcp_server_request") return null;

  const display = mcpServerRequestDisplay(item, visibility);
  if (display.kind !== "pending") {
    return (
      <View className="mb-3 min-h-9 flex-row items-center gap-2 px-1">
        <SymbolView
          name={
            display.kind === "pending-elsewhere"
              ? "cable.connector"
              : display.enabled
                ? "checkmark"
                : "minus"
          }
          size={13}
          tintColor={props.iconColor}
          type="monochrome"
        />
        <Text className="flex-1 font-sans text-sm text-foreground-muted" numberOfLines={2}>
          {item.server} · {display.label}
        </Text>
      </View>
    );
  }

  const send = async (enable: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setAnswering(true);
    setFailed(false);
    const result = await answer({
      environmentId: props.environmentId,
      input: { threadId: item.threadId, turnItemId: item.id, enable },
    }).finally(() => {
      inFlight.current = false;
      setAnswering(false);
    });
    setFailed(result._tag === "Failure" && !isAtomCommandInterrupted(result));
  };

  return (
    <View className="mb-3 gap-3 rounded-[20px] border border-border bg-card-alt p-4">
      <View className="gap-1">
        <Text className="font-t3-bold text-base text-foreground">Turn on {item.server}?</Text>
        {item.reason.trim() ? (
          <Text className="font-sans text-sm leading-5 text-foreground-muted">{item.reason}</Text>
        ) : null}
      </View>
      {failed ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="font-sans text-sm text-danger-foreground"
        >
          Could not send your answer. Try again.
        </Text>
      ) : null}
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button
            label="Not now"
            tone="secondary"
            fullWidth
            disabled={answering}
            onPress={() => void send(false)}
          />
        </View>
        <View className="flex-1">
          <Button
            label="Turn on"
            tone="primary"
            fullWidth
            disabled={answering}
            onPress={() => void send(true)}
          />
        </View>
      </View>
    </View>
  );
}
