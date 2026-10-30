import type { MascotState } from "@t3tools/client-runtime/mascot";
import type { ImageSourcePropType } from "react-native";

export const MASCOT_SOURCES: Record<Exclude<MascotState, "idle">, ImageSourcePropType> = {
  done: require("../../../../../assets/mascot/done.png"),
  error: require("../../../../../assets/mascot/error.png"),
  needsYou: require("../../../../../assets/mascot/needs-you.png"),
  offline: require("../../../../../assets/mascot/offline.png"),
  thinking: require("../../../../../assets/mascot/thinking.png"),
  welcome: require("../../../../../assets/mascot/welcome.png"),
  working: require("../../../../../assets/mascot/working.png"),
};
