import type { MascotGesture, MascotState } from "@t3tools/client-runtime/mascot";

import doneUrl from "../../../../../assets/mascot/done.png";
import errorUrl from "../../../../../assets/mascot/error.png";
import cubeUrl from "../../../../../assets/mascot/gesture-cube.png";
import coffeeUrl from "../../../../../assets/mascot/gesture-coffee.png";
import glassesUrl from "../../../../../assets/mascot/gesture-glasses.png";
import stretchUrl from "../../../../../assets/mascot/gesture-stretch.png";
import idleUrl from "../../../../../assets/mascot/idle.png";
import needsYouUrl from "../../../../../assets/mascot/needs-you.png";
import offlineUrl from "../../../../../assets/mascot/offline.png";
import thinkingUrl from "../../../../../assets/mascot/thinking.png";
import welcomeUrl from "../../../../../assets/mascot/welcome.png";
import workingUrl from "../../../../../assets/mascot/working.png";

export const MASCOT_URLS: Record<MascotState, string> = {
  done: doneUrl,
  error: errorUrl,
  idle: idleUrl,
  needsYou: needsYouUrl,
  offline: offlineUrl,
  thinking: thinkingUrl,
  welcome: welcomeUrl,
  working: workingUrl,
};

export const MASCOT_GESTURE_URLS: Record<MascotGesture, string> = {
  cube: cubeUrl,
  coffee: coffeeUrl,
  glasses: glassesUrl,
  stretch: stretchUrl,
};
