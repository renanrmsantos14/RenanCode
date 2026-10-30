import Constants from "expo-constants";
import { Platform } from "react-native";
import { supportsAndroidAgentNotifications } from "./androidNotifications";

export function supportsAgentAwarenessPush() {
  return Platform.OS === "android"
    ? supportsAndroidAgentNotifications() && Constants.expoConfig?.extra?.androidRemotePush === true
    : Platform.OS === "ios" && Constants.expoConfig?.extra?.iosPersonalTeamBuild !== true;
}

// Builds without remote push (no Firebase config, personal-team iOS) alert from the app's own connection.
export function usesLocalAgentAlerts() {
  return (Platform.OS === "android" || Platform.OS === "ios") && !supportsAgentAwarenessPush();
}
