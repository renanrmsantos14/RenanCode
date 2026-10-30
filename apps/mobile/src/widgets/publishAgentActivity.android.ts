import { requireOptionalNativeModule } from "expo";
import * as Linking from "expo-linking";
import type { AgentActivityWidgetProps } from "./AgentActivityWidget.android";

let tapUrl: string | undefined;
let listening = false;

export async function publishAgentActivity(props: AgentActivityWidgetProps) {
  if (!requireOptionalNativeModule("ExpoWidgets")) return;
  const [{ default: widget }, { addUserInteractionListener }] = await Promise.all([
    import("./AgentActivityWidget.android"),
    import("expo-widgets"),
  ]);
  const top = props.activities?.[0];
  tapUrl = Linking.createURL(top ? top.deepLink.replace(/^\//, "") : "");
  if (!listening) {
    // expo-widgets lacks Android widgetURL. Button events need a live JS runtime to open the app.
    listening = true;
    addUserInteractionListener((event) => {
      if (event.source === "AgentActivity" && tapUrl) void Linking.openURL(tapUrl);
    });
  }
  widget.updateSnapshot(props);
}
