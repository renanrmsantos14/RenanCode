import type { MascotGesture, MascotState } from "@t3tools/client-runtime/mascot";
import type { ImageSourcePropType } from "react-native";

export const MASCOT_SOURCES: Record<MascotState, ImageSourcePropType> = {
  done: require("../../../../../assets/mascot/done.png"),
  error: require("../../../../../assets/mascot/error.png"),
  idle: require("../../../../../assets/mascot/idle.png"),
  needsYou: require("../../../../../assets/mascot/needs-you.png"),
  offline: require("../../../../../assets/mascot/offline.png"),
  thinking: require("../../../../../assets/mascot/thinking.png"),
  welcome: require("../../../../../assets/mascot/welcome.png"),
  working: require("../../../../../assets/mascot/working.png"),
};

export const MASCOT_GESTURE_SOURCES: Record<MascotGesture, ImageSourcePropType> = {
  cube: require("../../../../../assets/mascot/gesture-cube.png"),
  coffee: require("../../../../../assets/mascot/gesture-coffee.png"),
  glasses: require("../../../../../assets/mascot/gesture-glasses.png"),
  stretch: require("../../../../../assets/mascot/gesture-stretch.png"),
};
