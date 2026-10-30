import type { MascotState } from "@t3tools/client-runtime/mascot";

import doneUrl from "../../../../../assets/mascot/done.png";
import errorUrl from "../../../../../assets/mascot/error.png";
import needsYouUrl from "../../../../../assets/mascot/needs-you.png";
import offlineUrl from "../../../../../assets/mascot/offline.png";
import thinkingUrl from "../../../../../assets/mascot/thinking.png";
import welcomeUrl from "../../../../../assets/mascot/welcome.png";
import workingUrl from "../../../../../assets/mascot/working.png";

export const MASCOT_URLS: Record<Exclude<MascotState, "idle">, string> = {
  done: doneUrl,
  error: errorUrl,
  needsYou: needsYouUrl,
  offline: offlineUrl,
  thinking: thinkingUrl,
  welcome: welcomeUrl,
  working: workingUrl,
};
